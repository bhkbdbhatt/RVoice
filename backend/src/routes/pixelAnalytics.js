import express from 'express';
import { getFeedback } from '../services/feedbackService.js';

/**
 * GET /api/pixel/analytics
 * Aggregate real-time analytics for tracking-pixel traffic.
 * Pixel hits are canonical feedback items where metadata.pixel === true.
 * Protected by the shared /api auth middleware.
 */
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const items = await getFeedback({ source: 'pixel' });
    const pixelItems = Array.isArray(items) ? items : [];

    const uniqueVisitors = new Set(
      pixelItems.map((i) => (i.metadata && i.metadata.clientId) || '').filter(Boolean),
    );

    const byPage = {};
    const byReferrer = {};
    const byJourney = {};
    const byProduct = {};

    pixelItems.forEach((i) => {
      const m = i.metadata || {};
      const pageUrl = m.pageUrl || '';
      let pagePath = '/';
      try {
        pagePath = new URL(pageUrl).pathname || '/';
      } catch {
        pagePath = pageUrl || '/';
      }
      byPage[pagePath] = (byPage[pagePath] || 0) + 1;

      let refHost = 'direct';
      if (m.referrer) {
        try {
          refHost = new URL(m.referrer).host || m.referrer;
        } catch {
          refHost = m.referrer;
        }
      }
      byReferrer[refHost] = (byReferrer[refHost] || 0) + 1;

      const stage = i.journeyStage || 'unknown';
      byJourney[stage] = (byJourney[stage] || 0) + 1;

      const product = i.product || 'unknown';
      byProduct[product] = (byProduct[product] || 0) + 1;
    });

    const sortDesc = (obj) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]);

    const recent = pixelItems
      .slice()
      .sort((a, b) => new Date(b.receivedAt || b.timestamp) - new Date(a.receivedAt || b.timestamp))
      .slice(0, limit)
      .map((i) => ({
        text: i.text,
        clientId: (i.metadata && i.metadata.clientId) || 'anon',
        pageUrl: (i.metadata && i.metadata.pageUrl) || null,
        referrer: (i.metadata && i.metadata.referrer) || null,
        product: i.product || null,
        journeyStage: i.journeyStage || null,
        viewport: (i.metadata && i.metadata.viewport) || null,
        receivedAt: i.receivedAt || i.timestamp,
      }));

    res.json({
      totalVisits: pixelItems.length,
      uniqueVisitors: uniqueVisitors.size,
      topPages: sortDesc(byPage).map(([path, count]) => ({ path, count })),
      topReferrers: sortDesc(byReferrer).map(([ref, count]) => ({ ref, count })),
      journeyStages: sortDesc(byJourney).map(([stage, count]) => ({ stage, count })),
      products: sortDesc(byProduct).map(([product, count]) => ({ product, count })),
      recentVisits: recent,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;