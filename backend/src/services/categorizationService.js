import { extractThemesMl } from './aiThemeService.js';

const stageKeywords = {
  browse: ['browse', 'search', 'discover', 'find'],
  checkout: ['checkout', 'cart', 'payment', 'payment method', 'card'],
  delivery: ['delivery', 'shipping', 'arrival', 'package', 'late'],
  support: ['support', 'help', 'ticket', 'agent', 'customer service'],
};

const productKeywords = ['product', 'sku', 'item', 'model'];
const storeKeywords = ['store', 'location', 'branch', 'shop', 'mall'];

export function categorizeFeedbackItem(item) {
  const text = (item.text || '').toLowerCase();
  const category = {
    product: item.product || null,
    store: item.store || null,
    journeyStage: item.journeyStage || null,
  };

  if (!category.journeyStage) {
    for (const [stage, words] of Object.entries(stageKeywords)) {
      if (words.some((word) => text.includes(word))) {
        category.journeyStage = stage;
        break;
      }
    }
  }

  if (!category.product && item.text) {
    if (productKeywords.some((word) => text.includes(word))) {
      category.product = item.product || 'product';
    }
  }

  if (!category.store && item.text) {
    if (storeKeywords.some((word) => text.includes(word))) {
      category.store = item.store || 'store';
    }
  }

  return category;
}

// Enhanced categorization that augments the keyword-based result with
// ML theme extraction when available. Returns a Promise.
export async function categorizeFeedbackItemEnhanced(item) {
  const base = categorizeFeedbackItem(item);
  const text = item.text || '';

  // Try ML theme extraction; if unavailable, return base result
  const mlResult = await extractThemesMl(text);
  if (!mlResult || !mlResult.themes || mlResult.themes.length === 0) {
    return { ...base, ml: false };
  }

  // Use the top ML theme as the journey stage if keyword matching found none
  const topTheme = mlResult.themes[0];
  const journeyStage = base.journeyStage || topTheme.label;

  return {
    ...base,
    journeyStage,
    ml: true,
    mlThemes: mlResult.themes,
    mlConfidence: mlResult.confidence,
    mlModel: mlResult.model,
  };
}
