import { ZendeskConnector } from './zendeskConnector.js';
import { IntercomConnector } from './intercomConnector.js';
import { AppStoreConnector } from './appStoreConnector.js';
import { getStateStore } from './stateStore.js';

// ============================================================
// Connector Registry
// Maps source names to connector factories.
// ============================================================

export const CONNECTORS = {
  zendesk: {
    name: 'zendesk',
    label: 'Zendesk',
    create: (config = {}) => new ZendeskConnector({ config, stateStore: getStateStore() }),
  },
  intercom: {
    name: 'intercom',
    label: 'Intercom',
    create: (config = {}) => new IntercomConnector({ config, stateStore: getStateStore() }),
  },
  app_store: {
    name: 'app_store',
    label: 'App Store',
    create: (config = {}) => new AppStoreConnector({ config, stateStore: getStateStore() }),
  },
};

/**
 * Get a connector instance by name.
 * @param {string} source - Connector name (e.g. 'zendesk')
 * @param {Object} config - Connector configuration
 * @returns {BaseConnector} - Connector instance
 * @throws {Error} - If no connector registered for the source
 */
export function getConnector(source, config = {}) {
  const entry = CONNECTORS[source];
  if (!entry) {
    throw new Error(`No connector registered for source: ${source}`);
  }
  return entry.create(config);
}

/**
 * List all registered connectors.
 * @returns {Array} - Array of connector metadata
 */
export function listConnectors() {
  return Object.values(CONNECTORS).map(({ name, label }) => ({ name, label }));
}