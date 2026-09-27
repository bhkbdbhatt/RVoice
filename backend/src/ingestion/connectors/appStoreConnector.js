import { BaseConnector } from './baseConnector.js';

// ============================================================
// App Store Connector
// Fetches customer reviews via the App Store Connect API.
//
// Config:
//   {
//     issuerId: 'your-issuer-id',
//     keyId: 'your-key-id',
//     privateKey: 'path-or-content-of-private-key',
//     appId: 'your-app-id',
//     maxPages: 10
//   }
//
// API Endpoint:
//   GET https://api.appstoreconnect.apple.com/v1/apps/{appId}/customerReviews?limit={limit}
// ============================================================

const APPSTORE_API_BASE = 'https://api.appstoreconnect.apple.com';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/oauth2/token';
const TOKEN_TTL_SECONDS = 1200; // Apple tokens are valid for 20 minutes

export class AppStoreConnector extends BaseConnector {
  constructor({ config = {}, stateStore = null }) {
    super({ name: 'app_store', config, stateStore });
    this._jwt = null;
    this._jwtExpiresAt = 0;
  }

  /**
   * Generate a JWT token for App Store Connect API.
   * Implements ES256 signing with the Apple private key.
   * @returns {Promise<string>} - JWT token
   */
  async _generateJwt() {
    if (!this.config.issuerId || !this.config.keyId || !this.config.privateKey) {
      throw new Error('App Store connector requires issuerId, keyId, and privateKey in config');
    }

    try {
      // Try to load the jsonwebtoken library (optional dependency)
      const jwt = (await import('jsonwebtoken')).default;
      const now = Math.floor(Date.now() / 1000);
      return jwt.sign({}, this.config.privateKey, {
        algorithm: 'ES256',
        issuer: this.config.issuerId,
        header: { alg: 'ES256', kid: this.config.keyId, typ: 'JWT' },
        expiresIn: TOKEN_TTL_SECONDS,
      });
    } catch {
      // If jsonwebtoken is not installed, fall back to a minimal JWT implementation
      // using Node's built-in crypto (only if privateKey is PEM format)
      console.warn('[app_store] jsonwebtoken not available, using built-in crypto fallback');
      return this._generateJwtManually(Math.floor(Date.now() / 1000));
    }
  }

  /**
   * Manual JWT generation using Node's crypto module.
   * @param {number} now - Current epoch seconds
   * @returns {string} - JWT token
   */
  async _generateJwtManually(now) {
    const crypto = (await import('crypto')).default;
    const header = { alg: 'ES256', kid: this.config.keyId, typ: 'JWT' };
    const payload = {
      iss: this.config.issuerId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      aud: APPLE_AUTH_URL,
    };

    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const signature = crypto.sign('sha256', Buffer.from(signingInput), this.config.privateKey);
    return `${signingInput}.${signature.toString('base64url')}`;
  }

  /**
   * Get a valid JWT token (cached until near expiry).
   * @returns {Promise<string>} - JWT token
   */
  async _getToken() {
    const now = Date.now();
    if (this._jwt && this._jwtExpiresAt > now + 30000) {
      return this._jwt;
    }
    this._jwt = await this._generateJwt();
    this._jwtExpiresAt = now + TOKEN_TTL_SECONDS * 1000;
    return this._jwt;
  }

  /**
   * Build the authorization header for App Store Connect API.
   * @returns {Promise<Object>} - Authorization header
   */
  async _authHeaders() {
    const token = await this._getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetch a page of customer reviews from App Store Connect.
   * @param {Object} options - { cursor, limit }
   * @returns {Promise<{items: Array, nextCursor: string|null}>}
   */
  async fetchPage({ cursor, limit = 100 } = {}) {
    if (!this.config.appId) {
      throw new Error('App Store connector requires appId in config');
    }

    const perPage = Math.min(limit, 200);
    const url = new URL(`${APPSTORE_API_BASE}/v1/apps/${this.config.appId}/customerReviews`);
    url.searchParams.set('limit', String(perPage));
    url.searchParams.set('sort', '-createdDate');

    // App Store Connect uses a next-page link with `cursor` query param
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: { ...(await this._authHeaders()) },
    });

    if (!response.ok) {
      throw new Error(`App Store API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      items: data.data || [],
      nextCursor: data.links?.next ? new URL(data.links.next).searchParams.get('cursor') : null,
    };
  }

  /**
   * Health check for the App Store connector.
   * @returns {Promise<{status: string, message?: string}>}
   */
  async healthCheck() {
    try {
      const response = await fetch(`${APPSTORE_API_BASE}/v1/apps/${this.config.appId}`, {
        headers: { ...(await this._authHeaders()) },
      });
      if (response.ok) {
        return { status: 'ok', message: 'Authenticated to App Store Connect API' };
      }
      return { status: 'error', message: `App Store API responded with ${response.status}` };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}