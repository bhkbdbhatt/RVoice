import express from 'express';
import { processWebhook } from '../ingestion/ingestionService.js';
import { listConnectors, getConnector } from '../ingestion/connectors/index.js';
import { normalizePayload } from '../ingestion/adapters/index.js';
import { config } from '../config/env.js';
import { requireAnyRole } from '../auth/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/ingestion/webhook/:source
 * Accepts raw feedback payloads from any source and processes them async.
 * Returns 202 Accepted immediately.
 */
router.post('/webhook/:source', requireAnyRole('admin', 'ingest'), async (req, res) => {
  const { source } = req.params;

  // Validate batch size
  const itemCount = Array.isArray(req.body) ? req.body.length : req.body?.items?.length || 1;
  if (itemCount > config.ingestion.maxBatchSize) {
    return res.status(413).json({
      error: `Batch too large: ${itemCount} items. Max is ${config.ingestion.maxBatchSize}.`,
    });
  }

  // Extract the payload
  const payload = req.body?.items || req.body;

  // Fire-and-forget processing (returns 202 immediately)
  processWebhook({ source, body: payload, metadata: req.body?.metadata })
    .then((result) => {
      console.log(`[webhook:${source}] Processed batch ${result.batchId}: ${result.ingested} ingested, ${result.duplicates} duplicates`);
    })
    .catch((error) => {
      console.error(`[webhook:${source}] Processing failed:`, error.message);
    });

  // Return 202 Accepted immediately
  res.status(202).json({
    status: 'accepted',
    source,
    itemCount,
    message: `Feedback batch queued for processing from ${source}`,
  });
});

/**
 * POST /api/ingestion/normalize
 * Normalizes a payload without persisting (useful for testing adapters).
 */
router.post('/normalize', requireAnyRole('admin', 'ingest'), (req, res) => {
  const { source, items } = req.body;
  if (!source || !items) {
    return res.status(400).json({ error: 'source and items are required' });
  }

  try {
    const normalized = normalizePayload(source, items);
    res.json({ source, normalizedCount: normalized.length, normalized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ingestion/connectors
 * Lists all registered connectors and their status.
 */
router.get('/connectors', async (req, res) => {
  try {
    const connectors = listConnectors();
    const stateStore = (await import('../ingestion/connectors/stateStore.js')).getStateStore();
    const states = await stateStore.list();

    const result = connectors.map((connector) => ({
      ...connector,
      state: states[connector.name] || { status: 'unknown' },
    }));

    res.json({ connectors: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingestion/connectors/:name/poll
 * Manually triggers a poll for a connector.
 */
router.post('/connectors/:name/poll', requireAnyRole('admin', 'ingest'), async (req, res) => {
  const { name } = req.params;
  try {
    const connector = getConnector(name, req.body?.config || {});
    await connector.loadState();

    // Start polling in background
    const pollPromise = connector.poll({ limit: req.body?.limit || 100 });
    res.status(202).json({
      status: 'accepted',
      connector: name,
      message: 'Poll started in background',
    });
    await pollPromise;
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ingestion/connectors/:name/health
 * Checks the health of a connector.
 */
router.get('/connectors/:name/health', async (req, res) => {
  const { name } = req.params;
  try {
    const connector = getConnector(name);
    const health = await connector.healthCheck();
    res.json({ connector: name, ...health });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;