import { normalizeZendeskBatch, normalizeZendeskTicket } from './zendeskAdapter.js';
import { normalizeIntercomBatch, normalizeIntercomConversation } from './intercomAdapter.js';
import { normalizeAppStoreBatch, normalizeAppStoreReview } from './appStoreAdapter.js';
import { normalizeGenericBatch, normalizeGenericItem } from './genericAdapter.js';
import { validateCanonicalItem } from '../canonicalSchema.js';

// ============================================================
// Adapter Registry
// Maps source names to their normalization functions.
// ============================================================

export const ADAPTERS = {
  zendesk: {
    source: 'zendesk',
    label: 'Zendesk',
    normalize: normalizeZendeskTicket,
    normalizeBatch: normalizeZendeskBatch,
  },
  intercom: {
    source: 'intercom',
    label: 'Intercom',
    normalize: normalizeIntercomConversation,
    normalizeBatch: normalizeIntercomBatch,
  },
  app_store: {
    source: 'app_store',
    label: 'App Store',
    normalize: normalizeAppStoreReview,
    normalizeBatch: normalizeAppStoreBatch,
  },
  generic: {
    source: 'generic',
    label: 'Generic',
    normalize: normalizeGenericItem,
    normalizeBatch: normalizeGenericBatch,
  },
};

/**
 * Get the adapter for a given source.
 * @param {string} source - Source name (e.g. 'zendesk', 'intercom', 'app_store')
 * @returns {Object} - Adapter object
 * @throws {Error} - If no adapter exists for the source
 */
export function getAdapter(source) {
  // For unknown sources (web, email, store, social, etc.), fall back to the generic adapter
  return ADAPTERS[source] || ADAPTERS.generic;
}

/**
 * Normalize a raw payload based on its source.
 * @param {string} source - Source name
 * @param {Array|Object} payload - Raw data from the source
 * @returns {Array} - Array of canonical feedback items
 */
export function normalizePayload(source, payload) {
  const adapter = getAdapter(source);
  const items = Array.isArray(payload)
    ? adapter.normalizeBatch(payload)
    : [adapter.normalize(payload)];

  return items.filter((item) => {
    const { valid, errors } = validateCanonicalItem(item);
    if (!valid) {
      console.warn(`[adapter:${source}] Skipping invalid item:`, errors.join('; '));
      return false;
    }
    return true;
  });
}

export { validateCanonicalItem };