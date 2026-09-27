import { createCanonicalItem } from '../canonicalSchema.js';

// ============================================================
// Intercom Feedback Adapter
// Converts Intercom conversation objects into canonical feedback items.
//
// Intercom conversation shape (relevant fields):
//   {
//     id: '6342',
//     created_at: 1690000000,
//     source: { type: 'email', id: 'email_1' },
//     contacts: [{ id: 'contact_1', email: 'user@example.com', name: 'Jane' }],
//     conversation_parts: {
//       conversation_parts: [
//         { body: 'The checkout is broken...', part_type: 'note', created_at: 1690000000 }
//       ]
//     },
//     custom_attributes: { product: 'checkout', store: 'store-42' },
//     tags: { tags: [{ name: 'checkout' }] }
//   }
// ============================================================

/**
 * Extract the primary text from an Intercom conversation.
 * @param {Object} conversation - Intercom conversation
 * @returns {string}
 */
function extractConversationText(conversation) {
  const parts = conversation.conversation_parts?.conversation_parts || [];
  const customerParts = parts.filter((part) => part.part_type === 'comment');
  return customerParts[0]?.body || '';
}

/**
 * Convert an Intercom conversation into a canonical feedback item.
 * @param {Object} conversation - Raw Intercom conversation
 * @returns {Object} - Canonical feedback item
 */
export function normalizeIntercomConversation(conversation) {
  const contact = conversation.contacts?.[0] || {};
  const tags = (conversation.tags?.tags || []).map((t) => t.name);
  const customAttributes = conversation.custom_attributes || {};
  const sourceType = conversation.source?.type || 'conversation';
  const createdAt = conversation.created_at
    ? new Date(conversation.created_at * 1000).toISOString()
    : null;

  return createCanonicalItem({
    externalId: String(conversation.id),
    source: 'intercom',
    origin: sourceType,
    customer: {
      externalId: contact.id ? String(contact.id) : null,
      email: contact.email || null,
      name: contact.name || null,
    },
    text: extractConversationText(conversation),
    rating: customAttributes.rating ? Number(customAttributes.rating) : null,
    product: customAttributes.product || null,
    store: customAttributes.store || null,
    journeyStage: customAttributes.journey_stage || null,
    receivedAt: createdAt,
    metadata: {
      conversationId: conversation.id,
      tags,
      assignment: conversation.assignment || null,
      state: conversation.state || null,
      read: conversation.read || false,
      customAttributes,
      partCount: conversation.conversation_parts?.conversation_parts?.length || 0,
    },
  });
}

/**
 * Normalize a batch of Intercom conversations.
 * @param {Array} conversations - Array of raw Intercom conversations
 * @returns {Array} - Array of canonical feedback items
 */
export function normalizeIntercomBatch(conversations = []) {
  return conversations.map(normalizeIntercomConversation);
}