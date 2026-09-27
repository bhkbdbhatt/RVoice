import { v4 as uuidv4 } from 'uuid';
import { normalizeFeedbackItem } from './normalizationService.js';
import { loadFeedbackStore, saveFeedbackStore } from './storageService.js';

let feedbackStore = [];

async function initializeStore() {
  if (!feedbackStore.length) {
    feedbackStore = await loadFeedbackStore();
  }
}

export async function ingestFeedback(items) {
  await initializeStore();
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  const normalized = items.map((item) => {
    const id = item.id || uuidv4();
    const record = normalizeFeedbackItem({ ...item, id });
    feedbackStore.push(record);
    return record;
  });

  await saveFeedbackStore(feedbackStore);
  return normalized;
}

export async function getFeedback(query = {}) {
  await initializeStore();
  if (Object.keys(query).length === 0) {
    return [...feedbackStore];
  }

  return feedbackStore.filter((item) => {
    if (query.source && item.source !== query.source) {
      return false;
    }
    if (query.product && item.product !== query.product) {
      return false;
    }
    if (query.store && item.store !== query.store) {
      return false;
    }
    return true;
  });
}
