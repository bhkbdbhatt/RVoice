import { config, isPostgresMode } from '../config/env.js';

/**
 * Build the PostgreSQL connection string from config.
 */
function buildConnectionString() {
  const { host, port, database, user, password } = config.postgres;
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

// ============================================================
// Database Connection Layer
// Supports two modes:
//   1. JSON file storage (default, for local dev / POC)
//   2. PostgreSQL (enterprise, when DATABASE_URL is configured)
// ============================================================

let pgPool = null;
let pgClient = null;

/**
 * Get the active storage mode.
 * @returns {'json' | 'postgres'}
 */
export function getStorageMode() {
  return isPostgresMode() ? 'postgres' : 'json';
}

/**
 * Initialize the database connection.
 * - In JSON mode: no-op (file-based storage handled by storageService)
 * - In Postgres mode: creates a connection pool
 */
export async function initDatabase() {
  if (!isPostgresMode()) {
    console.log('[db] Using JSON file storage (local dev mode)');
    return { mode: 'json' };
  }

  try {
    const { default: pg } = await import('pg');
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL || buildConnectionString(),
      max: config.postgres.max,
      idleTimeoutMillis: config.postgres.idleTimeoutMillis,
      connectionTimeoutMillis: 5000,
    });

    // Test the connection
    pgClient = await pgPool.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    pgClient = null;

    console.log('[db] Connected to PostgreSQL');
    return { mode: 'postgres', pool: pgPool };
  } catch (error) {
    console.error('[db] Failed to connect to PostgreSQL:', error.message);
    console.warn('[db] Falling back to JSON file storage');
    return { mode: 'json' };
  }
}

/**
 * Get the PostgreSQL pool (only valid in postgres mode).
 * @returns {import('pg').Pool}
 */
export function getPool() {
  if (!isPostgresMode() || !pgPool) {
    throw new Error('PostgreSQL pool not initialized. Check DATABASE_URL config.');
  }
  return pgPool;
}

/**
 * Execute a query against the database.
 * In JSON mode, this throws - use storageService instead.
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params = []) {
  if (!isPostgresMode() || !pgPool) {
    throw new Error('Cannot execute SQL query in JSON mode. Use storageService instead.');
  }
  return pgPool.query(text, params);
}

/**
 * Execute a transaction with multiple queries.
 * @param {Function} callback - async (client) => { ... }
 * @returns {Promise<any>} - Result of the callback
 */
export async function withTransaction(callback) {
  if (!isPostgresMode() || !pgPool) {
    throw new Error('Cannot execute transaction in JSON mode. Use storageService instead.');
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database connection.
 */
export async function closeDatabase() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

/**
 * Check database health.
 * @returns {Promise<{mode: string, status: string, latencyMs?: number}>}
 */
export async function checkDatabaseHealth() {
  if (!isPostgresMode() || !pgPool) {
    return { mode: 'json', status: 'ok' };
  }

  const start = Date.now();
  try {
    await query('SELECT 1');
    return {
      mode: 'postgres',
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      mode: 'postgres',
      status: 'error',
      error: error.message,
    };
  }
}