import express from 'express';
import { estimateThemes, getThemes } from '../services/themeService.js';
import { requireAnyRole } from '../auth/authMiddleware.js';

const router = express.Router();

router.post('/estimate', requireAnyRole('admin', 'analyst'), async (req, res) => {
  try {
    const themes = await estimateThemes(req.body.items || []);
    res.status(200).json({ themes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const themes = await getThemes(req.query);
    res.json({ themes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
