import nlp from 'compromise';
import { SENTIMENT_LEXICON, NEGATION_TERMS, INTENSIFIERS, ASPECT_KEYWORDS } from './sentimentLexicon.js';
import { analyzeSentimentMl } from './aiSentimentService.js';

// Main entry point for enhanced sentiment analysis using compromise
export function analyzeSentiment(text) {
  const doc = nlp(text || '');
  const normalized = (text || '').toLowerCase();

  // Detect negation and intensifiers
  const negated = detectNegation(doc);
  const intensifiers = detectIntensifiers(doc);

  // Find matched sentiment terms
  const matchedTerms = findMatchedTerms(doc);

  // Compute raw score from lexicon
  let rawScore = matchedTerms.reduce((sum, term) => sum + SENTIMENT_LEXICON[term], 0);

  // Apply negation
  rawScore = applyNegation(rawScore, negated);

  // Apply intensifiers
  rawScore = applyIntensifiers(rawScore, intensifiers);

  // Clamp to [-1, 1]
  const score = clampScore(rawScore);

  // Compute confidence
  const confidence = computeConfidence(matchedTerms, normalized.length);

  // Determine sentiment label
  const sentiment = getSentimentLabel(score);

  // Extract aspects
  const aspects = extractAspects(text, doc);

  return { sentiment, score, confidence, aspects };
}

// Extract aspects from text using the expanded ASPECT_KEYWORDS mapping
export function extractAspects(text, doc) {
  const normalized = (text || '').toLowerCase();
  const aspects = [];

  for (const [aspect, keywords] of Object.entries(ASPECT_KEYWORDS)) {
    const matchedKeyword = keywords.find((keyword) => normalized.includes(keyword));
    if (matchedKeyword) {
      aspects.push(analyzeAspect(text, doc, aspect));
    }
  }

  if (aspects.length === 0) {
    aspects.push(analyzeAspect(text, doc, 'general'));
  }

  return aspects;
}

// Calculate confidence score in [0, 1] based on matched terms and text length
export function computeConfidence(matchedTerms, textLength) {
  if (textLength === 0) return 0;
  const termFactor = Math.min(1, matchedTerms.length / 3);
  const lengthFactor = Math.min(1, textLength / 50);
  return Math.round(Math.min(1, termFactor * 0.7 + lengthFactor * 0.3) * 100) / 100;
}

// Flip sentiment score when negation is detected (e.g., "not good" → negative)
export function applyNegation(score, negated) {
  return negated ? -score : score;
}

// Amplify or dampen sentiment score based on detected intensifier terms
export function applyIntensifiers(score, intensifiers) {
  let multiplier = 1;
  intensifiers.forEach((intensifier) => {
    multiplier *= INTENSIFIERS[intensifier] || 1;
  });
  return score * multiplier;
}

// Detect negation terms in the text using compromise tokenization
export function detectNegation(doc) {
  const text = doc.text().toLowerCase();
  return NEGATION_TERMS.some(
    (term) => text.includes(term) && SENTIMENT_LEXICON[term] === undefined
  );
}

// Detect intensifier terms in the text
export function detectIntensifiers(doc) {
  const text = doc.text().toLowerCase();
  return Object.keys(INTENSIFIERS).filter((intensifier) => text.includes(intensifier));
}

// Backward-compatible wrapper that returns { sentiment, aspects } plus new fields
export function extractAspectsAndSentiment(text) {
  const analysis = analyzeSentiment(text);
  return {
    sentiment: analysis.sentiment,
    score: analysis.score,
    confidence: analysis.confidence,
    aspects: analysis.aspects,
  };
}

// Enhanced sentiment analysis that uses the ML layer when available,
// falling back to the rule-based pipeline otherwise.
// Returns a Promise<{ sentiment, score, confidence, aspects, ml }>
export async function analyzeSentimentEnhanced(text) {
  const ruleBased = analyzeSentiment(text);

  // Try ML first; if unavailable, return rule-based result
  const mlResult = await analyzeSentimentMl(text);
  if (!mlResult) {
    return { ...ruleBased, ml: false };
  }

  // Blend: prefer ML when its confidence is high, otherwise keep rule-based
  const useMl = mlResult.confidence >= 0.6;
  return {
    sentiment: useMl ? mlResult.sentiment : ruleBased.sentiment,
    score: useMl ? mlResult.score : ruleBased.score,
    confidence: useMl ? mlResult.confidence : ruleBased.confidence,
    aspects: ruleBased.aspects,
    ml: useMl,
    mlModel: useMl ? mlResult.model : null,
  };
}

// Helper: find sentiment terms in the text
function findMatchedTerms(doc) {
  const terms = doc.terms().out('array');
  return terms
    .map((t) => (typeof t === 'string' ? t : t.text || '').toLowerCase())
    .map((term) => term.replace(/[^a-z\s]/g, '')) // strip punctuation
    .filter((term) => term.length > 0 && SENTIMENT_LEXICON[term] !== undefined);
}

// Helper: analyze sentiment for a single aspect
function analyzeAspect(text, doc, aspect) {
  const normalized = (text || '').toLowerCase();
  const matchedTerms = findMatchedTerms(doc);
  const negated = detectNegation(doc);
  const intensifiers = detectIntensifiers(doc);

  let rawScore = matchedTerms.reduce((sum, term) => sum + SENTIMENT_LEXICON[term], 0);
  rawScore = applyNegation(rawScore, negated);
  rawScore = applyIntensifiers(rawScore, intensifiers);

  const score = clampScore(rawScore);
  const confidence = computeConfidence(matchedTerms, normalized.length);
  const sentiment = getSentimentLabel(score);

  return {
    aspect,
    sentiment,
    score,
    confidence,
    matchedTerms,
    negated,
  };
}

// Helper: clamp score to [-1, 1]
function clampScore(score) {
  return Math.max(-1, Math.min(1, score));
}

// Helper: determine sentiment label from score
function getSentimentLabel(score) {
  if (score > 0.1) return 'positive';
  if (score < -0.1) return 'negative';
  return 'neutral';
}