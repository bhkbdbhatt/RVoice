import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';
import { query } from '../db/connection.js';

// ============================================================
// Migration Service
// Migrates existing JSON file storage to PostgreSQL.
// Used when upgrading from POC (JSON mode) to production (Postgres).
// ============================================================

/**
 * Load a JSON store file.
 * @param {string} filename - File name in the data directory
 * @returns {Promise<Array>} - Array of records
 */
async function loadJsonStore(filename) {
  const filePath = path.join(config.dataDir, filename);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    console.warn(`[migration] No ${filename} found or invalid JSON, skipping`);
    return [];
  }
}

/**
 * Migrate feedback records from JSON to Postgres.
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
export async function migrateFeedback() {
  const records = await loadJsonStore('feedback.json');
  let migrated = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      await query(
        `INSERT INTO feedback (source, origin, external_id, text, rating, product, store, journey_stage, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [
          record.source || 'unknown',
          record.origin || record.source || 'unknown',
          record.externalId || record.id || null,
          record.text || '',
          record.rating || null,
          record.product || null,
          record.store || null,
          record.journeyStage || null,
          record.timestamp || record.receivedAt || new Date().toISOString(),
        ],
      );
      migrated++;
    } catch (error) {
      console.error(`[migration] Feedback record failed:`, error.message);
      skipped++;
    }
  }

  console.log(`[migration] Feedback: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

/**
 * Migrate theme records from JSON to Postgres (as topics).
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
export async function migrateThemes() {
  const records = await loadJsonStore('themes.json');
  let migrated = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      // Find the matching feedback record
      const feedbackResult = await query(
        'SELECT id FROM feedback WHERE external_id = $1 OR text = $2 LIMIT 1',
        [record.sourceId || record.themeId || '', record.text || ''],
      );

      if (feedbackResult.rowCount === 0) {
        skipped++;
        continue;
      }

      const feedbackId = feedbackResult.rows[0].id;

      // Insert topics for each aspect
      const aspects = record.aspects || [];
      const primaryAspect = aspects[0] || { aspect: 'general', sentiment: record.sentiment || 'neutral', score: record.score || 0, confidence: record.confidence || 0 };

      await query(
        `INSERT INTO topics (feedback_id, topic_key, sentiment, sentiment_score, confidence, issue_score, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          feedbackId,
          primaryAspect.aspect || 'general',
          record.sentiment || 'neutral',
          record.sentimentScore || record.score || 0,
          record.confidence || 0,
          record.issueScore || 0,
          record.severity || 'low',
        ],
      );
      migrated++;
    } catch (error) {
      console.error(`[migration] Theme record failed:`, error.message);
      skipped++;
    }
  }

  console.log(`[migration] Themes: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

/**
 * Migrate action records from JSON to Postgres.
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
export async function migrateActions() {
  const records = await loadJsonStore('actions.json');
  let migrated = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      const primaryRecommendation = record.recommendations?.[0] || {};

      await query(
        `INSERT INTO actions (recommended_action, aspect, owner, status, severity, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          primaryRecommendation.recommendedAction || 'Consolidate feedback into the VoC dashboard',
          primaryRecommendation.aspect || 'general',
          record.assignedOwner || primaryRecommendation.owner || 'customer-experience-lead',
          record.status || 'pending',
          record.severity || 'low',
          JSON.stringify(record.notes || []),
        ],
      );
      migrated++;
    } catch (error) {
      console.error(`[migration] Action record failed:`, error.message);
      skipped++;
    }
  }

  console.log(`[migration] Actions: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

/**
 * Migrate connector state from JSON to Postgres.
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
export async function migrateConnectorState() {
  const filePath = path.join(config.dataDir, 'connector_state.json');
  let records = {};
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    records = JSON.parse(raw);
  } catch {
    console.warn('[migration] No connector_state.json found, skipping');
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  for (const [name, state] of Object.entries(records)) {
    try {
      await query(
        `INSERT INTO connector_state (connector_name, last_cursor, last_polled_at, status, config)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (connector_name) DO UPDATE SET
           last_cursor = EXCLUDED.last_cursor,
           last_polled_at = EXCLUDED.last_polled_at,
           status = EXCLUDED.status`,
        [
          name,
          state.lastCursor || null,
          state.lastPolledAt || null,
          state.status || 'active',
          JSON.stringify(state.config || {}),
        ],
      );
      migrated++;
    } catch (error) {
      console.error(`[migration] Connector state failed for ${name}:`, error.message);
    }
  }

  console.log(`[migration] Connector states: ${migrated} migrated`);
  return { migrated, skipped: 0 };
}

/**
 * Run the full migration from JSON to Postgres.
 * @param {Object} options - { includeFeedback, includeThemes, includeActions, includeConnectors }
 * @returns {Promise<Object>} - Migration summary
 */
export async function runMigration(options = {}) {
  const includeFeedback = options.includeFeedback !== false;
  const includeThemes = options.includeThemes !== false;
  const includeActions = options.includeActions !== false;
  const includeConnectors = options.includeConnectors !== false;

  const summary = {};

  if (includeFeedback) {
    summary.feedback = await migrateFeedback();
  }
  if (includeThemes) {
    summary.themes = await migrateThemes();
  }
  if (includeActions) {
    summary.actions = await migrateActions();
  }
  if (includeConnectors) {
    summary.connectors = await migrateConnectorState();
  }

  return summary;
}