import { sampleFeedback } from '../utils/sampleData.js';

const BASE = 'http://localhost:4000/api';

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

function assertScoreInRange(score, message) {
  assert(typeof score === 'number' && score >= -1 && score <= 1, `${message} (got ${score})`);
}

function assertConfidenceInRange(confidence, message) {
  assert(typeof confidence === 'number' && confidence >= 0 && confidence <= 1, `${message} (got ${confidence})`);
}

function validateSentimentFields(item, label) {
  assert(item.sentiment !== undefined, `${label} → has sentiment field (got ${item.sentiment})`);
  assertScoreInRange(item.score, `${label} → score in [-1, 1]`);
  assertConfidenceInRange(item.confidence, `${label} → confidence in [0, 1]`);
}

function validateAspectFields(aspect, label) {
  assert(aspect.aspect !== undefined, `${label} → has aspect field (got ${aspect.aspect})`);
  assert(aspect.sentiment !== undefined, `${label} → has sentiment field (got ${aspect.sentiment})`);
  assertScoreInRange(aspect.score, `${label} → score in [-1, 1]`);
  assertConfidenceInRange(aspect.confidence, `${label} → confidence in [0, 1]`);
}

async function run() {
  console.log('Ingesting sample feedback...');
  const ingest = await fetch(`${BASE}/feedback/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: sampleFeedback }),
  });
  const ingestData = await ingest.json();
  console.log('Ingest response:', ingestData);

  console.log('Estimating themes...');
  const themes = await fetch(`${BASE}/themes/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: sampleFeedback }),
  });
  const themesData = await themes.json();
  console.log('Theme estimate response:', themesData);

  if (themesData.themes && Array.isArray(themesData.themes)) {
    console.log('\nValidating theme sentiment fields...');
    themesData.themes.forEach((theme, index) => {
      const label = `Theme ${index} (${theme.text?.slice(0, 30) || 'unknown'}...)`;
      validateSentimentFields(theme, label);
      assert(Array.isArray(theme.aspects), `${label} → aspects is array`);
      if (Array.isArray(theme.aspects)) {
        theme.aspects.forEach((aspect, aspectIndex) => {
          validateAspectFields(aspect, `${label} aspect ${aspectIndex}`);
        });
      }
    });
  }

  console.log('\nFetching clusters...');
  const clusters = await fetch(`${BASE}/clusters`);
  const clustersData = await clusters.json();
  console.log('Clusters response:', clustersData);

  console.log('\nFetching actions...');
  const actionsRes = await fetch(`${BASE}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: {} }) });
  const actionsData = await actionsRes.json();
  console.log('Actions response:', actionsData);

  if (actionsData.actions && Array.isArray(actionsData.actions)) {
    console.log('\nValidating action sentiment fields...');
    actionsData.actions.forEach((action, index) => {
      const label = `Action ${index}`;
      assert(action.sentiment !== undefined, `${label} → has sentiment field (got ${action.sentiment})`);
      assertScoreInRange(action.sentimentScore, `${label} → sentimentScore in [-1, 1]`);
      assertConfidenceInRange(action.confidence, `${label} → confidence in [0, 1]`);
      assert(action.issueScore !== undefined, `${label} → has issueScore (got ${action.issueScore})`);
      if (Array.isArray(action.recommendations)) {
        action.recommendations.forEach((rec, recIndex) => {
          assertScoreInRange(rec.sentimentScore, `${label} recommendation ${recIndex} → sentimentScore in [-1, 1]`);
          assertConfidenceInRange(rec.confidence, `${label} recommendation ${recIndex} → confidence in [0, 1]`);
        });
      }
    });
  }

  if (actionsData.actions.length > 0) {
    const actionId = actionsData.actions[0].actionId;
    console.log('Updating first action status to assigned...');
    const updateRes = await fetch(`${BASE}/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'assigned', notes: ['Assigned to owner for review.'] }),
    });
    console.log('Update response:', await updateRes.json());
  }

  console.log('\nFetching overview...');
  const overview = await fetch(`${BASE}/overview`);
  const overviewData = await overview.json();
  console.log('Overview response:', overviewData);

  if (Array.isArray(overviewData.spikes)) {
    console.log('\nValidating spike sentiment fields...');
    overviewData.spikes.forEach((spike, index) => {
      const label = `Spike ${index}`;
      assert(spike.score !== undefined, `${label} → has score (got ${spike.score})`);
      if (spike.sentimentScore !== undefined) {
        assertScoreInRange(spike.sentimentScore, `${label} → sentimentScore in [-1, 1]`);
      }
      if (spike.confidence !== undefined) {
        assertConfidenceInRange(spike.confidence, `${label} → confidence in [0, 1]`);
      }
    });
  }

  console.log('\nFetching spikes...');
  const spikes = await fetch(`${BASE}/detection/spikes`);
  const spikesData = await spikes.json();
  console.log('Spikes response:', spikesData);

  if (Array.isArray(spikesData.spikes)) {
    console.log('\nValidating detection endpoint spike fields...');
    spikesData.spikes.forEach((spike, index) => {
      const label = `Endpoint Spike ${index}`;
      assert(spike.score !== undefined, `${label} → has score (got ${spike.score})`);
      if (spike.sentimentScore !== undefined) {
        assertScoreInRange(spike.sentimentScore, `${label} → sentimentScore in [-1, 1]`);
      }
      if (spike.confidence !== undefined) {
        assertConfidenceInRange(spike.confidence, `${label} → confidence in [0, 1]`);
      }
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});