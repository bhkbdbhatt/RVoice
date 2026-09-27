import express from 'express';
import { getThemes } from '../services/themeService.js';
import { detectSpikes } from '../services/detectionService.js';

const router = express.Router();

router.get('/spikes', async (req, res) => {
  try {
    const themes = await getThemes(req.query);
    const spikes = detectSpikes(themes);
    res.json({ spikes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
