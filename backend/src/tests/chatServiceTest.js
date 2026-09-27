import { classifyIntent, extractEntities } from '../services/chatNlpService.js';
import { createSession } from '../services/chatHistoryService.js';

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

function testIntentClassification() {
  console.log('\n1. Intent classification');

  const countFeedback = classifyIntent('How many feedback items do we have?');
  assert(countFeedback.intent === 'count.feedback', `"How many feedback items do we have?" → count.feedback (got '${countFeedback.intent}')`);
  assert(countFeedback.confidence >= 0.3, `count.feedback confidence >= 0.3 (got ${countFeedback.confidence})`);
  assert(countFeedback.fallback === false, `count.feedback fallback === false (got ${countFeedback.fallback})`);

  const negativeThemes = classifyIntent('Show me negative themes');
  assert(negativeThemes.intent === 'themes.list', `"Show me negative themes" → themes.list (got '${negativeThemes.intent}')`);

  const pendingActions = classifyIntent('What are the pending actions?');
  assert(pendingActions.intent === 'actions.list', `"What are the pending actions?" → actions.list (got '${pendingActions.intent}')`);
  assert(pendingActions.entities.status === 'pending', `pending actions → entity status 'pending' (got '${pendingActions.entities.status}')`);

  const overview = classifyIntent('Give me an overview');
  assert(overview.intent === 'overview', `"Give me an overview" → overview (got '${overview.intent}')`);

  const help = classifyIntent('help');
  assert(help.intent === 'help', `"help" → help (got '${help.intent}')`);

  const fallback = classifyIntent('What is the meaning of life?');
  assert(fallback.fallback === true, `"What is the meaning of life?" → fallback true (got ${fallback.fallback})`);
}

function testEntityExtraction() {
  console.log('\n2. Entity extraction');

  const store = extractEntities('feedback from store-42', 'feedback.list');
  assert(store.store === 'store-42', `"feedback from store-42" → store 'store-42' (got '${store.store}')`);

  const checkout = extractEntities('checkout issues', 'feedback.by_product');
  assert(checkout.product === 'checkout', `"checkout issues" → product 'checkout' (got '${checkout.product}')`);

  const delivery = extractEntities('delivery feedback', 'feedback.by_product');
  assert(delivery.product === 'delivery', `"delivery feedback" → product 'delivery' (got '${delivery.product}')`);
}

async function testSessionManagement() {
  console.log('\n3. Session management');

  const sessionId = await createSession();
  assert(typeof sessionId === 'string' && sessionId.length > 0, `createSession() returns a non-empty string (got '${sessionId}')`);
  assert(sessionId.includes('-'), `createSession() returns a UUID-like string (got '${sessionId}')`);
}

async function runAll() {
  testIntentClassification();
  testEntityExtraction();
  await testSessionManagement();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
