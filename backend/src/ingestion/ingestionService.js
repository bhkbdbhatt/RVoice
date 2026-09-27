import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';
import { normalizePayload } from './adapters/index.js';
import { deduplicate, recordIdempotencyKey } from './idempotencyService.js';
import { upsertFeedbackBatch } from '../repositories/feedbackRepository.js';
import { getQueue } from '../queue/messageQueue.js';
import { validateCanonicalItem } from './canonicalSchema.js';
import { maskPIIInItem } from '../services/piiService.js';

// ============================================================
// Ingestion Service Orchestrator
// End-to-end pipeline:
//   raw payload → normalize → validate → deduplicate → persist → queue → log
// ============================================================

/**
 * Create an ingestion log entry.
 * @param {Object} entry - Log entry data
 */
async function logIngestion(entry) {
  // In a full implementation, this persists to ingestion_log table.
  // For now, we log to console.
  console.log('[ingestion]', JSON.stringify({
    batchId: entry.batchId,
    source: entry.source,
    itemCount: entry.itemCount,
    successCount: entry.successCount,
    failureCount: entry.failureCount,
    duplicateCount: entry.duplicateCount,
  }));
}

/**
 * Process a single raw payload from a source.
 * @param {Object} options
 * @param {string} options.source - Source name (e.g. 'zendesk', 'web', 'email')
 * @param {Array|Object} options.payload - Raw data from the source
 * @param {Object} [options.metadata] - Additional metadata
 * @returns {Promise<{
 *   batchId: string,
 *   ingested: number,
 *   duplicates: number,
 *   failed: number,
 *   items: Array
 * }>}
 */
export async function processIngestion({ source, payload, metadata = {} }) {
  const batchId = uuidv4();
  const items = Array.isArray(payload) ? payload : [payload];
  const result = {
    batchId,
    ingested: 0,
    duplicates: 0,
    failed: 0,
    items: [],
  };

  try {
    // 1. Normalize to canonical form
    let canonicalItems = [];
    try {
      canonicalItems = normalizePayload(source, items);
    } catch (error) {
      console.error(`[ingestion:${source}] Normalization failed:`, error.message);
      result.failed = items.length;
      await logIngestion({
        batchId,
        source,
        itemCount: items.length,
        successCount: 0,
        failureCount: items.length,
        duplicateCount: 0,
      });
      return result;
    }

    // 2. Validate canonical items
    const validItems = canonicalItems.filter((item) => {
      const { valid, errors } = validateCanonicalItem(item);
      if (!valid) {
        console.warn(`[ingestion:${source}] Invalid item skipped:`, errors.join('; '));
        result.failed++;
        return false;
      }
      return true;
    });

    // 2b. Mask PII in valid items before persistence
    const maskedItems = config.pii.enabled
      ? validItems.map((item) => maskPIIInItem(item))
      : validItems;

    // 3. Deduplicate against idempotency keys
    const { unique, duplicates } = await deduplicate(maskedItems);
    result.duplicates = duplicates.length;

    // 4. Persist feedback records (idempotent upsert)
    const savedItems = await upsertFeedbackBatch(unique);
    result.items = savedItems;
    result.ingested = savedItems.length;

    // 5. Record idempotency keys for successfully processed items
    for (const item of unique) {
      if (item.externalId) {
        const saved = savedItems.find((s) => s.externalId === item.externalId);
        await recordIdempotencyKey({
          source: item.source,
          externalId: item.externalId,
          feedbackId: saved?.id || saved?.externalId || null,
        });
      }
    }

    // 6. Publish to message queue for downstream processing (themes, actions, etc.)
    const queue = getQueue();
    for (const item of savedItems) {
      await queue.publish(config.kafka.topics.rawFeedback, {
        ...item,
        _batchId: batchId,
        _ingestedAt: new Date().toISOString(),
        _metadata: metadata,
      });
    }

    // 7. Log the ingestion batch
    await logIngestion({
      batchId,
      source,
      itemCount: items.length,
      successCount: savedItems.length,
      failureCount: result.failed,
      duplicateCount: result.duplicates,
    });

    return result;
  } catch (error) {
    console.error(`[ingestion:${source}] Pipeline failed:`, error.message);
    result.failed = Math.max(result.failed, items.length - result.ingested);
    await logIngestion({
      batchId,
      source,
      itemCount: items.length,
      successCount: result.ingested,
      failureCount: result.failed,
      duplicateCount: result.duplicates,
    });
    throw error;
  }
}

/**
 * Process a batch from a connector poll.
 * @param {Object} options
 * @param {string} options.source - Source name
 * @param {Array} options.rawItems - Raw items from the connector
 * @returns {Promise<Object>} - Ingestion result
 */
export async function processConnectorBatch({ source, rawItems = [] }) {
  return processIngestion({
    source,
    payload: rawItems,
    metadata: { source: 'connector_poll' },
  });
}

/**
 * Process a webhook payload.
 * @param {Object} options
 * @param {string} options.source - Source name (e.g. 'zendesk')
 * @param {Object} options.body - Webhook payload body
 * @returns {Promise<Object>} - Ingestion result
 */
export async function processWebhook({ source, body }) {
  return processIngestion({
    source,
    payload: body,
    metadata: { source: 'webhook' },
  });
}