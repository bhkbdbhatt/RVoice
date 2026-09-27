import { createCanonicalItem } from '../canonicalSchema.js';

// ============================================================
// App Store Review Adapter
// Converts App Store Connect customer review objects into canonical feedback items.
//
// App Store review shape (relevant fields):
//   {
//     id: '123456789',
//     type: 'customerReview',
//     attributes: {
//       rating: 1,
//       title: 'App crashes',
//       body: 'The app crashed during checkout...',
//       review: 'The app crashed during checkout...',
//       createdDate: '2026-08-01T10:00:00Z',
//       territory: 'USA',
//       reviewerNickname: 'user123'
//     }
//   }
// ============================================================

/**
 * Convert an App Store review into a canonical feedback item.
 * @param {Object} review - Raw App Store review
 * @returns {Object} - Canonical feedback item
 */
export function normalizeAppStoreReview(review) {
  const attributes = review.attributes || {};
  const text = attributes.review || attributes.body || attributes.title || '';

  return createCanonicalItem({
    externalId: String(review.id),
    source: 'app_store',
    origin: 'app_store_review',
    customer: {
      externalId: attributes.reviewerNickname || null,
      name: attributes.reviewerNickname || null,
    },
    text,
    rating: typeof attributes.rating === 'number' ? attributes.rating : null,
    product: attributes.appName || 'mobile_app',
    store: attributes.territory || null,
    journeyStage: null,
    receivedAt: attributes.createdDate,
    metadata: {
      reviewId: review.id,
      title: attributes.title,
      territory: attributes.territory,
      appName: attributes.appName,
      appVersion: attributes.appVersion || null,
      response: attributes.response || null,
      isEdited: attributes.isEdited || false,
    },
  });
}

/**
 * Normalize a batch of App Store reviews.
 * @param {Array} reviews - Array of raw App Store reviews
 * @returns {Array} - Array of canonical feedback items
 */
export function normalizeAppStoreBatch(reviews = []) {
  return reviews.map(normalizeAppStoreReview);
}

/**
 * Convert an App Store review response into a canonical feedback item.
 * Some App Store responses contain developer replies which are not customer feedback.
 * @param {Object} response - App Store review response (developer reply)
 * @returns {Object|null} - Returns null as developer responses are not customer feedback
 */
export function normalizeAppStoreResponse(_response) {
  // Developer responses are not customer feedback; return null to skip
  return null;
}