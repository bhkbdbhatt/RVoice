const defaultSchema = {
  id: null,
  source: 'unknown',
  origin: 'unknown',
  timestamp: new Date().toISOString(),
  text: '',
  rating: null,
  product: null,
  store: null,
  journeyStage: null,
  metadata: {},
};

export function normalizeFeedbackItem(item) {
  return {
    ...defaultSchema,
    ...item,
    timestamp: item.timestamp ? new Date(item.timestamp).toISOString() : defaultSchema.timestamp,
    source: item.source || item.origin || defaultSchema.source,
    origin: item.origin || item.source || defaultSchema.origin,
    text: (item.text || item.comment || item.body || '').trim(),
    rating: typeof item.rating === 'number' ? item.rating : null,
    product: item.product || item.sku || null,
    store: item.store || item.location || null,
    journeyStage: item.journeyStage || item.stage || null,
    metadata: item.metadata || {},
  };
}
