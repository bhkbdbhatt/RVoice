// backend/src/routes/chat.js
// Express router for the chatbot API
// Provides:
//   POST /api/chat          – handles incoming messages and returns bot replies
//   GET  /api/chat/history/:sessionId – retrieves chat history for a session
// ---------------------------------------------------------------
import express from 'express';
const router = express.Router();

// Import the core chat logic
import { handleChat } from '../services/chatService.js';
import { createSession, getChatHistory } from '../services/chatHistoryService.js';

// -------------------------------------------------------------------
// POST /api/chat
//   Body: { message: string, sessionId?: string }
//   Returns: { reply: string, intent: string, confidence: number, data: any, sessionId: string }
// -------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message field is required' });
  }

  const sessionIdToUse = sessionId || (await createSession());

  try {
    const result = await handleChat(message.trim(), sessionIdToUse);
    res.json({ ...result, sessionId: sessionIdToUse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------------
// GET /api/chat/history/:sessionId
//   Returns an array of recent messages for the given session.
// -------------------------------------------------------------------
router.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const messages = await getChatHistory(sessionId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;