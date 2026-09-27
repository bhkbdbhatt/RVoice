// backend/src/services/aiModelService.js
// Lightweight ML facade using @xenova/transformers (open-source ONNX models).
// Provides lazy-loaded singleton pipelines for:
//   - Sentiment analysis (text-classification)
//   - Zero-shot classification (theme extraction, issue categorization)
//
// The ML layer is OPTIONAL. When ML_ENABLED !== 'true' or the package is not
// installed, all functions return null so the rule-based pipeline continues
// to work offline with zero dependencies.

import { config } from '../config/env.js';

let transformersModule = null;
let sentimentPipeline = null;
let zeroShotPipeline = null;
let loadPromise = null;

/**
 * Dynamically import @xenova/transformers. Returns null if unavailable.
 */
async function loadTransformers() {
  if (transformersModule) return transformersModule;
  if (!config.ml.enabled) return null;

  try {
    const mod = await import('@xenova/transformers');
    // Configure local model cache
    mod.env.cacheDir = config.ml.cacheDir;
    transformersModule = mod;
    return mod;
  } catch (error) {
    console.warn('[aiModelService] @xenova/transformers not available:', error.message);
    return null;
  }
}

/**
 * Get (or lazily create) the sentiment analysis pipeline.
 * @returns {Promise<object|null>} pipeline or null if ML disabled/unavailable
 */
export async function getSentimentPipeline() {
  if (sentimentPipeline) return sentimentPipeline;
  const mod = await loadTransformers();
  if (!mod) return null;

  if (!loadPromise) {
    loadPromise = (async () => {
      sentimentPipeline = await mod.pipeline('text-classification', config.ml.models.sentiment);
    })();
  }
  await loadPromise;
  return sentimentPipeline;
}

/**
 * Get (or lazily create) the zero-shot classification pipeline.
 * @returns {Promise<object|null>} pipeline or null if ML disabled/unavailable
 */
export async function getZeroShotPipeline() {
  if (zeroShotPipeline) return zeroShotPipeline;
  const mod = await loadTransformers();
  if (!mod) return null;

  if (!loadPromise) {
    loadPromise = (async () => {
      zeroShotPipeline = await mod.pipeline('zero-shot-classification', config.ml.models.zeroShot);
    })();
  }
  await loadPromise;
  return zeroShotPipeline;
}

/**
 * Check whether the ML layer is available (enabled + package installed).
 * @returns {Promise<boolean>}
 */
export async function isMlAvailable() {
  const mod = await loadTransformers();
  return mod !== null;
}

/**
 * Run a function with a timeout guard. Returns null on timeout/error.
 * @param {Function} fn async function to run
 * @param {number} timeoutMs
 * @returns {Promise<any|null>}
 */
export async function withTimeout(fn, timeoutMs = config.ml.timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('ML inference timed out')), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } catch (error) {
    console.warn('[aiModelService] ML inference failed:', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}