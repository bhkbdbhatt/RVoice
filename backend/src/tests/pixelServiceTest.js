// ============================================================
// backend/src/tests/pixelServiceTest.js
// Unit tests for the tracking pixel service.
// Follows the existing assert/passed/failed convention.
// ============================================================
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getTransparentGif,
  parsePixelParams,
  generatePixelExternalId,
  buildPixelItem,
  generatePixelScript,
  processPixelHit,
} from '../services/pixelService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency_keys.json');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

// ------------------------------------------------------------
// 1. Transparent GIF
// ------------------------------------------------------------
function testGif() {
  console.log('\n1. Transparent GIF');

  const gif = getTransparentGif();
  assert(Buffer.isBuffer(gif), 'returns a Buffer');
  assert(gif.length === 43, `GIF length === 43 bytes (got ${gif.length})`);
  assert(
    gif.subarray(0, 6).toString('latin1') === 'GIF89a',
    `magic header is GIF89a (got '${gif.subarray(0, 6).toString('latin1')}')`,
  );
  assert(gif[gif.length - 1] === 0x3b, 'ends with trailer 0x3B');
}

// ------------------------------------------------------------
// 2. Query parsing
// ------------------------------------------------------------
function testParsePixelParams() {
  console.log('\n2. Param parsing');

  const parsed = parsePixelParams({
    cid: 'cid-abcd',
    source: 'store-pixel',
    url: 'https://shop.example.com/checkout?cart=1',
    ref: 'https://google.com',
    lang: 'en-US',
    vp: '1280x720',
    sc: '1920x1080',
    cd: '24',
    co: '1',
    dt: 'Cart',
    product: 'checkout',
    store: 'store-42',
    journeyStage: 'checkout',
    rating: '5',
  });
  assert(parsed.clientId === 'cid-abcd', `clientId parsed (got '${parsed.clientId}')`);
  assert(parsed.rating === 5, `valid rating 5 -> 5 (got ${parsed.rating})`);
  assert(parsed.cookiesEnabled === true, 'cookiesEnabled true');
  assert(parsed.colorDepth === 24, `colorDepth parsed (got ${parsed.colorDepth})`);
  assert(parsed.journeyStage === 'checkout', `journeyStage parsed`);

  const defaults = parsePixelParams({});
  assert(defaults.rating === null, 'missing rating -> null');
  assert(defaults.cookiesEnabled === false, 'missing co -> false');
  assert(defaults.source === null, 'missing source -> null');

  const badRating = parsePixelParams({ rating: 'oops' });
  assert(badRating.rating === null, `invalid rating -> null (got ${badRating.rating})`);
}

// ------------------------------------------------------------
// 3. Idempotency key generation
// ------------------------------------------------------------
function testExternalId() {
  console.log('\n3. External id (dedup key)');

  const a = generatePixelExternalId({ clientId: 'cid-1', pageUrl: 'https://shop.example.com/p' });
  const b = generatePixelExternalId({ clientId: 'cid-1', pageUrl: 'https://shop.example.com/p' });
  assert(a === b, 'same client + url -> same id');
  const c = generatePixelExternalId({ clientId: 'cid-1', pageUrl: 'https://shop.example.com/other' });
  assert(a !== c, 'different url -> different id');
  assert(/^pixel_/.test(a), `prefixed with pixel_ (got '${a}')`);
}

// ------------------------------------------------------------
// 4. Canonical item building
// ------------------------------------------------------------
function testBuildItem() {
  console.log('\n4. Canonical item building');

  const item = buildPixelItem(
    {
      clientId: 'cid-123',
      pageUrl: 'https://shop.example.com/checkout',
      referrer: 'https://google.com',
      source: 'store-pixel',
      product: 'checkout',
      store: 'store-42',
      journeyStage: 'checkout',
    },
    { 'user-agent': 'TestAgent', 'x-forwarded-for': '203.0.113.7' },
    { ip: '203.0.113.7' },
  );

  assert(item.source === 'store-pixel', `source mapped (got '${item.source}')`);
  assert(item.origin === 'pixel', `origin mapped (got '${item.origin}')`);
  assert(item.customer.externalId === 'cid-123', `customer.externalId mapped`);
  assert(item.text.includes('Pixel visit'), `text starts with 'Pixel visit' (got '${item.text}')`);
  assert(item.text.includes('/checkout'), `text contains pathname (got '${item.text}')`);
  assert(item.text.includes('google.com'), `text contains referrer host (got '${item.text}')`);
  assert(item.product === 'checkout', `product mapped (got '${item.product}')`);
  assert(item.metadata.pixel === true, 'metadata.pixel flag set');
  assert(item.metadata.clientIp === '203.0.113.7', `metadata.clientIp mapped`);
  assert(item.metadata.userAgent === 'TestAgent', `metadata.userAgent mapped`);
  assert(/^pixel_/.test(item.externalId), `externalId prefixed (got '${item.externalId}')`);
}

// ------------------------------------------------------------
// 5. Defaults / edge cases
// ------------------------------------------------------------
function testDefaults() {
  console.log('\n5. Defaults');

  const item = buildPixelItem({});
  assert(item.source === 'web-pixel', `default source 'web-pixel' (got '${item.source}')`);
  assert(item.origin === 'pixel', `default origin (got '${item.origin}')`);
  assert(item.rating === null, 'rating null when omitted');
  assert(/^anon-/.test(item.customer.externalId), `fallback client id anon- (got '${item.customer.externalId}')`);
  assert(item.text.includes('direct'), `no referrer -> 'direct' (got '${item.text}')`);
}

// ------------------------------------------------------------
// 6. Embeddable script generation
// ------------------------------------------------------------
function testScript() {
  console.log('\n6. Pixel script generation');

  const script = generatePixelScript();
  assert(typeof script === 'string' && script.length > 500, 'script is a non-trivial string');
  assert(script.includes('/api/pixel?'), 'contains pixel endpoint');
  assert(script.includes('_rv_pixel_cid'), 'contains client-id cookie name');
  assert(script.includes('data-pixel-endpoint'), 'supports endpoint override');
  assert(script.includes('encodeURIComponent'), 'encodes query params');
  assert(script.includes('\\\\') === false, 'no double-backslash leftovers from template literal');
}

// ------------------------------------------------------------
// 7. Async ingestion pipeline (with cleanup)
// ------------------------------------------------------------
async function cleanupPixelRecords() {
  try {
    const text = await fs.readFile(FEEDBACK_FILE, 'utf8');
    const records = JSON.parse(text);
    const next = records.filter((r) => !(r.metadata && r.metadata.pixel === true));
    await fs.writeFile(FEEDBACK_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // file may not exist on a fresh clone — nothing to clean
  }
  try {
    const text = await fs.readFile(IDEMPOTENCY_FILE, 'utf8');
    const keys = JSON.parse(text);
    const next = {};
    for (const [hash, rec] of Object.entries(keys)) {
      if (rec && typeof rec.externalId === 'string' && rec.externalId.startsWith('pixel_')) {
        continue;
      }
      next[hash] = rec;
    }
    await fs.writeFile(IDEMPOTENCY_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // ignore
  }
}

async function testProcessPixelHit() {
  console.log('\n7. Async ingestion pipeline');

  const cid = `cid-test-${Date.now().toString(36)}`;
  const url = `https://shop.example.com/landing?x=${Date.now()}`;

  const first = await processPixelHit(
    { cid, url, ref: 'https://google.com', source: 'web-pixel' },
    { 'user-agent': 'UnitTest' },
  );
  assert(first.ingested === 1, `first call ingests 1 (got ${first.ingested})`);

  const second = await processPixelHit(
    { cid, url, ref: 'https://google.com', source: 'web-pixel' },
    { 'user-agent': 'UnitTest' },
  );
  assert(second.duplicate === true, `second call is a duplicate (got ${JSON.stringify(second)})`);
}

// ------------------------------------------------------------
async function runAll() {
  testGif();
  testParsePixelParams();
  testExternalId();
  testBuildItem();
  testDefaults();
  testScript();
  await testProcessPixelHit();
  await cleanupPixelRecords();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runAll().catch((error) => {
  console.error(error);
  process.exit(1);
});