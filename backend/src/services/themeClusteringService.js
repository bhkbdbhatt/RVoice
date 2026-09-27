export function clusterThemes(themes) {
  const clusters = {};

  for (const theme of themes) {
    const key = `${theme.product || 'general'}-${theme.journeyStage || 'general'}`;
    if (!clusters[key]) {
      clusters[key] = {
        clusterId: key,
        product: theme.product,
        journeyStage: theme.journeyStage,
        source: theme.source,
        items: [],
      };
    }
    clusters[key].items.push(theme);
  }

  return Object.values(clusters).map((cluster) => ({
    ...cluster,
    sentimentDistribution: cluster.items.reduce(
      (acc, item) => {
        acc[item.sentiment] = (acc[item.sentiment] || 0) + 1;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 },
    ),
    count: cluster.items.length,
  }));
}
