import { config } from '../../config/env.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Connector State Store
// Persists connector cursor/state so polling can resume.
// Supports JSON file storage (default) with PostgreSQL as an option.
// ============================================================

class ConnectorStateStore {
  constructor() {
    this.filePath = path.join(config.dataDir, 'connector_state.json');
    this._memory = null;
  }

  /**
   * Load all states from storage.
   * @returns {Promise<Object>}
   */
  async _load() {
    if (this._memory) return this._memory;

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this._memory = JSON.parse(raw);
    } catch {
      this._memory = {};
    }
    return this._memory;
  }

  /**
   * Persist all states to storage.
   */
  async _save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this._memory, null, 2), 'utf-8');
  }

  /**
   * Get the state for a connector.
   * @param {string} connectorName
   * @returns {Promise<Object|null>}
   */
  async get(connectorName) {
    const all = await this._load();
    return all[connectorName] || null;
  }

  /**
   * Set the state for a connector.
   * @param {string} connectorName
   * @param {Object} state
   */
  async set(connectorName, state) {
    const all = await this._load();
    all[connectorName] = state;
    await this._save();
  }

  /**
   * Delete the state for a connector.
   * @param {string} connectorName
   */
  async delete(connectorName) {
    const all = await this._load();
    delete all[connectorName];
    await this._save();
  }

  /**
   * List all connectors with their states.
   * @returns {Promise<Object>}
   */
  async list() {
    return this._load();
  }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared ConnectorStateStore instance.
 * @returns {ConnectorStateStore}
 */
export function getStateStore() {
  if (!_instance) {
    _instance = new ConnectorStateStore();
  }
  return _instance;
}

export { ConnectorStateStore };