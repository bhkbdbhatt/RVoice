import { categorizeIssueMl } from './aiIssueService.js';

export function scoreTheme(theme) {
  const aspects = theme.aspects || [];
  const base = aspects.length;

  // Intensity-weighted sentiment weights using new score field
  const negativeWeight = aspects
    .filter((aspect) => aspect.sentiment === 'negative')
    .reduce((sum, aspect) => sum + Math.abs(aspect.score || 0.5), 0);
  const positiveWeight = aspects
    .filter((aspect) => aspect.sentiment === 'positive')
    .reduce((sum, aspect) => sum + Math.abs(aspect.score || 0.5), 0);

  // Confidence-weighted bonus
  const avgConfidence = aspects.length > 0
    ? aspects.reduce((sum, aspect) => sum + (aspect.confidence || 0), 0) / aspects.length
    : 0;
  const confidenceWeight = avgConfidence * 0.5;

  const sentimentWeight = negativeWeight - positiveWeight;
  const issueScore = Math.max(0, Math.round((base + sentimentWeight + confidenceWeight) * 10) / 10);

  return {
    ...theme,
    issueScore,
  };
}

export function detectSpikes(themes) {
  if (!Array.isArray(themes)) {
    return [];
  }

  return themes
    .map(scoreTheme)
    .filter((theme) => theme.issueScore >= 2)
    .map((theme) => {
      const aspects = theme.aspects || [];
      const avgScore = aspects.length > 0
        ? aspects.reduce((sum, aspect) => sum + (aspect.score || 0), 0) / aspects.length
        : 0;
      const avgConfidence = aspects.length > 0
        ? aspects.reduce((sum, aspect) => sum + (aspect.confidence || 0), 0) / aspects.length
        : 0;

      return {
        themeId: theme.themeId,
        sourceId: theme.sourceId,
        text: theme.text,
        reason: 'issue score threshold exceeded',
        score: theme.issueScore,
        sentiment: avgScore > 0.1 ? 'positive' : avgScore < -0.1 ? 'negative' : 'neutral',
        sentimentScore: Math.round(avgScore * 100) / 100,
        confidence: Math.round(avgConfidence * 100) / 100,
        detectedAt: new Date().toISOString(),
      };
    });
}

// Enhanced spike detection that augments each spike with an ML issue
// category when available. Returns a Promise.
export async function detectSpikesEnhanced(themes) {
  const spikes = detectSpikes(themes);

  // Enrich each spike with ML categorization (best-effort, non-blocking)
  const enriched = await Promise.all(
    spikes.map(async (spike) => {
      const mlResult = await categorizeIssueMl(spike.text || '');
      if (!mlResult) {
        return { ...spike, ml: false };
      }
      return {
        ...spike,
        ml: true,
        mlCategory: mlResult.category,
        mlConfidence: mlResult.confidence,
        mlModel: mlResult.model,
      };
    })
  );

  return enriched;
}
