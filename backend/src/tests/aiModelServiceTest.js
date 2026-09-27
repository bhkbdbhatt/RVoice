import { isMlAvailable } from '../services/aiModelService.js';
import { analyzeSentimentMl } from '../services/aiSentimentService.js';
import { extractThemesMl } from '../services/aiThemeService.js';
import { categorizeIssueMl } from '../services/aiIssueService.js';
import { analyzeSentimentEnhanced } from '../services/nlpService.js';
import { categorizeFeedbackItemEnhanced } from '../services/categorizationService.js';
import { detectSpikesEnhanced } from '../services/detectionService.js';

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

async function testMlAvailability() {
  console.log('\n1. ML availability');
  const available = await isMlAvailable();
  console.log(`  INFO: ML layer available = ${available}`);
  // This is informational; we don't fail if ML is not installed
  assert(typeof available === 'boolean', 'isMlAvailable() returns a boolean');
}

async function testSentimentMl() {
  console.log('\n2. ML sentiment analysis');

  const positive = await analyzeSentimentMl('Great product, excellent quality');
  if (positive) {
    assert(positive.sentiment === 'positive', `Positive text → 'positive' (got '${positive.sentiment}')`);
    assert(positive.score > 0, `Positive text → score > 0 (got ${positive.score})`);
    assert(positive.confidence > 0, `Positive text → confidence > 0 (got ${positive.confidence})`);
    assert(typeof positive.model === 'string', `Positive text → has model (got '${positive.model}')`);
  } else {
    console.log('  SKIP: ML not available, skipping sentiment assertions');
  }

  const negative = await analyzeSentimentMl('Terrible service, awful experience');
  if (negative) {
    assert(negative.sentiment === 'negative', `Negative text → 'negative' (got '${negative.sentiment}')`);
    assert(negative.score < 0, `Negative text → score < 0 (got ${negative.score})`);
  } else {
    console.log('  SKIP: ML not available, skipping negative sentiment assertions');
  }

  const empty = await analyzeSentimentMl('');
  assert(empty === null, 'Empty text → null');
}

async function testThemeMl() {
  console.log('\n3. ML theme extraction');

  const result = await extractThemesMl('The checkout process was slow and the payment failed');
  if (result) {
    assert(Array.isArray(result.themes) && result.themes.length > 0, `Theme extraction → returns themes (got ${result.themes.length})`);
    assert(result.themes[0].label.length > 0, `Theme extraction → top theme has label (got '${result.themes[0].label}')`);
    assert(result.themes[0].score > 0, `Theme extraction → top theme score > 0 (got ${result.themes[0].score})`);
    assert(result.confidence > 0, `Theme extraction → confidence > 0 (got ${result.confidence})`);
    assert(typeof result.model === 'string', `Theme extraction → has model (got '${result.model}')`);
  } else {
    console.log('  SKIP: ML not available, skipping theme assertions');
  }

  const empty = await extractThemesMl('');
  assert(empty === null, 'Empty text → null');
}

async function testIssueMl() {
  console.log('\n4. ML issue categorization');

  const result = await categorizeIssueMl('My package was delayed by three days and never arrived');
  if (result) {
    assert(typeof result.category === 'string' && result.category.length > 0, `Issue categorization → has category (got '${result.category}')`);
    assert(result.confidence > 0, `Issue categorization → confidence > 0 (got ${result.confidence})`);
    assert(typeof result.model === 'string', `Issue categorization → has model (got '${result.model}')`);
  } else {
    console.log('  SKIP: ML not available, skipping issue assertions');
  }

  const empty = await categorizeIssueMl('');
  assert(empty === null, 'Empty text → null');
}

async function testEnhancedSentiment() {
  console.log('\n5. Enhanced sentiment (rule-based + ML blend)');

  const result = await analyzeSentimentEnhanced('Great product, excellent quality');
  assert(result.sentiment === 'positive', `Enhanced → sentiment 'positive' (got '${result.sentiment}')`);
  assert(result.score > 0, `Enhanced → score > 0 (got ${result.score})`);
  assert(Array.isArray(result.aspects), `Enhanced → aspects is array (got ${typeof result.aspects})`);
  assert(typeof result.ml === 'boolean', `Enhanced → ml flag is boolean (got ${typeof result.ml})`);
}

async function testEnhancedCategorization() {
  console.log('\n6. Enhanced categorization (rule-based + ML blend)');

  const result = await categorizeFeedbackItemEnhanced({ text: 'The checkout process was slow and the payment failed' });
  assert(typeof result.journeyStage === 'string', `Enhanced categorization → has journeyStage (got '${result.journeyStage}')`);
  assert(typeof result.ml === 'boolean', `Enhanced categorization → ml flag is boolean (got ${typeof result.ml})`);
}

async function testEnhancedDetection() {
  console.log('\n7. Enhanced spike detection (rule-based + ML blend)');

  const themes = [
    {
      themeId: 'theme-1',
      sourceId: 'source-1',
      text: 'The checkout process was slow and the payment failed',
      aspects: [
        { aspect: 'checkout', sentiment: 'negative', score: -0.8, confidence: 0.9 },
        { aspect: 'payment', sentiment: 'negative', score: -0.7, confidence: 0.8 },
      ],
    },
  ];

  const spikes = await detectSpikesEnhanced(themes);
  assert(Array.isArray(spikes), 'Enhanced detection → returns array');
  if (spikes.length > 0) {
    assert(typeof spikes[0].ml === 'boolean', `Enhanced detection → ml flag is boolean (got ${typeof spikes[0].ml})`);
  }
}

async function runAll() {
  await testMlAvailability();
  await testSentimentMl();
  await testThemeMl();
  await testIssueMl();
  await testEnhancedSentiment();
  await testEnhancedCategorization();
  await testEnhancedDetection();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();