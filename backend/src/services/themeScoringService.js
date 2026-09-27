export function scoreThemes(themes) {
  return themes.map((theme) => {
    const aspects = theme.aspects || [];
    const negativeAspects = aspects.filter((aspect) => aspect.sentiment === 'negative');
    const positiveAspects = aspects.filter((aspect) => aspect.sentiment === 'positive');

    // Intensity-weighted sentiment weights based on new score field
    const negativeWeight = negativeAspects.reduce((sum, aspect) => sum + Math.abs(aspect.score || 0.5), 0);
    const positiveWeight = positiveAspects.reduce((sum, aspect) => sum + Math.abs(aspect.score || 0.5), 0);

    // Average confidence across aspects
    const avgConfidence = aspects.length > 0
      ? aspects.reduce((sum, aspect) => sum + (aspect.confidence || 0), 0) / aspects.length
      : 0;
    const confidenceBonus = aspects.length > 0 ? avgConfidence * 0.5 : 0;

    // Issue score: base + negativeWeight - positiveWeight + confidenceBonus
    const score = Math.max(0, Math.round((aspects.length + negativeWeight - positiveWeight + confidenceBonus) * 10) / 10);

    // Average sentiment intensity score
    const avgScore = aspects.length > 0
      ? aspects.reduce((sum, aspect) => sum + (aspect.score || 0), 0) / aspects.length
      : 0;

    return {
      ...theme,
      sentimentScore: Math.round(avgScore * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
      issueScore: score,
      severity: score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low',
    };
  });
}