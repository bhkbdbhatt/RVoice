-- ============================================================
-- Retail VoC Engine - PostgreSQL Schema
-- Phase 1: Data Engine
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(255) UNIQUE,
  email VARCHAR(255),
  name VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_external_id ON customers(external_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ============================================================
-- FEEDBACK
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,              -- zendesk, intercom, app_store, web, email, etc.
  origin VARCHAR(50) NOT NULL DEFAULT 'unknown',
  external_id VARCHAR(255),                 -- ID from the source system
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
  product VARCHAR(100),
  store VARCHAR(100),
  journey_stage VARCHAR(50),
  metadata JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_external_id ON feedback(external_id);
CREATE INDEX IF NOT EXISTS idx_feedback_customer_id ON feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_product ON feedback(product);
CREATE INDEX IF NOT EXISTS idx_feedback_store ON feedback(store);
CREATE INDEX IF NOT EXISTS idx_feedback_journey_stage ON feedback(journey_stage);
CREATE INDEX IF NOT EXISTS idx_feedback_received_at ON feedback(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_text_gin ON feedback USING GIN (to_tsvector('english', text));

-- ============================================================
-- TOPICS / THEMES
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  topic_key VARCHAR(100) NOT NULL,          -- e.g. 'checkout', 'delivery', 'product_quality'
  sentiment VARCHAR(20) NOT NULL DEFAULT 'neutral',  -- positive, negative, neutral
  sentiment_score NUMERIC(5, 2) DEFAULT 0,
  confidence NUMERIC(5, 2) DEFAULT 0,
  matched_terms JSONB NOT NULL DEFAULT '[]',
  negated BOOLEAN NOT NULL DEFAULT FALSE,
  issue_score NUMERIC(5, 2) DEFAULT 0,
  severity VARCHAR(20) DEFAULT 'low',       -- low, medium, high
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_feedback_id ON topics(feedback_id);
CREATE INDEX IF NOT EXISTS idx_topics_topic_key ON topics(topic_key);
CREATE INDEX IF NOT EXISTS idx_topics_sentiment ON topics(sentiment);
CREATE INDEX IF NOT EXISTS idx_topics_severity ON topics(severity);
CREATE INDEX IF NOT EXISTS idx_topics_issue_score ON topics(issue_score DESC);

-- ============================================================
-- ACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  feedback_id UUID REFERENCES feedback(id) ON DELETE SET NULL,
  recommended_action TEXT NOT NULL,
  aspect VARCHAR(100),
  owner VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, assigned, in_progress, resolved, closed
  severity VARCHAR(20) DEFAULT 'low',
  priority SMALLINT DEFAULT 0,
  due_date TIMESTAMPTZ,
  notes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actions_topic_id ON actions(topic_id);
CREATE INDEX IF NOT EXISTS idx_actions_feedback_id ON actions(feedback_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_owner ON actions(owner);
CREATE INDEX IF NOT EXISTS idx_actions_severity ON actions(severity);
CREATE INDEX IF NOT EXISTS idx_actions_due_date ON actions(due_date);

-- ============================================================
-- INGESTION LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  batch_id UUID NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',  -- processing, completed, failed
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_source ON ingestion_log(source);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_batch_id ON ingestion_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_status ON ingestion_log(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_started_at ON ingestion_log(started_at DESC);

-- ============================================================
-- IDEMPOTENCY KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash CHAR(64) NOT NULL UNIQUE,        -- SHA-256 of source + external_id
  source VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_hash ON idempotency_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_source_external ON idempotency_keys(source, external_id);

-- ============================================================
-- CONNECTOR STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_name VARCHAR(100) NOT NULL UNIQUE,
  last_cursor VARCHAR(500),
  last_polled_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, paused, error
  error_message TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_state_name ON connector_state(connector_name);
CREATE INDEX IF NOT EXISTS idx_connector_state_status ON connector_state(status);

-- ============================================================
-- CHAT SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(64) NOT NULL UNIQUE,   -- client-generated UUID v4
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_active ON chat_sessions(last_active_at DESC);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(64) NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'bot')),
  message TEXT NOT NULL,
  intent VARCHAR(100),
  confidence NUMERIC(5, 4),
  data JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);

-- ============================================================
-- OUTBOX EVENTS (for CDC / event-driven architecture)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50) NOT NULL,      -- feedback, topic, action
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,         -- created, updated, deleted
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_published ON outbox_events(published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_events_created ON outbox_events(created_at);

-- ============================================================
-- TRIGGERS: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_feedback_updated_at ON feedback;
CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_actions_updated_at ON actions;
CREATE TRIGGER trg_actions_updated_at
  BEFORE UPDATE ON actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_connector_state_updated_at ON connector_state;
CREATE TRIGGER trg_connector_state_updated_at
  BEFORE UPDATE ON connector_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- OUTBOX TRIGGERS: auto-publish events on INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION publish_feedback_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('feedback', NEW.id, 'created', row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feedback_outbox ON feedback;
CREATE TRIGGER trg_feedback_outbox
  AFTER INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION publish_feedback_event();

CREATE OR REPLACE FUNCTION publish_topic_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('topic', NEW.id, 'created', row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_topics_outbox ON topics;
CREATE TRIGGER trg_topics_outbox
  AFTER INSERT ON topics
  FOR EACH ROW EXECUTE FUNCTION publish_topic_event();

CREATE OR REPLACE FUNCTION publish_action_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('action', NEW.id, 'created', row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actions_outbox ON actions;
CREATE TRIGGER trg_actions_outbox
  AFTER INSERT ON actions
  FOR EACH ROW EXECUTE FUNCTION publish_action_event();

-- ============================================================
-- VIEWS
-- ============================================================

-- Feedback with topic aggregation
CREATE OR REPLACE VIEW v_feedback_with_topics AS
SELECT
  f.id,
  f.source,
  f.origin,
  f.external_id,
  f.customer_id,
  f.text,
  f.rating,
  f.product,
  f.store,
  f.journey_stage,
  f.metadata,
  f.received_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'topic_key', t.topic_key,
        'sentiment', t.sentiment,
        'sentiment_score', t.sentiment_score,
        'confidence', t.confidence,
        'issue_score', t.issue_score,
        'severity', t.severity
      )
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'::jsonb
  ) AS topics
FROM feedback f
LEFT JOIN topics t ON t.feedback_id = f.id
GROUP BY f.id;

-- Theme clusters by product + journey stage
CREATE OR REPLACE VIEW v_theme_clusters AS
SELECT
  COALESCE(f.product, 'general') || '-' || COALESCE(f.journey_stage, 'general') AS cluster_id,
  f.product,
  f.journey_stage,
  COUNT(DISTINCT f.id) AS feedback_count,
  COUNT(DISTINCT t.id) AS topic_count,
  COUNT(*) FILTER (WHERE t.sentiment = 'positive') AS positive_count,
  COUNT(*) FILTER (WHERE t.sentiment = 'negative') AS negative_count,
  COUNT(*) FILTER (WHERE t.sentiment = 'neutral') AS neutral_count,
  AVG(t.issue_score) AS avg_issue_score,
  MAX(t.issue_score) AS max_issue_score
FROM feedback f
LEFT JOIN topics t ON t.feedback_id = f.id
GROUP BY f.product, f.journey_stage;

-- Emerging issues (spikes)
CREATE OR REPLACE VIEW v_emerging_issues AS
SELECT
  t.id AS topic_id,
  t.topic_key,
  t.sentiment,
  t.sentiment_score,
  t.confidence,
  t.issue_score,
  t.severity,
  f.text,
  f.product,
  f.store,
  f.journey_stage,
  f.received_at
FROM topics t
JOIN feedback f ON f.id = t.feedback_id
WHERE t.issue_score >= 2
ORDER BY t.issue_score DESC, f.received_at DESC;

-- ============================================================
-- SEED DATA: Connector state for pilot sources
-- ============================================================
INSERT INTO connector_state (connector_name, status, config)
VALUES
  ('zendesk', 'active', '{"type": "api", "pagination": "cursor"}'),
  ('intercom', 'active', '{"type": "api", "pagination": "cursor"}'),
  ('app_store', 'active', '{"type": "api", "pagination": "page"}')
ON CONFLICT (connector_name) DO NOTHING;