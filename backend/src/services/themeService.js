import { extractAspectsAndSentiment } from './nlpService.js';
import { categorizeFeedbackItem } from './categorizationService.js';
import { loadThemeStore, saveThemeStore } from './storageService.js';
import { scoreThemes } from './themeScoringService.js';

let themeStore = [];

async function initializeStore() {
  if (!themeStore.length) {
    themeStore = await loadThemeStore();
  }
}

export async function estimateThemes(items) {
  await initializeStore();
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  const themes = items.map((item, index) => {
    const categories = categorizeFeedbackItem(item);
    const analysis = extractAspectsAndSentiment(item.text);
    const themeId = item.id ? `theme-${item.id}` : `theme-${Date.now()}-${index}`;
    return {
      themeId,
      sourceId: item.id || themeId,
      text: item.text,
      product: categories.product,
      store: categories.store,
      journeyStage: categories.journeyStage,
      source: item.source,
      sentiment: analysis.sentiment,
      score: analysis.score,
      confidence: analysis.confidence,
      aspects: analysis.aspects,
      createdAt: new Date().toISOString(),
    };
  });

  const scoredThemes = scoreThemes(themes);
  themeStore.push(...scoredThemes);
  await saveThemeStore(themeStore);
  return scoredThemes;
}

export async function getThemes(query = {}) {
  await initializeStore();
  if (Object.keys(query).length === 0) {
    return [...themeStore];
  }

  return themeStore.filter((theme) => {
    if (query.product && theme.product !== query.product) {
      return false;
    }
    if (query.store && theme.store !== query.store) {
      return false;
    }
    if (query.source && theme.source !== query.source) {
      return false;
    }
    if (query.journeyStage && theme.journeyStage !== query.journeyStage) {
      return false;
    }
    if (query.severity && theme.severity !== query.severity) {
      return false;
    }
    return true;
  });
}
