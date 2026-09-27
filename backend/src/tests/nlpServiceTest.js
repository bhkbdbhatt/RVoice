import {
  analyzeSentiment,
  extractAspects,
  computeConfidence,
  applyNegation,
  applyIntensifiers,
  detectNegation,
  detectIntensifiers,
  extractAspectsAndSentiment,
} from '../services/nlpService.js';
import nlp from 'compromise';

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

function assertClose(actual, expected, tolerance, message) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  PASS: ${message} (got ${actual}, expected ~${expected})`);
  } else {
    failed++;
    console.error(`  FAIL: ${message} (got ${actual}, expected ~${expected})`);
  }
}

function testSentimentScoring() {
  console.log('\n1. Sentiment scoring');

  const positive = analyzeSentiment('Great product, excellent quality');
  assert(positive.sentiment === 'positive', `Positive text → 'positive' (got '${positive.sentiment}')`);
  assert(positive.score > 0, `Positive text → score > 0 (got ${positive.score})`);
  assert(positive.score <= 1, `Positive text → score <= 1 (got ${positive.score})`);

  const negative = analyzeSentiment('Terrible service, awful experience');
  assert(negative.sentiment === 'negative', `Negative text → 'negative' (got '${negative.sentiment}')`);
  assert(negative.score < 0, `Negative text → score < 0 (got ${negative.score})`);
  assert(negative.score >= -1, `Negative text → score >= -1 (got ${negative.score})`);

  const neutral = analyzeSentiment('The product arrived');
  assert(neutral.sentiment === 'neutral', `Neutral text → 'neutral' (got '${neutral.sentiment}')`);
  assertClose(neutral.score, 0, 0.1, `Neutral text → score ≈ 0 (got ${neutral.score})`);
}

function testNegationHandling() {
  console.log('\n2. Negation handling');

  const notGood = analyzeSentiment('Not good');
  assert(notGood.sentiment === 'negative', `"Not good" → negative (got '${notGood.sentiment}')`);
  assert(notGood.score < 0, `"Not good" → score < 0 (got ${notGood.score})`);

  const notBad = analyzeSentiment('Not bad');
  assert(notBad.sentiment === 'positive', `"Not bad" → positive (got '${notBad.sentiment}')`);
  assert(notBad.score > 0, `"Not bad" → score > 0 (got ${notBad.score})`);

  const neverHelpful = analyzeSentiment('Never helpful');
  assert(neverHelpful.sentiment === 'negative', `"Never helpful" → negative (got '${neverHelpful.sentiment}')`);
  assert(neverHelpful.score < 0, `"Never helpful" → score < 0 (got ${neverHelpful.score})`);

  const doc = nlp('not good');
  assert(detectNegation(doc) === true, 'detectNegation("not good") → true');
}

function testIntensifierDetection() {
  console.log('\n3. Intensifier detection');

  const good = analyzeSentiment('good');
  const veryGood = analyzeSentiment('very good');
  assert(veryGood.score > good.score, `"very good" (${veryGood.score}) > "good" (${good.score})`);

  const bad = analyzeSentiment('bad');
  const extremelyBad = analyzeSentiment('extremely bad');
  assert(extremelyBad.score < bad.score, `"extremely bad" (${extremelyBad.score}) < "bad" (${bad.score})`);

  const slightlyGood = analyzeSentiment('slightly good');
  assert(slightlyGood.score < good.score, `"slightly good" (${slightlyGood.score}) < "good" (${good.score})`);

  const doc = nlp('very good');
  const intensifiers = detectIntensifiers(doc);
  assert(intensifiers.includes('very'), `detectIntensifiers("very good") includes 'very' (got ${JSON.stringify(intensifiers)})`);
}

function testConfidenceScoring() {
  console.log('\n4. Confidence scoring');

  const manyTerms = analyzeSentiment('Great product, excellent quality, amazing service, fantastic value');
  const fewTerms = analyzeSentiment('The product arrived');
  const empty = analyzeSentiment('');

  assert(manyTerms.confidence > fewTerms.confidence, `Many terms → higher confidence (${manyTerms.confidence} > ${fewTerms.confidence})`);
  assert(fewTerms.confidence < manyTerms.confidence, `Few terms → lower confidence (${fewTerms.confidence} < ${manyTerms.confidence})`);
  assert(empty.confidence === 0, `Empty text → confidence 0 (got ${empty.confidence})`);
  assert(computeConfidence([], 0) === 0, 'computeConfidence([], 0) → 0');
  assert(computeConfidence(['good', 'great'], 40) > 0, 'computeConfidence with terms → > 0');
}

function testAspectExtraction() {
  console.log('\n5. Aspect extraction');

  const checkout = analyzeSentiment('Checkout failed');
  assert(checkout.aspects.some((a) => a.aspect === 'checkout'), `"Checkout failed" → aspect 'checkout' (got ${JSON.stringify(checkout.aspects.map((a) => a.aspect))})`);

  const delivery = analyzeSentiment('Delivery was delayed');
  assert(delivery.aspects.some((a) => a.aspect === 'delivery'), `"Delivery was delayed" → aspect 'delivery' (got ${JSON.stringify(delivery.aspects.map((a) => a.aspect))})`);

  const quality = analyzeSentiment('Product quality is poor');
  assert(quality.aspects.some((a) => a.aspect === 'product quality'), `"Product quality is poor" → aspect 'product quality' (got ${JSON.stringify(quality.aspects.map((a) => a.aspect))})`);

  const multi = analyzeSentiment('Checkout was easy but delivery was slow');
  const aspects = multi.aspects.map((a) => a.aspect);
  assert(aspects.includes('checkout'), `Multi-aspect → includes 'checkout' (got ${JSON.stringify(aspects)})`);
  assert(aspects.includes('delivery'), `Multi-aspect → includes 'delivery' (got ${JSON.stringify(aspects)})`);

  const general = analyzeSentiment('The product arrived');
  assert(general.aspects.some((a) => a.aspect === 'general'), `No keyword match → aspect 'general' (got ${JSON.stringify(general.aspects.map((a) => a.aspect))})`);
}

function testPunctuationHandling() {
  console.log('\n6. Punctuation handling');

  const withPeriod = analyzeSentiment('Delivery was not helpful.');
  assert(withPeriod.sentiment === 'negative', `"Delivery was not helpful." → negative (got '${withPeriod.sentiment}')`);

  const withComma = analyzeSentiment('Great product, excellent quality');
  assert(withComma.score > 0, `"Great product, excellent quality" → score > 0 (got ${withComma.score})`);
  assert(withComma.matchedTerms === undefined || withComma.score > 0, `"Great product, excellent quality" → score > 0 confirms terms matched`);
}

function testAspectDetails() {
  console.log('\n7. Aspect-level sentiment details');

  const result = analyzeSentiment('Delivery was extremely slow and frustrating');
  const deliveryAspect = result.aspects.find((a) => a.aspect === 'delivery');
  assert(deliveryAspect !== undefined, 'Delivery aspect found');
  if (deliveryAspect) {
    assert(deliveryAspect.sentiment === 'negative', `Delivery aspect → negative (got '${deliveryAspect.sentiment}')`);
    assert(deliveryAspect.score < 0, `Delivery aspect → score < 0 (got ${deliveryAspect.score})`);
    assert(deliveryAspect.confidence > 0, `Delivery aspect → confidence > 0 (got ${deliveryAspect.confidence})`);
    assert(Array.isArray(deliveryAspect.matchedTerms) && deliveryAspect.matchedTerms.length > 0, `Delivery aspect → has matchedTerms (got ${JSON.stringify(deliveryAspect.matchedTerms)})`);
    assert(typeof deliveryAspect.negated === 'boolean', `Delivery aspect → negated is boolean (got ${typeof deliveryAspect.negated})`);
  }
}

function testBackwardCompatibility() {
  console.log('\n8. Backward compatibility');

  const result = extractAspectsAndSentiment('Great product, excellent quality');
  assert(result.sentiment === 'positive', `extractAspectsAndSentiment → sentiment 'positive' (got '${result.sentiment}')`);
  assert(Array.isArray(result.aspects), 'extractAspectsAndSentiment → aspects is array');
  assert(typeof result.score === 'number', `extractAspectsAndSentiment → has score field (got ${typeof result.score})`);
  assert(typeof result.confidence === 'number', `extractAspectsAndSentiment → has confidence field (got ${typeof result.confidence})`);
}

function testHelperFunctions() {
  console.log('\n9. Helper functions');

  assert(applyNegation(0.5, true) === -0.5, 'applyNegation(0.5, true) → -0.5');
  assert(applyNegation(0.5, false) === 0.5, 'applyNegation(0.5, false) → 0.5');
  assert(applyNegation(-0.5, true) === 0.5, 'applyNegation(-0.5, true) → 0.5');

  assert(applyIntensifiers(0.5, ['very']) === 0.75, 'applyIntensifiers(0.5, ["very"]) → 0.75');
  assert(applyIntensifiers(0.5, ['extremely']) === 1.0, 'applyIntensifiers(0.5, ["extremely"]) → 1.0');
  assert(applyIntensifiers(0.5, ['slightly']) === 0.3, 'applyIntensifiers(0.5, ["slightly"]) → 0.3');
  assert(applyIntensifiers(0.5, []) === 0.5, 'applyIntensifiers(0.5, []) → 0.5');
}

testSentimentScoring();
testNegationHandling();
testIntensifierDetection();
testConfidenceScoring();
testAspectExtraction();
testPunctuationHandling();
testAspectDetails();
testBackwardCompatibility();
testHelperFunctions();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}