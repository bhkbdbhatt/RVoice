// ============================================================
// Base Connector
// Abstract class for source connectors.
// Handles polling, pagination, and cursor state management.
// ============================================================

export class BaseConnector {
  /**
   * @param {Object} options
   * @param {string} options.name - Connector name (e.g. 'zendesk')
   * @param {Object} options.config - Connector config (apiKey, baseUrl, etc.)
   * @param {Object} options.stateStore - State store for cursor persistence
   */
  constructor({ name, config = {}, stateStore = null }) {
    this.name = name;
    this.config = config;
    this.stateStore = stateStore;
    this.lastCursor = config.lastCursor || null;
    this.isRunning = false;
  }

  /**
   * Load persisted state (cursor, last poll time).
   */
  async loadState() {
    if (!this.stateStore) return;
    const state = await this.stateStore.get(this.name);
    if (state) {
      this.lastCursor = state.lastCursor || null;
      this.lastPolledAt = state.lastPolledAt || null;
    }
  }

  /**
   * Persist current state.
   */
  async saveState() {
    if (!this.stateStore) return;
    await this.stateStore.set(this.name, {
      lastCursor: this.lastCursor,
      lastPolledAt: new Date().toISOString(),
      status: 'active',
    });
  }

  /**
   * Fetch a page of raw records from the source.
   * Must be implemented by subclasses.
   * @param {Object} options - { cursor, limit }
   * @returns {Promise<{items: Array, nextCursor: string|null}>}
   */
  async fetchPage(_options) {
    throw new Error('fetchPage() must be implemented by subclass');
  }

  /**
   * Poll the source for new records.
   * @param {Object} options - { limit }
   * @returns {Promise<Array>} - Array of raw records
   */
  async poll({ limit = 100 } = {}) {
    if (this.isRunning) {
      console.warn(`[connector:${this.name}] Poll already in progress, skipping`);
      return [];
    }

    this.isRunning = true;
    const allItems = [];
    let cursor = this.lastCursor;

    try {
      for (let page = 0; page < this.config.maxPages || 10; page++) {
        const { items, nextCursor } = await this.fetchPage({
          cursor,
          limit,
        });

        allItems.push(...items);

        if (!nextCursor || items.length < limit) {
          this.lastCursor = nextCursor || cursor;
          break;
        }

        cursor = nextCursor;
      }

      await this.saveState();
      console.log(`[connector:${this.name}] Polled ${allItems.length} records`);
      return allItems;
    } catch (error) {
      console.error(`[connector:${this.name}] Poll failed:`, error.message);
      if (this.stateStore) {
        await this.stateStore.set(this.name, {
          lastCursor: this.lastCursor,
          lastPolledAt: new Date().toISOString(),
          status: 'error',
          errorMessage: error.message,
        });
      }
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Health check for the connector.
   * @returns {Promise<{status: string, message?: string}>}
   */
  async healthCheck() {
    return {
      status: 'unknown',
      message: 'healthCheck() not implemented',
    };
  }
}