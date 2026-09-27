// backend/src/services/chatService.js
// Core orchestration of the chatbot: intent classification, response generation,
// and persistence of chat history.
// ---------------------------------------------------------------
// Exported function:
//   handleChat(message, sessionId) => Promise<{reply, intent, confidence, data}>

import { classifyIntent } from './chatNlpService.js';
import { saveChatMessage } from './chatHistoryService.js';
import { getFeedback } from './feedbackService.js';
import { getThemes } from './themeService.js';
import { getActions } from './actionService.js';
import { clusterThemes } from './themeClusteringService.js';
import { detectSpikes } from './detectionService.js';
import { config } from '../config/env.js';
import { generateLlmResponse } from './llmFallbackService.js';

function normalizeEntityValue(value) {
  return typeof value === 'string' ? value.toLowerCase().trim() : undefined;
}

function formatItems(items, limit = 3) {
  return items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${item.text || item.reason || item.recommendedAction || item.issue || item.product || item.title}`)
    .join(' ');
}

function summarizeSentiment(themes) {
  const counts = themes.reduce(
    (acc, theme) => {
      const sentiment = theme.sentiment || 'neutral';
      acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );

  return `There are ${counts.positive} positive, ${counts.neutral} neutral, and ${counts.negative} negative themes.`;
}

function filterByEntity(query, entities) {
  if (!entities) return query;
  const filtered = { ...query };
  if (entities.product) filtered.product = entities.product;
  if (entities.store) filtered.store = entities.store;
  if (entities.journeyStage) filtered.journeyStage = entities.journeyStage;
  return filtered;
}

async function buildResponse(intent, entities) {
  const normalizedEntities = {
    product: normalizeEntityValue(entities?.product),
    store: normalizeEntityValue(entities?.store),
    status: normalizeEntityValue(entities?.status),
    owner: normalizeEntityValue(entities?.owner),
    journeyStage: normalizeEntityValue(entities?.journeyStage),
  };

  const [feedback, themes, actions] = await Promise.all([
    getFeedback({}),
    getThemes({}),
    getActions({}),
  ]);
  const clusters = clusterThemes(themes);
  const spikes = detectSpikes(themes);

  switch (intent) {
    case 'help':
      return {
        reply: 'Ask me about feedback counts, themes, actions, clusters, emerging issues, or sentiment trends on the dashboard.',
        data: null,
      };

    case 'overview':
      return {
        reply: `Dashboard summary: ${feedback.length} feedback items, ${themes.length} themes, ${actions.length} actions, ${clusters.length} clusters, and ${spikes.length} detected spikes. ${summarizeSentiment(themes)}`,
        data: { feedbackCount: feedback.length, themeCount: themes.length, actionCount: actions.length, clusterCount: clusters.length, spikeCount: spikes.length },
      };

    case 'count.feedback':
      return {
        reply: `There are ${feedback.length} feedback items in the system.`,
        data: { feedbackCount: feedback.length },
      };

    case 'count.themes':
      return {
        reply: `There are ${themes.length} themes in the system.`,
        data: { themeCount: themes.length },
      };

    case 'count.actions':
      return {
        reply: `There are ${actions.length} actions in the system.`,
        data: { actionCount: actions.length },
      };

    case 'count.clusters':
      return {
        reply: `There are ${clusters.length} clusters in the dashboard.`,
        data: { clusterCount: clusters.length },
      };

    case 'count.spikes':
      return {
        reply: `There are ${spikes.length} emerging issue spikes detected.`,
        data: { spikeCount: spikes.length },
      };

    case 'feedback.list': {
      const query = filterByEntity({}, normalizedEntities);
      const filtered = await getFeedback(query);
      const message = filtered.length
        ? `Found ${filtered.length} feedback items. ${formatItems(filtered, 3)}`
        : 'No feedback items matched that filter.';
      return { reply: message, data: { items: filtered.slice(0, 10) } };
    }

    case 'feedback.sentiment':
      return {
        reply: themes.length > 0 ? `Feedback sentiment summary: ${summarizeSentiment(themes)}` : 'No themes are available yet to summarize sentiment.',
        data: { sentimentSummary: summarizeSentiment(themes) },
      };

    case 'themes.list': {
      const query = filterByEntity({}, normalizedEntities);
      const filteredThemes = await getThemes(query);
      const message = filteredThemes.length
        ? `Found ${filteredThemes.length} themes. ${formatItems(filteredThemes, 3)}`
        : 'No themes matched that filter.';
      return { reply: message, data: { themes: filteredThemes.slice(0, 10) } };
    }

    case 'actions.list': {
      const query = filterByEntity({}, normalizedEntities);
      const filteredActions = await getActions(query);
      const message = filteredActions.length
        ? `Found ${filteredActions.length} actions. ${formatItems(filteredActions, 3)}`
        : 'No actions matched that filter.';
      return { reply: message, data: { actions: filteredActions.slice(0, 10) } };
    }

    case 'clusters.list': {
      const message = clusters.length
        ? `There are ${clusters.length} clusters. Example: ${clusters[0].product || 'general'} / ${clusters[0].journeyStage || 'general'} with ${clusters[0].count} themes.`
        : 'No clusters are available yet.';
      return { reply: message, data: { clusters } };
    }

    case 'spikes.list': {
      const message = spikes.length
        ? `Detected ${spikes.length} spikes. ${formatItems(spikes, 3)}`
        : 'No emerging issue spikes detected right now.';
      return { reply: message, data: { spikes } };
    }

    case 'feedback.by_product': {
      if (!normalizedEntities.product) {
        return { reply: 'I can search feedback by product, for example "checkout" or "delivery".', data: null };
      }
      const filtered = await getFeedback({ product: normalizedEntities.product });
      const message = filtered.length
        ? `Found ${filtered.length} feedback items for product ${normalizedEntities.product}. ${formatItems(filtered, 3)}`
        : `No feedback items found for product ${normalizedEntities.product}.`;
      return { reply: message, data: { items: filtered.slice(0, 10) } };
    }

    case 'feedback.by_store': {
      if (!normalizedEntities.store) {
        return { reply: 'I can search feedback by store, for example "store-42" or "store-15".', data: null };
      }
      const filtered = await getFeedback({ store: normalizedEntities.store });
      const message = filtered.length
        ? `Found ${filtered.length} feedback items for store ${normalizedEntities.store}. ${formatItems(filtered, 3)}`
        : `No feedback items found for store ${normalizedEntities.store}.`;
      return { reply: message, data: { items: filtered.slice(0, 10) } };
    }

    case 'actions.by_owner': {
      if (!normalizedEntities.owner) {
        return { reply: 'I can search actions by owner, such as "support-manager" or "logistics-lead".', data: null };
      }
      const filtered = await getActions({ owner: normalizedEntities.owner });
      const message = filtered.length
        ? `Found ${filtered.length} actions for owner ${normalizedEntities.owner}. ${formatItems(filtered, 3)}`
        : `No actions found for owner ${normalizedEntities.owner}.`;
      return { reply: message, data: { actions: filtered.slice(0, 10) } };
    }

    case 'actions.by_status': {
      if (!normalizedEntities.status) {
        return { reply: 'I can search actions by status, such as "pending" or "resolved".', data: null };
      }
      const filtered = await getActions({ status: normalizedEntities.status });
      const message = filtered.length
        ? `Found ${filtered.length} actions with status ${normalizedEntities.status}. ${formatItems(filtered, 3)}`
        : `No actions found with status ${normalizedEntities.status}.`;
      return { reply: message, data: { actions: filtered.slice(0, 10) } };
    }

    default:
      return { reply: 'I am still learning. Could you rephrase your question or ask about the dashboard data?', data: null };
  }
}

export async function handleChat(message, sessionId) {
  const classification = classifyIntent(message);
  const { intent, confidence, entities, fallback } = classification;

  let reply;
  let data = null;

  if (fallback && config.openai.apiKey) {
    try {
      reply = await generateLlmResponse(message, { intent, entities });
    } catch (error) {
      reply = 'I could not complete that request with the AI fallback at this time. Please try again or ask a simpler question.';
    }
  } else if (fallback) {
    reply = 'I am still learning. Please ask a dashboard question like "how many themes" or "show me feedback".';
  } else {
    const response = await buildResponse(intent, entities);
    reply = response.reply;
    data = response.data;
  }

  await saveChatMessage(sessionId, 'user', message, intent, confidence, { entities });
  await saveChatMessage(sessionId, 'bot', reply, intent, confidence, data);

  return {
    reply,
    intent,
    confidence,
    data,
  };
}
