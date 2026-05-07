/**
 * Express entry point — Sociowatch Backend API
 *
 * Routes:
 *   /auth/*           Auth (login, signup, me)
 *   /api/*            Live stream data + scan progress
 *   /vod-api/*        VOD data endpoints
 *   /api/yt-channels  Channel CRUD
 *   /api/yt-api-keys  API key CRUD
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import channelsRouter from './routes/channels.js';
import apiKeysRouter from './routes/apiKeys.js';
import liveApiRouter from './routes/liveApi.js';
import vodApiRouter from './routes/vodApi.js';
import clusterApiRouter from './routes/clusterApi.js';
import { startCleanupJob } from './services/cleanupService.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:8083';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}));
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/yt-channels', channelsRouter);
app.use('/api/yt-api-keys', apiKeysRouter);
app.use('/api', liveApiRouter);     // /api/latest-scan, /api/overview, etc.
app.use('/vod-api', vodApiRouter);  // /vod-api/latest-scan, etc.
app.use('/cluster-api', clusterApiRouter);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`   CORS allowed for: ${FRONTEND_ORIGIN}`);

  // Start background jobs
  startCleanupJob();
});

export default app;
