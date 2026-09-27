import express from 'express';
import { getActions } from '../services/actionService.js';
import { getThemes } from '../services/themeService.js';
import { clusterThemes } from '../services/themeClusteringService.js';
import { detectSpikes } from '../services/detectionService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const themes = await getThemes(req.query);
    const actions = await getActions(req.query);
    const clusters = clusterThemes(themes);
    const spikes = detectSpikes(themes);

    res.json({
      themeCount: themes.length,
      actionCount: actions.length,
      actions,
      clusters,
      spikes,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
