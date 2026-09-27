// ============================================================
// backend/src/services/pixelService.js
// Tracking pixel — anonymous web analytics ingestion for RVoice.
//
// A classic 1x1 transparent GIF pixel that any website can embed.
// The backend answers the pixel request with the GIF immediately and
// asynchronously funnels the captured visit data into the canonical
// feedback pipeline so it appears in the VoC dashboard alongside
// Zendesk, App Store, Intercom and other channels.
//
//   Embed:
//     <script src="https://HOST/api/pixel.js"
//             data-source="web-pixel"
//             data-product="checkout"></script>
//
//   Flow:
//     browser -> GET /api/pixel?cid=..&url=..&ref=..&vp=..
//     server  -> returns 1x1 GIF (never blocks the page)
//     server  -> async: parse -> build canonical item -> PII mask
//                -> deduplicate (cid+url+minute) -> persist
// ============================================================
import { createHash } from 'crypto';
import { config } from '../config/env.js';
import { maskPIIInItem } from './piiService.js';
import { deduplicate, recordIdempotencyKey } from '../ingestion/idempotencyService.js';
import { upsertFeedbackBatch } from '../repositories/feedbackRepository.js';

const DEFAULT_SOURCE = 'web-pixel';
const ORIGIN = 'pixel';
const CLIENT_ID_MAX = 64;
const URL_HASH_LEN = 8;

// 1x1 transparent GIF89a — the classic tracking-pixel payload (43 bytes).
const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
  0x01, 0x00, 0x01, 0x00,             // logical screen width=1 height=1
  0x80, 0x00, 0x00,                   // packed: global color table, 2 colors
  0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, // color table (transparent, white)
  0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, // graphic control extension
  0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // image descriptor
  0x02, 0x02, 0x44, 0x01, 0x00,       // LZW-minified pixel data
  0x3B,                               // trailer
]);

/**
 * The 1x1 transparent GIF served to the browser.
 * @returns {Buffer}
 */
export function getTransparentGif() {
  return GIF_BYTES;
}

// ------------------------------------------------------------
// Query parsing
// ------------------------------------------------------------

/**
 * Parse the pixel query string into a structured params object.
 * @param {Object} query - Express req.query
 * @returns {Object}
 */
export function parsePixelParams(query = {}) {
  const ratingRaw = query.rating;
  let rating = null;
  if (ratingRaw !== undefined && ratingRaw !== null && ratingRaw !== '') {
    const num = Number(ratingRaw);
    if (Number.isInteger(num) && num >= 1 && num <= 5) {
      rating = num;
    }
  }

  return {
    clientId: query.cid || query.clientId || null,
    source: query.source || null,
    pageUrl: query.url || query.pageUrl || null,
    referrer: query.ref || query.referrer || null,
    language: query.lang || query.language || null,
    viewport: query.vp || null,
    screen: query.sc || null,
    colorDepth: query.cd ? (parseInt(query.cd, 10) || null) : null,
    cookiesEnabled: query.co === '1' || query.co === 'true',
    pageTitle: query.dt || null,
    product: query.product || null,
    store: query.store || null,
    journeyStage: query.journeyStage || query.js || null,
    rating,
  };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sanitizeClientId(raw) {
  if (!raw) return 'anon';
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, CLIENT_ID_MAX);
}

function hashHex(input) {
  return createHash('sha256').update(String(input || '')).digest('hex');
}

function generateArbitraryClientId({ ip, userAgent } = {}) {
  const seed = `${ip || ''}:${userAgent || ''}:${Date.now()}`;
  return `anon-${hashHex(seed).slice(0, 12)}`;
}

function minuteBucket() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Deterministic idempotency key: pixel_<cid>_<url hash 8>_<minute bucket>
 * Deduplicates rapid double-fires for the same client on the same URL
 * while still capturing genuine re-visits in later minutes.
 * @param {Object} params - { clientId, pageUrl }
 * @returns {string}
 */
export function generatePixelExternalId({ clientId, pageUrl } = {}) {
  const cid = sanitizeClientId(clientId);
  const urlHash = hashHex(pageUrl || '').slice(0, URL_HASH_LEN);
  return `pixel_${cid}_${urlHash}_${minuteBucket()}`;
}

// ------------------------------------------------------------
// Canonical item building
// ------------------------------------------------------------

/**
 * Build a canonical feedback item from pixel params + HTTP headers.
 * @param {Object} params - parsed pixel params
 * @param {Object} headers - Express req.headers
 * @param {Object} options - { ip }
 * @returns {Object}
 */
export function buildPixelItem(params = {}, headers = {}, options = {}) {
  const rawClientId = sanitizeClientId(params.clientId);
  const clientId = rawClientId !== 'anon'
    ? rawClientId
    : generateArbitraryClientId({
        ip: options.ip || headers['x-forwarded-for'],
        userAgent: headers['user-agent'],
      });

  const pageUrl = params.pageUrl || '';
  let pathname = '/';
  try {
    pathname = new URL(pageUrl).pathname || '/';
  } catch {
    const match = String(pageUrl).match(/^https?:\/\/[^/]+([^?#]*)/);
    if (match && match[1]) pathname = match[1];
    else if (pageUrl) pathname = pageUrl;
  }

  const referrer = params.referrer || '';
  let referrerHost = 'direct';
  if (referrer) {
    try {
      referrerHost = new URL(referrer).host || referrer;
    } catch {
      referrerHost = referrer;
    }
  }

  const externalId = generatePixelExternalId({ clientId, pageUrl });

  const forwardedFor = headers['x-forwarded-for'];
  const clientIp = options.ip
    || (forwardedFor ? String(forwardedFor).split(',')[0].trim() : null);

  const text = `Pixel visit: ${pathname || '/'} from ${referrerHost}`;

  return {
    externalId,
    source: params.source || DEFAULT_SOURCE,
    origin: ORIGIN,
    customer: {
      externalId: clientId,
      email: null,
      name: null,
    },
    text,
    rating: params.rating || null,
    product: params.product || null,
    store: params.store || null,
    journeyStage: params.journeyStage || null,
    receivedAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    metadata: {
      pixel: true,
      clientId,
      userAgent: headers['user-agent'] || null,
      clientIp: clientIp || null,
      pageUrl: pageUrl || null,
      pageTitle: params.pageTitle || null,
      referrer: referrer || null,
      language: params.language || null,
      viewport: params.viewport || null,
      screen: params.screen || null,
      colorDepth: params.colorDepth || null,
      cookiesEnabled: Boolean(params.cookiesEnabled),
    },
  };
}

// ------------------------------------------------------------
// Ingestion pipeline
// ------------------------------------------------------------

/**
 * Full async processing of a pixel hit: parse -> build -> PII mask
 * -> deduplicate -> persist -> record idempotency key.
 * Best-effort, never throws for bad params; returns a result object.
 * @param {Object} query - Express req.query
 * @param {Object} headers - Express req.headers
 * @param {Object} options - { ip }
 * @returns {Promise<{ingested: number, ignored: boolean, duplicate: boolean, item: ?Object}>}
 */
export async function processPixelHit(query = {}, headers = {}, options = {}) {
  if (!config.pixel.enabled || !config.pixel.autoIngest) {
    return { ingested: 0, ignored: true, duplicate: false, item: null };
  }

  const params = parsePixelParams(query);
  const item = buildPixelItem(params, headers, options);

  const maskedItem = config.pii.enabled ? maskPIIInItem(item) : item;

  const { unique } = await deduplicate([maskedItem]);
  if (unique.length === 0) {
    return { ingested: 0, ignored: false, duplicate: true, item: maskedItem };
  }

  const saved = await upsertFeedbackBatch(unique);
  await recordIdempotencyKey({
    source: maskedItem.source,
    externalId: maskedItem.externalId,
    feedbackId: saved[0]?.id || saved[0]?.externalId || null,
  });

  return { ingested: saved.length, ignored: false, duplicate: false, item: saved[0] || maskedItem };
}

// ------------------------------------------------------------
// Embeddable script
// ------------------------------------------------------------

/**
 * The embeddable tracking snippet served at /api/pixel.js.
 * Auto-detects its own base URL, reads data-* config from the script tag,
 * maintains a first-party client id cookie, captures browser context and
 * fires an invisible 1x1 image to /api/pixel.
 * ES5-safe and dependency-free so it works on any website.
 * Keep in sync with frontend/public/pixel.js.
 * @returns {string}
 */
export function generatePixelScript() {
  return `/*!
 * RVoice tracking pixel v1.0.0
 * Streams anonymous page-view analytics into the RVoice VoC platform.
 *
 * Usage:
 *   <script src="https://YOUR_HOST/api/pixel.js"
 *           data-source="web-pixel"
 *           data-product="checkout"
 *           data-store="store-42"
 *           data-journey-stage="checkout"></script>
 *
 * This snippet is intentionally dependency-free and ES5-safe so it works
 * on any website. Kept in sync with frontend/public/pixel.js.
 */
(function () {
  'use strict';

  function readConfig(script) {
    function attr(name) {
      if (!script) return '';
      var value = script.getAttribute(name);
      return value == null ? '' : String(value).trim();
    }
    var src = script && script.src ? String(script.src) : '';
    var baseUrl = src;
    var qIndex = baseUrl.indexOf('?');
    if (qIndex !== -1) baseUrl = baseUrl.slice(0, qIndex);
    var slash = baseUrl.lastIndexOf('/');
    if (slash !== -1) {
      var file = baseUrl.slice(slash + 1);
      if (/^pixel\\.js(\\.[a-z]+)?$/i.test(file)) {
        baseUrl = baseUrl.slice(0, slash);
      }
    }
    return {
      endpoint: attr('data-pixel-endpoint') || baseUrl,
      source: attr('data-source') || 'web-pixel',
      product: attr('data-product'),
      store: attr('data-store'),
      journeyStage: attr('data-journey-stage') || attr('data-js'),
      rating: attr('data-rating')
    };
  }

  function getClientId() {
    var COOKIE = '_rv_pixel_cid';
    var parts = document.cookie ? document.cookie.split(';') : [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.indexOf(COOKIE + '=') === 0) {
        var existing = decodeURIComponent(part.slice(COOKIE.length + 1));
        if (existing) return existing;
      }
    }
    var newId = 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    document.cookie = COOKIE + '=' + encodeURIComponent(newId) + '; path=/; max-age=31536000; SameSite=Lax';
    return newId;
  }

function fire() {
    var config = readConfig(document.currentScript || null);
    var params = {
      cid: getClientId(),
      url: window.location.href,
      ref: document.referrer || '',
      lang: navigator.language || '',
      vp: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      sc: ((window.screen && window.screen.width) || 0) + 'x' + ((window.screen && window.screen.height) || 0),
      cd: (window.screen && window.screen.colorDepth) || '',
      co: navigator.cookieEnabled ? '1' : '0',
      dt: document.title || ''
    };
    if (config.source) params.source = config.source;
    if (config.product) params.product = config.product;
    if (config.store) params.store = config.store;
    if (config.journeyStage) params.journeyStage = config.journeyStage;
    if (config.rating) params.rating = config.rating;

    var query = 'cid=' + encodeURIComponent(params.cid)
      + '&url=' + encodeURIComponent(params.url)
      + '&ref=' + encodeURIComponent(params.ref)
      + '&lang=' + encodeURIComponent(params.lang)
      + '&vp=' + encodeURIComponent(params.vp)
      + '&sc=' + encodeURIComponent(params.sc)
      + '&cd=' + encodeURIComponent(params.cd)
      + '&co=' + params.co
      + '&dt=' + encodeURIComponent(params.dt);
    if (params.source) query += '&source=' + encodeURIComponent(params.source);
    if (params.product) query += '&product=' + encodeURIComponent(params.product);
    if (params.store) query += '&store=' + encodeURIComponent(params.store);
    if (params.journeyStage) query += '&journeyStage=' + encodeURIComponent(params.journeyStage);
    if (params.rating) query += '&rating=' + encodeURIComponent(params.rating);

    var endpoint = (config.endpoint || '').replace(/\\/+$/, '');
    var url = endpoint + '/api/pixel?' + query;

    var img = new Image(1, 1);
    img.style.display = 'none';
    img.setAttribute('aria-hidden', 'true');
    img.alt = '';
    img.onload = img.onerror = function () {
      img.onload = null;
      img.onerror = null;
      img = null;
    };
    img.src = url;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fire);
  } else {
    fire();
  }
})();
`;
}