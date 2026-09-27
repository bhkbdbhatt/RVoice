import { loadActionStore, saveActionStore } from './storageService.js';
import { v4 as uuidv4 } from 'uuid';

const ownerMatrix = {
  checkout: 'ecommerce-product-owner',
  delivery: 'logistics-lead',
  'product quality': 'product-quality-manager',
  'customer support': 'support-manager',
  'store experience': 'store-ops-manager',
  general: 'customer-experience-lead',
};

const actionsByAspect = {
  checkout: 'Review checkout funnel and payment errors for the affected channel.',
  delivery: 'Investigate delivery exceptions and update logistics partner SLA.',
  'product quality': 'Initiate quality review for the referenced SKU and update packaging.',
  'customer support': 'Audit recent contact center interactions and retrain frontline agents.',
  'store experience': 'Review store staff performance and fix any location service gaps.',
  general: 'Consolidate feedback into the VoC dashboard and assign to the relevant team.',
};

const validStatuses = ['pending', 'assigned', 'in_progress', 'resolved', 'closed'];

let actionStore = [];

async function initializeStore() {
  if (!actionStore.length) {
    actionStore = await loadActionStore();
  }
}

export function recommendActionsForTheme(theme) {
  const recommendations = theme.aspects
    .map((aspect) => ({
      aspect: aspect.aspect,
      sentiment: aspect.sentiment,
      sentimentScore: aspect.score || 0,
      confidence: aspect.confidence || 0,
      recommendedAction: actionsByAspect[aspect.aspect] || actionsByAspect.general,
      owner: ownerMatrix[aspect.aspect] || ownerMatrix.general,
    }))
    .sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));

  return {
    actionId: uuidv4(),
    themeId: theme.themeId,
    sourceId: theme.sourceId,
    product: theme.product,
    store: theme.store,
    journeyStage: theme.journeyStage,
    sentiment: theme.sentiment,
    sentimentScore: theme.sentimentScore || 0,
    confidence: theme.confidence || 0,
    issueScore: theme.issueScore || 0,
    severity: theme.severity || 'low',
    status: 'pending',
    assignedOwner: recommendations.length > 0 ? recommendations[0].owner : ownerMatrix.general,
    recommendations,
    recommendedAt: new Date().toISOString(),
    notes: [],
  };
}

export async function persistActions(actions) {
  await initializeStore();
  const saved = actions.map((action) => ({ ...action, createdAt: new Date().toISOString() }));
  actionStore.push(...saved);
  await saveActionStore(actionStore);
  return saved;
}

export async function getActions(query = {}) {
  await initializeStore();
  if (Object.keys(query).length === 0) {
    return [...actionStore];
  }

  return actionStore.filter((action) => {
    if (query.owner && action.assignedOwner !== query.owner) {
      return false;
    }
    if (query.themeId && action.themeId !== query.themeId) {
      return false;
    }
    if (query.status && action.status !== query.status) {
      return false;
    }
    return true;
  });
}

export async function updateAction(actionId, updates = {}) {
  await initializeStore();
  const index = actionStore.findIndex((action) => action.actionId === actionId);
  if (index === -1) {
    throw new Error('Action not found');
  }

  const action = actionStore[index];
  const updated = {
    ...action,
    ...updates,
    status: validStatuses.includes(updates.status) ? updates.status : action.status,
    assignedOwner: updates.assignedOwner || action.assignedOwner,
    notes: Array.isArray(updates.notes) ? [...action.notes, ...updates.notes] : action.notes,
    updatedAt: new Date().toISOString(),
  };

  actionStore[index] = updated;
  await saveActionStore(actionStore);
  return updated;
}
