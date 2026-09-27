import { query, withTransaction } from '../db/connection.js';
import { isPostgresMode } from '../config/env.js';
import { loadFeedbackStore, saveFeedbackStore } from '../services/storageService.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Feedback Repository
// Provides data access for feedback records.
// Supports PostgreSQL (production) and JSON file storage (dev).
// ============================================================

let _jsonFeedback = null;

async function _getJsonFeedback() {
  if (!_jsonFeedback) {
    _jsonFeedback = await loadFeedbackStore();
  }
  return _jsonFeedback;
}

async function _saveJsonFeedback(items) {
  _jsonFeedback = items;
  await saveFeedbackStore(items);
}

/**
 * Insert or update a single feedback record (idempotent).
 * @param {Object} item - Canonical feedback item
 * @returns {Promise<Object>} - Saved feedback record
 */
export async function upsertFeedback(item) {
  if (isPostgresMode()) {
    const result = await query(
      `INSERT INTO feedback (id, source, origin, external_id, customer_id, text, rating, product, store, journey_stage, received_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (source, external_id)
       DO UPDATE SET
         text = EXCLUDED.text,
         rating = EXCLUDED.rating,
         product = EXCLUDED.product,
         store = EXCLUDED.store,
         journey_stage = EXCLUDED.journey_stage,
         updated_at = NOW()
       RETURNING *`,
      [
        item.source,
        item.origin || item.source,
        item.externalId,
        null, // customer_id - handled by customer service in production
        item.text,
        item.rating,
        item.product,
        item.store,
        item.journeyStage,
        item.receivedAt ? new Date(item.receivedAt).toISOString() : new Date().toISOString(),
      ],
    );
    return result.rows[0];
  }

  // JSON mode
  const items = await _getJsonFeedback();
  const existingIndex = items.findIndex(
    (f) => f.source === item.source && f.externalId === item.externalId,
  );

  const record = {
    id: existingIndex !== -1 ? items[existingIndex].id : uuidv4(),
    source: item.source,
    origin: item.origin || item.source,
    externalId: item.externalId,
    text: item.text,
    rating: item.rating,
    product: item.product,
    store: item.store,
    journeyStage: item.journeyStage,
    metadata: item.metadata || {},
    receivedAt: item.receivedAt || new Date().toISOString(),
    timestamp: item.receivedAt || new Date().toISOString(),
  };

  if (existingIndex !== -1) {
    items[existingIndex] = { ...items[existingIndex], ...record };
  } else {
    items.push(record);
  }

  await _saveJsonFeedback(items);
  return record;
}

/**
 * Insert or update multiple feedback records in a transaction (idempotent).
 * @param {Array} items - Array of canonical feedback items
 * @returns {Promise<Array>} - Saved feedback records
 */
export async function upsertFeedbackBatch(items) {
  if (items.length === 0) return [];

  if (isPostgresMode()) {
    return withTransaction(async (client) => {
      const saved = [];
      for (const item of items) {
        const result = await client.query(
          `INSERT INTO feedback (id, source, origin, external_id, customer_id, text, rating, product, store, journey_stage, received_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (source, external_id)
           DO UPDATE SET
             text = EXCLUDED.text,
             rating = EXCLUDED.rating,
             product = EXCLUDED.product,
             store = EXCLUDED.store,
             journey_stage = EXCLUDED.journey_stage,
             updated_at = NOW()
           RETURNING *`,
          [
            item.source,
            item.origin || item.source,
            item.externalId,
            null,
            item.text,
            item.rating,
            item.product,
            item.store,
            item.journeyStage,
            item.receivedAt ? new Date(item.receivedAt).toISOString() : new Date().toISOString(),
          ],
        );
        saved.push(result.rows[0]);
      }
      return saved;
    });
  }

  const saved = [];
  for (const item of items) {
    saved.push(await upsertFeedback(item));
  }
  return saved;
}

/**
 * Get feedback records with optional filters.
 * @param {Object} filters - { source, product, store, journeyStage, limit, offset }
 * @returns {Promise<Array>}
 */
export async function getFeedback(filters = {}) {
  if (isPostgresMode()) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.source) {
      conditions.push(`source = $${idx++}`);
      params.push(filters.source);
    }
    if (filters.product) {
      conditions.push(`product = $${idx++}`);
      params.push(filters.product);
    }
    if (filters.store) {
      conditions.push(`store = $${idx++}`);
      params.push(filters.store);
    }
    if (filters.journeyStage) {
      conditions.push(`journey_stage = $${idx++}`);
      params.push(filters.journeyStage);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filters.limit || 100, 1000);
    const offset = filters.offset || 0;

    params.push(limit);
    params.push(offset);

    const result = await query(
      `SELECT * FROM feedback ${whereClause}
       ORDER BY received_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );
    return result.rows;
  }

  const items = await _getJsonFeedback();
  return items.filter((f) => {
    if (filters.source && f.source !== filters.source) return false;
    if (filters.product && f.product !== filters.product) return false;
    if (filters.store && f.store !== filters.store) return false;
    if (filters.journeyStage && f.journeyStage !== filters.journeyStage) return false;
    return true;
  });
}

/**
 * Count feedback records matching filters.
 * @param {Object} filters
 * @returns {Promise<number>}
 */
export async function countFeedback(filters = {}) {
  if (isPostgresMode()) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.source) {
      conditions.push(`source = $${idx++}`);
      params.push(filters.source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT COUNT(*) AS count FROM feedback ${whereClause}`, params);
    return parseInt(result.rows[0].count, 10);
  }

  const items = await _getJsonFeedback();
  return items.filter((f) => {
    if (filters.source && f.source !== filters.source) return false;
    return true;
  }).length;
}

export { isPostgresMode };