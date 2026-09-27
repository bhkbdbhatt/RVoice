import crypto from 'crypto';
import { config, isPostgresMode } from '../config/env.js';
import { query } from '../db/connection.js';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// Idempotency Service
// Prevents duplicate feedback ingestion using SHA-256 hash keys
// of (source + externalId). Supports JSON file storage (default)
// and PostgreSQL.
// ============================================================

/**
 * Generate the idempotency key hash for a feedback item.
 * @param {string} source - Source system (e.g. 'zendesk')
 * @param {string} externalId - External ID from the source
 * @returns {string} - SHA-256 hex digest
 */
export function generateIdempotencyKey(source, externalId) {
  const raw = `${source}:${externalId}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// JSON mode state
let _jsonKeys = null;
let _jsonFile = null;

async function _getJsonFile() {
  if (_jsonFile) return _jsonFile;
  _jsonFile = path.join(config.dataDir, 'idempotency_keys.json');
  return _jsonFile;
}

async function _loadJsonKeys() {
  if (_jsonKeys) return _jsonKeys;
  try {
    const file = await _getJsonFile();
    const raw = await fs.readFile(file, 'utf-8');
    _jsonKeys = JSON.parse(raw);
  } catch {
    _jsonKeys = {};
  }
  return _jsonKeys;
}

async function _saveJsonKeys() {
  const file = await _getJsonFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(_jsonKeys, null, 2), 'utf-8');
}

/**
 * Check if an idempotency key already exists (i.e. the item was already processed).
 * @param {string} source - Source system
 * @param {string} externalId - External ID from the source
 * @returns {Promise<boolean>} - true if the key exists
 */
export async function isDuplicate(source, externalId) {
  const keyHash = generateIdempotencyKey(source, externalId);

  if (isPostgresMode()) {
    const result = await query(
      'SELECT 1 FROM idempotency_keys WHERE key_hash = $1 AND expires_at > NOW()',
      [keyHash],
    );
    return result.rowCount > 0;
  }

  const keys = await _loadJsonKeys();
  return Boolean(keys[keyHash]);
}

/**
 * Record an idempotency key after successful processing.
 * @param {Object} options
 * @param {string} options.source - Source system
 * @param {string} options.externalId - External ID from the source
 * @param {string} [options.feedbackId] - Internal feedback record ID
 * @returns {Promise<void>}
 */
export async function recordIdempotencyKey({ source, externalId, feedbackId = null }) {
  const keyHash = generateIdempotencyKey(source, externalId);
  const ttlDays = config.ingestion.idempotencyTtlDays;

  if (isPostgresMode()) {
    await query(
      `INSERT INTO idempotency_keys (key_hash, source, external_id, feedback_id, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)
       ON CONFLICT (key_hash) DO NOTHING`,
      [keyHash, source, externalId, feedbackId, ttlDays],
    );
    return;
  }

  const keys = await _loadJsonKeys();
  keys[keyHash] = {
    source,
    externalId,
    feedbackId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
  };
  await _saveJsonKeys();
}

/**
 * Filter out duplicate items from a batch before processing.
 * @param {Array} items - Canonical feedback items
 * @returns {Promise<{unique: Array, duplicates: Array}>} - Unique and duplicate items
 */
export async function deduplicate(items = []) {
  const unique = [];
  const duplicates = [];

  for (const item of items) {
    if (!item.externalId) {
      // Items without external IDs are always processed
      unique.push(item);
      continue;
    }

    const dup = await isDuplicate(item.source, item.externalId);
    if (dup) {
      duplicates.push(item);
    } else {
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

/**
 * Clean up expired idempotency keys (maintenance).
 * @returns {Promise<number>} - Number of expired keys cleaned
 */
export async function cleanupExpiredKeys() {
  if (isPostgresMode()) {
    const result = await query('DELETE FROM idempotency_keys WHERE expires_at <= NOW() RETURNING id');
    return result.rowCount;
  }

  const keys = await _loadJsonKeys();
  const now = Date.now();
  let cleaned = 0;
  for (const [hash, record] of Object.entries(keys)) {
    if (new Date(record.expiresAt).getTime() <= now) {
      delete keys[hash];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    await _saveJsonKeys();
  }
  return cleaned;
}