// ============================================================
// Canonical Feedback Schema
// All source-specific feedback is normalized into this shape
// before entering the ingestion pipeline.
// ============================================================

/**
 * The canonical feedback item shape used across the entire system.
 * Every connector adapter must produce this shape.
 */
export const CANONICAL_SCHEMA = {
  // Unique ID from the source system (e.g. Zendesk ticket ID)
  externalId: null,

  // Source system identifier: 'zendesk', 'intercom', 'app_store', 'web', 'email', 'store', 'social'
  source: null,

  // Origin channel within the source (e.g. 'email', 'chat', 'in-app')
  origin: null,

  // Customer identity
  customer: {
    externalId: null,
    email: null,
    name: null,
  },

  // Core content
  text: '',
  rating: null, // 1-5

  // Context dimensions
  product: null,
  store: null,
  journeyStage: null,

  // Timestamp when feedback was created in the source system
  receivedAt: null,

  // Source-specific metadata preserved for audit/debugging
  metadata: {},
};

/**
 * Validate that an item conforms to the canonical schema.
 * @param {Object} item - The item to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCanonicalItem(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item must be an object'] };
  }

  // externalId is optional - items without one (e.g. manual web submissions)
  // are always processed but cannot be deduplicated.

  if (!item.source) {
    errors.push('source is required');
  }

  if (!item.text || typeof item.text !== 'string' || item.text.trim().length === 0) {
    errors.push('text is required and must be a non-empty string');
  }

  if (item.rating !== null && item.rating !== undefined) {
    if (typeof item.rating !== 'number' || item.rating < 1 || item.rating > 5) {
      errors.push('rating must be a number between 1 and 5');
    }
  }

  if (item.receivedAt && Number.isNaN(new Date(item.receivedAt).getTime())) {
    errors.push('receivedAt must be a valid date');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a canonical item with defaults applied.
 * @param {Object} partial - Partial canonical item
 * @returns {Object} - Complete canonical item
 */
export function createCanonicalItem(partial = {}) {
  return {
    ...CANONICAL_SCHEMA,
    ...partial,
    customer: {
      ...CANONICAL_SCHEMA.customer,
      ...(partial.customer || {}),
    },
    metadata: {
      ...(partial.metadata || {}),
    },
  };
}