import express from 'express';
import { ingestFeedback, getFeedback } from '../services/feedbackService.js';
import { requireAnyRole } from '../auth/authMiddleware.js';

const router = express.Router();

router.post('/ingest', requireAnyRole('admin', 'ingest'), async (req, res) => {
  try {
    const items = await ingestFeedback(req.body.items || []);
    res.status(201).json({ ingested: items.length, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await getFeedback(req.query);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
