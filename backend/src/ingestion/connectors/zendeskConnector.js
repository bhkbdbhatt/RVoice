import { BaseConnector } from './baseConnector.js';

// ============================================================
// Zendesk Connector
// Fetches tickets via the Zendesk API.
//
// Config:
//   {
//     subdomain: 'your-subdomain',
//     apiToken: 'your-api-token',
//     email: 'agent@example.com',
//     maxPages: 10
//   }
//
// API Endpoint:
//   GET https://{subdomain}.zendesk.com/api/v2/incremental/tickets.json?start_time={cursor}
// ============================================================

const ZENDESK_API_BASE = 'https://{subdomain}.zendesk.com/api/v2';

export class ZendeskConnector extends BaseConnector {
  constructor({ config = {}, stateStore = null }) {
    super({ name: 'zendesk', config, stateStore });
  }

  /**
   * Build the authentication header for Zendesk API.
   * Supports both API token and OAuth token auth.
   * @returns {Object} - Authorization header
   */
  _authHeaders() {
    if (this.config.apiToken && this.config.email) {
      const token = Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    if (this.config.oauthToken) {
      return { Authorization: `Bearer ${this.config.oauthToken}` };
    }
    throw new Error('Zendesk connector requires apiToken+email or oauthToken in config');
  }

  /**
   * Build the API base URL.
   * @returns {string}
   */
  _baseUrl() {
    return ZENDESK_API_BASE.replace('{subdomain}', this.config.subdomain);
  }

  /**
   * Fetch a page of tickets from Zendesk.
   * @param {Object} options - { cursor, limit }
   * @returns {Promise<{items: Array, nextCursor: string|null}>}
   */
  async fetchPage({ cursor, limit = 100 } = {}) {
    const perPage = Math.min(limit, 100);
    const url = new URL(`${this._baseUrl()}/incremental/tickets.json`);
    url.searchParams.set('per_page', String(perPage));
    if (cursor) {
      url.searchParams.set('start_time', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        ...this._authHeaders(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      items: data.tickets || [],
      nextCursor: data.next_page ? new URL(data.next_page).searchParams.get('start_time') : null,
    };
  }

  /**
   * Health check for the Zendesk connector.
   * @returns {Promise<{status: string, message?: string}>}
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this._baseUrl()}/account.json`, {
        headers: { ...this._authHeaders() },
      });
      if (response.ok) {
        return { status: 'ok', message: 'Authenticated to Zendesk API' };
      }
      return { status: 'error', message: `Zendesk API responded with ${response.status}` };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}