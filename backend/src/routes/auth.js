import express from 'express';
import { getUserInfo } from '../auth/authMiddleware.js';

const router = express.Router();

router.get('/user', (req, res) => {
  res.json({ user: getUserInfo(req) });
});

export default router;
