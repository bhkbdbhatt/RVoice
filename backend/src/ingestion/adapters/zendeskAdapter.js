import { createCanonicalItem } from '../canonicalSchema.js';

// ============================================================
// Zendesk Feedback Adapter
// Converts Zendesk ticket objects into canonical feedback items.
//
// Zendesk ticket shape (relevant fields):
//   {
//     id: 123,
//     subject: 'Checkout failed',
//     description: 'The checkout process kept failing...',
//     created_at: '2026-08-01T10:00:00Z',
//     status: 'open',
//     priority: 'high',
//     tags: ['checkout', 'payment'],
//     requester_id: 456,
//     custom_fields: [{ id: 1, value: 'store-42' }]
//   }
// ============================================================

// Product tags commonly used in Zendesk
const CUSTOM_FIELD_PRODUCT_TAGS = [
  'checkout',
  'delivery',
  'product-quality',
  'customer-support',
  'store-experience',
  'app',
];

const CUSTOM_FIELD_MAP = {
  product: 'product',
  store: 'store',
  journey_stage: 'journeyStage',
  rating: 'rating',
};

/**
 * Extract custom fields from a Zendesk ticket.
 * @param {Array} customFields - Zendesk custom_fields array
 * @returns {Object} - Mapped custom field values
 */
function extractCustomFields(customFields = []) {
  const result = {};
  customFields.forEach((field) => {
    const key = CUSTOM_FIELD_MAP[field.id];
    if (key) {
      result[key] = field.value;
    }
  });
  return result;
}

/**
 * Infer journey stage from Zendesk tags.
 * @param {Array} tags - Zendesk tags
 * @returns {string|null}
 */
function inferJourneyStage(tags = []) {
  const stageMap = {
    checkout: 'checkout',
    delivery: 'delivery',
    support: 'support',
    purchase: 'purchase',
    'post-purchase': 'post-purchase',
    awareness: 'awareness',
  };
  for (const tag of tags) {
    if (stageMap[tag]) return stageMap[tag];
  }
  return null;
}

/**
 * Convert a Zendesk ticket into a canonical feedback item.
 * @param {Object} ticket - Raw Zendesk ticket
 * @returns {Object} - Canonical feedback item
 */
export function normalizeZendeskTicket(ticket) {
  const customFields = extractCustomFields(ticket.custom_fields);
  const text = ticket.description || ticket.subject || '';

  return createCanonicalItem({
    externalId: String(ticket.id),
    source: 'zendesk',
    origin: ticket.via?.channel || 'ticket',
    customer: {
      externalId: ticket.requester_id ? String(ticket.requester_id) : null,
      email: ticket.requester?.email || null,
      name: ticket.requester?.name || null,
    },
    text,
    rating: customFields.rating ? Number(customFields.rating) : null,
    product: customFields.product || ticket.tags?.find((t) => CUSTOM_FIELD_PRODUCT_TAGS.includes(t)) || null,
    store: customFields.store || null,
    journeyStage: customFields.journeyStage || inferJourneyStage(ticket.tags),
    receivedAt: ticket.created_at,
    metadata: {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      tags: ticket.tags || [],
      assigneeId: ticket.assignee_id || null,
      groupId: ticket.group_id || null,
      url: ticket.url || null,
    },
  });
}

/**
 * Normalize a batch of Zendesk tickets.
 * @param {Array} tickets - Array of raw Zendesk tickets
 * @returns {Array} - Array of canonical feedback items
 */
export function normalizeZendeskBatch(tickets = []) {
  return tickets.map(normalizeZendeskTicket);
}