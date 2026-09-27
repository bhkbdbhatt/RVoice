/**
 * Environment configuration for the VoC engine.
 * Centralizes all environment variables with sensible defaults
 * so the app runs locally without external services (JSON fallback mode).
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;

export const config = {
  // Server
  port: parseInt(env.PORT || '4000', 10),
  nodeEnv: env.NODE_ENV || 'development',

  // Storage mode: 'json' (local dev, no deps) | 'postgres' (production)
  storageMode: env.STORAGE_MODE || 'json',

  // Postgres
  postgres: {
    host: env.PGHOST || 'localhost',
    port: parseInt(env.PGPORT || '5432', 10),
    database: env.PGDATABASE || 'voc_engine',
    user: env.PGUSER || 'postgres',
    password: env.PGPASSWORD || 'postgres',
    // Connection pool
    max: parseInt(env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(env.PG_IDLE_TIMEOUT || '30000', 10),
  },

  // Message queue: 'memory' (local dev) | 'kafka' (production)
  queueMode: env.QUEUE_MODE || 'memory',
  kafka: {
    brokers: (env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: env.KAFKA_CLIENT_ID || 'voc-engine',
    topics: {
      rawFeedback: env.KAFKA_TOPIC_RAW || 'voc.raw-feedback',
      normalizedFeedback: env.KAFKA_TOPIC_NORMALIZED || 'voc.normalized-feedback',
      processedFeedback: env.KAFKA_TOPIC_PROCESSED || 'voc.processed-feedback',
      deadLetter: env.KAFKA_TOPIC_DLQ || 'voc.dead-letter',
    },
  },

  // Data directory for JSON fallback mode
  dataDir: env.DATA_DIR || path.join(__dirname, '..', '..', 'data'),

  // Ingestion
  ingestion: {
    // Max items per batch request
    maxBatchSize: parseInt(env.INGEST_MAX_BATCH || '1000', 10),
    // Idempotency key TTL in days (how long we remember processed external IDs)
    idempotencyTtlDays: parseInt(env.IDEMPOTENCY_TTL_DAYS || '90', 10),
    // Default retry count for failed processing
    maxRetries: parseInt(env.INGEST_MAX_RETRIES || '3', 10),
  },

  // Tracking pixel (embedded on third-party websites — public endpoints)
  pixel: {
    enabled: env.PIXEL_ENABLED !== 'false',
    autoIngest: env.PIXEL_AUTO_INGEST !== 'false',
  },

  // Chat / AI
  openai: {
    apiKey: env.OPENAI_API_KEY || '',
    model: env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens: parseInt(env.OPENAI_MAX_TOKENS || '400', 10),
    temperature: parseFloat(env.OPENAI_TEMPERATURE || '0.5'),
  },

  // PII detection & masking
  pii: {
    enabled: env.PII_MASKING_ENABLED !== 'false',
    // Mask customer email/name fields in addition to text
    maskCustomerFields: env.PII_MASK_CUSTOMER_FIELDS !== 'false',
  },

  chat: {
    maxHistoryPerSession: parseInt(env.CHAT_MAX_HISTORY || '50', 10),
    sessionTtlHours: parseInt(env.CHAT_SESSION_TTL_HOURS || '24', 10),
  },

  // Lightweight ML layer (optional, via @xenova/transformers)
  ml: {
    enabled: env.ML_ENABLED === 'true',
    cacheDir: env.ML_CACHE_DIR || path.join(__dirname, '..', '..', '.cache', 'models'),
    models: {
      sentiment: env.ML_SENTIMENT_MODEL || 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      zeroShot: env.ML_ZERO_SHOT_MODEL || 'Xenova/mobilebert-uncased-mnli',
    },
    timeoutMs: parseInt(env.ML_TIMEOUT_MS || '10000', 10),
  },

  auth: {
    issuer: env.KEYCLOAK_ISSUER || env.OIDC_ISSUER || 'http://localhost:8080/auth/realms/voc',
    audience: env.KEYCLOAK_AUDIENCE || env.OIDC_AUDIENCE || 'voc-backend',
    clientId: env.KEYCLOAK_CLIENT_ID || env.OIDC_CLIENT_ID || 'voc-client',
    mode: (env.AUTH_MODE || 'local').toLowerCase(),
    requireAuth: env.REQUIRE_AUTH !== 'false',
    localAuthEnabled:
      env.LOCAL_AUTH_ENABLED !== 'false' || (env.AUTH_MODE || 'local').toLowerCase() !== 'oidc' || env.REQUIRE_AUTH === 'false',
    allowInsecureLocal: env.ALLOW_INSECURE_LOCAL === 'true',
    defaultLocalRoles: env.LOCAL_DEFAULT_ROLES
      ? env.LOCAL_DEFAULT_ROLES.split(',').map((role) => role.trim()).filter(Boolean)
      : ['admin', 'manager', 'ingest', 'analyst'],
    localRolesFile: env.LOCAL_ROLES_FILE || path.join(__dirname, '..', '..', 'data', 'roles.json'),
  },

  // Connector polling defaults
  polling: {
    defaultIntervalMs: parseInt(env.POLL_DEFAULT_INTERVAL_MS || '60000', 10),
    maxPageSize: parseInt(env.POLL_MAX_PAGE_SIZE || '100', 10),
  },

  // Real-time WebSocket streaming (Could Have)
  rt: {
    enabled: env.REALTIME_ENABLED !== 'false',
    wsPath: env.REALTIME_WS_PATH || '/ws',
    maxPayloadBytes: parseInt(env.REALTIME_MAX_PAYLOAD || '1048576', 10),
    heartbeatIntervalMs: parseInt(env.REALTIME_HEARTBEAT_MS || '30000', 10),
  },

  // Language detection & multi-language support (Could Have)
  language: {
    autoDetect: env.LANGUAGE_AUTO_DETECT !== 'false',
    defaultLanguage: env.DEFAULT_LANGUAGE || 'en',
  },

  // Export & reporting (Could Have)
  export: {
    formats: (env.EXPORT_FORMATS || 'csv,html,pdf').split(',').map((f) => f.trim()).filter(Boolean),
    maxExportRows: parseInt(env.EXPORT_MAX_ROWS || '10000', 10),
  },

  // External AI models — OpenAI (Could Have)
  ai: {
    insightsEnabled: env.OPENAI_INSIGHTS_ENABLED !== 'false',
    fallbackEnabled: env.OPENAI_FALLBACK_ENABLED !== 'false',
    timeoutMs: parseInt(env.OPENAI_TIMEOUT_MS || '30000', 10),
    offlineMode: env.ML_OFFLINE_MODE === 'true',
  },
};

export function isPostgresMode() {
  return config.storageMode === 'postgres';
}

export function isKafkaMode() {
  return config.queueMode === 'kafka';
}