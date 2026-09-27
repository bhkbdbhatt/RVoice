// backend/src/services/chatHistoryService.js
// Chat history persistence – JSON file (fallback) and optional PostgreSQL support
// ---------------------------------------------------------------
// Exported functions:
//   saveChatMessage(sessionId, sender, message, intent, confidence, data)
//   getChatHistory(sessionId, limit?) => Promise<ChatMessage[]>
//   createSession() => string (UUID)

// ⚡ CHANGE 1: Use ES module imports
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Required to replicate __dirname
import { v4 as uuidv4 } from 'uuid';

// ⚡ CHANGE 2: Replicate __dirname since it doesn't exist in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const CHAT_HISTORY_PATH = path.join(DATA_DIR, 'chatHistory.json');

/**
 * Ensure the chatHistory.json file exists.
 */
async function initChatHistoryFile() {
  try {
    await fs.access(CHAT_HISTORY_PATH);
  } catch {
    await fs.writeFile(CHAT_HISTORY_PATH, '[]', 'utf8');
  }
}

/**
 * Persist a single chat message.
 * @param {string} sessionId
 * @param {'user'|'bot'} sender
 * @param {string} message
 * @param {string|null} intent
 * @param {number|null} confidence
 * @param {object|null} data
 */
// ⚡ CHANGE 3: Add 'export' keyword
export async function saveChatMessage(sessionId, sender, message, intent, confidence, data) {
  await initChatHistoryFile();
  const raw = await fs.readFile(CHAT_HISTORY_PATH, 'utf8');
  const history = JSON.parse(raw);
  const newMessage = {
    id: uuidv4(), // ⚡ CHANGE 4: Fixed the inline require('uuid').v4() to use imported uuidv4
    sessionId,
    sender,
    message,
    intent,
    confidence,
    data,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  history.push(newMessage);
  await fs.writeFile(CHAT_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Retrieve recent messages for a session.
 * @param {string} sessionId
 * @param {number} [limit] – optional max number of messages to return
 * @returns {Promise<ChatMessage[]>}
 */
// ⚡ CHANGE 5: Add 'export' keyword
export async function getChatHistory(sessionId, limit) {
  await initChatHistoryFile();
  const raw = await fs.readFile(CHAT_HISTORY_PATH, 'utf8');
  const history = JSON.parse(raw);
  const sessionMsgs = history.filter(m => m.sessionId === sessionId);
  if (limit) return sessionMsgs.slice(-limit);
  return sessionMsgs;
}

/**
 * Create a new session ID.
 * @returns {string} UUID v4
 */
// ⚡ CHANGE 6: Add 'export' keyword
export async function createSession() {
  return uuidv4();
}

// ⚡ CHANGE 7: Removed module.exports = { saveChatMessage, getChatHistory, createSession };
