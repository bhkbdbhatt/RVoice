// backend/src/services/aiSentimentService.js
// ML-based sentiment analysis using @xenova/transformers.
// Enhances the rule-based nlpService with a DistilBERT SST-2 model.
// Returns null when ML is disabled/unavailable so callers can fall back.

import { getSentimentPipeline, withTimeout } from './aiModelService.js';

/**
 * Analyze sentiment using the ML text-classification pipeline.
 * @param {string} text - masked text (no PII)
 * @returns {Promise<{sentiment: string, score: number, confidence: number, model: string}|null>}
 */
export async function analyzeSentimentMl(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;

  const pipeline = await getSentimentPipeline();
  if (!pipeline) return null;

  const result = await withTimeout(async () => {
    const output = await pipeline(text.trim());
    return output?.[0] || null;
  });

  if (!result) return null;

  // Map model label to our sentiment vocabulary
  const label = (result.label || '').toLowerCase();
  const sentiment = label.includes('pos') ? 'positive' : label.includes('neg') ? 'negative' : 'neutral';

  // Convert model score to our [-1, 1] scale
  const rawScore = result.score || 0.5;
  const score = sentiment === 'positive' ? rawScore : sentiment === 'negative' ? -rawScore : 0;

  return {
    sentiment,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(rawScore * 100) / 100,
    model: 'distilbert-sst2',
  };
}