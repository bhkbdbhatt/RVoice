import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import feedbackRoutes from './routes/feedback.js';
import themeRoutes from './routes/themes.js';
import actionRoutes from './routes/actions.js';
import detectionRoutes from './routes/detection.js';
import clusterRoutes from './routes/clusters.js';
import overviewRoutes from './routes/overview.js';
import ingestionRoutes from './routes/ingestion.js';
import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';
// import { servePixelGif, servePixelJs } from './routes/pixel.js';
import pixelAnalyticsRoutes from './routes/pixelAnalytics.js';
import { jwtAuth, localAuth } from './auth/authMiddleware.js';
import { initDatabase } from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

app.get('/api/health', async (req, res) => {
  const db = await initDatabase().catch(() => null);
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    storageMode: db?.mode || 'json',
  });
});

// Public tracking pixel — MUST be registered before the /api auth middleware
// because the pixel is embedded on third-party websites that cannot send
// JWT or local-auth headers.
// app.get('/api/pixel', servePixelGif);
// app.get('/api/pixel.gif', servePixelGif);
// app.get('/api/pixel.js', servePixelJs);

app.use('/api', jwtAuth, localAuth);

app.use('/api/auth', authRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/themes', themeRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/detection', detectionRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/pixel/analytics', pixelAnalyticsRoutes);
app.use('/api/ingestion', ingestionRoutes);
app.use('/api/chat', chatRoutes);
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Global auth error handler
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(err.status || 401).json({ error: err.message || 'Invalid token' });
  }
  next(err);
});

async function start() {
  await initDatabase();
  app.listen(port, () => {
    console.log(`VoC backend listening on http://localhost:${port}`);
  });
}

start();
