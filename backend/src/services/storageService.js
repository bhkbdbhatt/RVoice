import fs from 'fs/promises';
import path from 'path';

const dataDir = path.resolve('data');
const feedbackPath = path.join(dataDir, 'feedback.json');
const themePath = path.join(dataDir, 'themes.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {
    // ignore
  }
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeJson(filePath, data) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function loadFeedbackStore() {
  return readJson(feedbackPath);
}

export async function saveFeedbackStore(records) {
  await writeJson(feedbackPath, records);
}

export async function loadThemeStore() {
  return readJson(themePath);
}

export async function saveThemeStore(records) {
  await writeJson(themePath, records);
}

const actionPath = path.join(dataDir, 'actions.json');

export async function loadActionStore() {
  return readJson(actionPath);
}

export async function saveActionStore(records) {
  await writeJson(actionPath, records);
}

const chatHistoryPath = path.join(dataDir, 'chatHistory.json');

export async function loadChatHistory() {
  return readJson(chatHistoryPath);
}

export async function saveChatHistory(records) {
  await writeJson(chatHistoryPath, records);
}
