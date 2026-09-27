import express from 'express';
import { recommendActionsForTheme, persistActions, getActions, updateAction } from '../services/actionService.js';
import { getThemes } from '../services/themeService.js';
import { requireAnyRole } from '../auth/authMiddleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const actions = await getActions(req.query);
    res.json({ actions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAnyRole('admin', 'manager'), async (req, res) => {
  try {
    const themes = await getThemes(req.body.query || {});
    const actions = themes.map((theme) => recommendActionsForTheme(theme));
    const saved = await persistActions(actions);
    res.status(201).json({ actions: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:actionId', requireAnyRole('admin', 'manager'), async (req, res) => {
  try {
    const updated = await updateAction(req.params.actionId, req.body);
    res.json({ action: updated });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

export default router;
