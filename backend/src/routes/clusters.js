import express from 'express';
import { getThemes } from '../services/themeService.js';
import { clusterThemes } from '../services/themeClusteringService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const themes = await getThemes(req.query);
    const clusters = clusterThemes(themes);
    res.json({ clusters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
