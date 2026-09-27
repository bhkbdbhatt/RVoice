// backend/src/services/aiIssueService.js
// ML-based issue categorization using zero-shot classification.
// Enhances the rule-based detectionService with severity labels.
// Returns null when ML is disabled/unavailable so callers can fall back.

import { getZeroShotPipeline, withTimeout } from './aiModelService.js';

// Candidate issue categories aligned with the existing severity taxonomy
const ISSUE_CANDIDATES = [
  'checkout failure',
  'delivery delay',
  'product defect',
  'customer support',
  'pricing concern',
  'returns problem',
  'app bug',
  'website issue',
  'account problem',
  'general feedback',
];

/**
 * Categorize an issue using the ML zero-shot classification pipeline.
 * @param {string} text - masked text (no PII)
 * @returns {Promise<{category: string, confidence: number, model: string}|null>}
 */
export async function categorizeIssueMl(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;

  const pipeline = await getZeroShotPipeline();
  if (!pipeline) return null;

  const result = await withTimeout(async () => {
    const output = await pipeline(text.trim(), ISSUE_CANDIDATES);
    return output || null;
  });

  if (!result || !Array.isArray(result.labels) || !Array.isArray(result.scores)) return null;

  // Pick the highest-scoring category
  const bestIndex = result.scores.indexOf(Math.max(...result.scores));
  const category = result.labels[bestIndex] || 'general feedback';

  return {
    category,
    confidence: Math.round(result.scores[bestIndex] * 100) / 100,
    model: 'mobilebert-mnli',
  };
}