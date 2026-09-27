// backend/src/services/aiThemeService.js
// ML-based theme extraction using zero-shot classification.
// Enhances the keyword-based categorizationService with a MobileBERT-MNLI model.
// Returns null when ML is disabled/unavailable so callers can fall back.

import { getZeroShotPipeline, withTimeout } from './aiModelService.js';

// Candidate theme labels aligned with the existing journey-stage taxonomy
const THEME_CANDIDATES = [
  'browse',
  'checkout',
  'delivery',
  'support',
  'product quality',
  'pricing',
  'returns',
  'mobile app',
  'website',
  'customer service',
];

/**
 * Extract themes using the ML zero-shot classification pipeline.
 * @param {string} text - masked text (no PII)
 * @returns {Promise<{themes: Array<{label: string, score: number}>, confidence: number, model: string}|null>}
 */
export async function extractThemesMl(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;

  const pipeline = await getZeroShotPipeline();
  if (!pipeline) return null;

  const result = await withTimeout(async () => {
    const output = await pipeline(text.trim(), THEME_CANDIDATES);
    return output || null;
  });

  if (!result || !Array.isArray(result.labels) || !Array.isArray(result.scores)) return null;

  // Pair labels with scores and sort descending
  const themes = result.labels
    .map((label, index) => ({ label, score: Math.round(result.scores[index] * 100) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    themes,
    confidence: themes.length > 0 ? themes[0].score : 0,
    model: 'mobilebert-mnli',
  };
}