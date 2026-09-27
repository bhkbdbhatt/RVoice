// backend/src/services/chatNlpService.js
// Intent classification using compromise – lightweight rule‑based NLP
// ---------------------------------------------------------------
// Exported functions:
//   classifyIntent(text) => { intent, confidence, entities, fallback }
//   extractEntities(text, intent) => { product?, store?, status?, journeyStage? }
//
// The implementation follows the intent list defined in the
// implementation plan and uses simple keyword matching backed by
// the `compromise` library for basic natural‑language parsing.

// ⚡ CHANGE 1: Use 'import' instead of 'require' for npm packages
import compromise from 'compromise';

/**
 * Keyword maps for each supported intent.
 * Phrases are kept lowercase for case‑insensitive matching.
 */
const INTENT_KEYWORDS = {
  help: [
    'help',
    'what can you do',
    'how does this work',
    'what are your features',
    'what can you help with'
  ],
  overview: [
    'overview',
    'what\'s on the dashboard',
    'give me a summary',
    'show me overview',
    'show me dashboard'
  ],
  'count.feedback': [
    'how many feedback',
    'total feedback',
    'feedback count',
    'how many feedback items',
    'feedback number'
  ],
  'count.themes': [
    'how many themes',
    'total themes',
    'theme count',
    'how many themes are there'
  ],
  'count.actions': [
    'how many actions',
    'total actions',
    'actions count',
    'how many actions are there'
  ],
  'count.clusters': [
    'how many clusters',
    'total clusters',
    'cluster count',
    'how many clusters are there'
  ],
  'count.spikes': [
    'how many spikes',
    'emerging issues count',
    'spike count',
    'how many emerging issues'
  ],
  'feedback.list': [
    'show me feedback',
    'list feedback',
    'feedback from',
    'give me feedback'
  ],
  'feedback.sentiment': [
    'feedback sentiment',
    'how is the sentiment',
    'sentiment analysis',
    'is the sentiment positive'
  ],
  'themes.list': [
    'show me themes',
    'list themes',
    'what are the themes',
    'negative themes',
    'top themes'
  ],
  'actions.list': [
    'show me actions',
    'list actions',
    'pending actions',
    'actions for',
    'give me actions'
  ],
  'clusters.list': [
    'show me clusters',
    'list clusters',
    'clusters for',
    'group clusters',
    'related clusters'
  ],
  'spikes.list': [
    'show me spikes',
    'list spikes',
    'emerging issues',
    'trending issues',
    'what are the spikes'
  ],
  'feedback.by_product': [
    'checkout feedback',
    'delivery issues',
    'order issues',
    'purchase feedback',
    'product feedback'
  ],
  'feedback.by_store': [
    'store-42 feedback',
    'feedback from store',
    'store feedback',
    'store number feedback'
  ],
  'actions.by_owner': [
    'actions for owner',
    'owner actions',
    'actions by owner'
  ],
  'actions.by_status': [
    'pending actions',
    'resolved actions',
    'status actions',
    'actions with status'
  ]
};

/**
 * Simple scoring – count matching phrases and normalize by token length.
 */
// ⚡ CHANGE 2: Add 'export' before the function
export function classifyIntent(text) {
  const lowered = text.toLowerCase();
  const doc = compromise(lowered);
  const tokenCount = lowered.trim().split(/\s+/).length;

  // Score each intent by number of matched keywords
  const scores = {};

  Object.entries(INTENT_KEYWORDS).forEach(([intent, phrases]) => {
    phrases.forEach((phrase) => {
      if (lowered.includes(phrase)) {
        scores[intent] = (scores[intent] || 0) + 1;
      }
    });
  });

  // Pick the intent with the highest score
  const bestIntent = Object.entries(scores).reduce(
    (max, cur) => cur[1] > max[1] ? cur : max,
    ['', 0]
  )[0];

  const confidence = bestIntent ? Math.min(1, Math.max(...Object.values(scores)) / 3) : 0;
  const entities = extractEntities(text, bestIntent);
  const fallback = confidence < 0.3;

  return {
    intent: bestIntent,
    confidence,
    entities,
    fallback
  };
}

/**
 * Extract structured entities based on the detected intent.
 * This function uses simple keyword patterns to fill in fields
 * such as product, store, status, journeyStage, etc.
 */
// ⚡ CHANGE 3: Add 'export' before the function
export function extractEntities(text, intent) {
  const lowered = (text || '').toLowerCase();
  const entities = {};

  // Product / action owner detection
  const productMatch = ['checkout', 'delivery', 'order', 'purchase'].find((word) => lowered.includes(word));
  if (productMatch) {
    entities.product = productMatch;
  }

  // Store detection – capture full identifier like "store-42" or "store 42"
  const storeIdMatch = lowered.match(/(store[- ]\d+)/);
  if (storeIdMatch) {
    entities.store = storeIdMatch[1].replace(' ', '-');
  } else {
    const storeWord = ['store', 'shop', 'outlet'].find((word) => lowered.includes(word));
    if (storeWord) {
      entities.store = storeWord;
    }
  }

  // Status detection for actions
  const statusMatch = ['pending', 'resolved', 'completed', 'failed'].find((word) => lowered.includes(word));
  if (statusMatch) {
    entities.status = statusMatch;
  }

  // Journey‑stage detection
  const stageMatch = [
    'awareness',
    'consideration',
    'purchase',
    'checkout',
    'delivery',
    'post-purchase',
    'support'
  ].find((word) => lowered.includes(word));
  if (stageMatch) {
    entities.journeyStage = stageMatch;
  }

  return entities;
}

// ⚡ CHANGE 4: Removed module.exports = { classifyIntent, extractEntities };
