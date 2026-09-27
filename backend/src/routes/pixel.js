// ============================================================
// backend/src/routes/pixel.js
// Public tracking pixel endpoints — deliberately NO auth because the
// pixel is embedded in third-party websites that cannot attach JWT or
// local-auth headers. These routes MUST be registered in index.js
// before the /api auth middleware.
//
//   GET /api/pixel       -> 1x1 transparent GIF + async ingestion
//   GET /api/pixel.gif   -> alias of /api/pixel
//   GET /api/pixel.js    -> the embeddable tracking snippet
// ============================================================
import { config } from '../config/env.js';
import {
  getTransparentGif,
  processPixelHit,
  generatePixelScript,
} from '../services/pixelService.js';

/**
 * Serve the 1x1 transparent GIF immediately, then funnel the visit into
 * the VoC ingestion pipeline asynchronously so tracking never delays the
 * visitor's page load and analytics failures never reach the browser.
 */
export function servePixelGif(req, res) {
  const gif = getTransparentGif();
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(gif.length),
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(gif);

  if (!config.pixel.enabled) return;

  setImmediate(() => {
    processPixelHit(req.query, req.headers, { ip: req.ip })
      .then((result) => {
        if (result.ingested > 0) {
          console.log(`[pixel] ingested visit for ${result.item?.metadata?.clientId || result.item?.customer?.externalId || 'unknown'}`);
        }
      })
      .catch((error) => {
        console.error('[pixel] ingestion failed:', error.message);
      });
  });
}

/**
 * Serve the embeddable tracking snippet.
 */
export function servePixelJs(req, res) {
  const script = generatePixelScript();
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(script)),
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
  res.send(script);
}