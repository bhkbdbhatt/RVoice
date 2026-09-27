import { BaseConnector } from './baseConnector.js';

// ============================================================
// Intercom Connector
// Fetches conversations via the Intercom API.
//
// Config:
//   {
//     accessToken: 'your-access-token',
//     maxPages: 10
//   }
//
// API Endpoint:
//   GET https://api.intercom.io/conversations?per_page={limit}
//   GET https://api.intercom.io/conversations/{id} (for full conversation)
// ============================================================

const INTERCOM_API_BASE = 'https://api.intercom.io';

export class IntercomConnector extends BaseConnector {
  constructor({ config = {}, stateStore = null }) {
    super({ name: 'intercom', config, stateStore });
  }

  /**
   * Build the authorization header for Intercom API.
   * @returns {Object} - Authorization header
   */
  _authHeaders() {
    if (!this.config.accessToken) {
      throw new Error('Intercom connector requires accessToken in config');
    }
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Intercom-Version': this.config.apiVersion || '2.10',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetch a page of conversations from Intercom.
   * @param {Object} options - { cursor, limit }
   * @returns {Promise<{items: Array, nextCursor: string|null}>}
   */
  async fetchPage({ cursor, limit = 100 } = {}) {
    const perPage = Math.min(limit, 150);
    const url = new URL(`${INTERCOM_API_BASE}/conversations`);
    url.searchParams.set('per_page', String(perPage));

    // Intercom uses a base64-encoded cursor
    if (cursor) {
      url.searchParams.set('starting_after', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: { ...this._authHeaders() },
    });

    if (!response.ok) {
      throw new Error(`Intercom API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Fetch full conversation details (includes conversation_parts with bodies)
    const fullConversations = [];
    for (const conv of data.conversations || []) {
      try {
        const detailRes = await fetch(`${INTERCOM_API_BASE}/conversations/${conv.id}`, {
          headers: { ...this._authHeaders() },
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          fullConversations.push(detail);
        } else {
          // Fallback to the summary if detail fetch fails
          fullConversations.push(conv);
        }
      } catch {
        fullConversations.push(conv);
      }
    }

    return {
      items: fullConversations,
      nextCursor: data.pages?.next?.starting_after || null,
    };
  }

  /**
   * Health check for the Intercom connector.
   * @returns {Promise<{status: string, message?: string}>}
   */
  async healthCheck() {
    try {
      const response = await fetch(`${INTERCOM_API_BASE}/me`, {
        headers: { ...this._authHeaders() },
      });
      if (response.ok) {
        return { status: 'ok', message: 'Authenticated to Intercom API' };
      }
      return { status: 'error', message: `Intercom API responded with ${response.status}` };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}