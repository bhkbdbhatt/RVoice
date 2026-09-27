import { createCanonicalItem } from '../canonicalSchema.js';

// ============================================================
// Generic Feedback Adapter
// Handles direct submissions from the POC/UI or any source
// that doesn't have a dedicated connector adapter.
//
// Expected shape (already close to canonical):
//   {
//     text: 'The checkout failed',
//     source: 'web' | 'email' | 'app' | 'store' | 'social',
//     product: 'checkout',
//     store: 'store-42',
//     journeyStage: 'checkout',
//     rating: 1,
//     timestamp: '2026-08-01T10:00:00Z',
//     id: 'optional-external-id'
//   }
// ============================================================

/**
 * Convert a generic feedback item into canonical form.
 * @param {Object} item - Raw feedback item
 * @returns {Object} - Canonical feedback item
 */
export function normalizeGenericItem(item) {
  return createCanonicalItem({
    externalId: item.id || item.externalId || item.external_id || null,
    source: item.source || 'web',
    origin: item.origin || item.source || 'web',
    customer: {
      externalId: item.customerId || item.customer_id || null,
      email: item.email || null,
      name: item.customerName || item.name || null,
    },
    text: item.text || item.comment || item.body || '',
    rating: typeof item.rating === 'number' ? item.rating : null,
    product: item.product || item.sku || null,
    store: item.store || item.location || null,
    journeyStage: item.journeyStage || item.journey_stage || item.stage || null,
    receivedAt: item.timestamp || item.receivedAt || item.created_at || null,
    metadata: item.metadata || {},
  });
}

/**
 * Normalize a batch of generic feedback items.
 * @param {Array} items - Array of raw feedback items
 * @returns {Array} - Array of canonical feedback items
 */
export function normalizeGenericBatch(items = []) {
  return items.map(normalizeGenericItem);
}