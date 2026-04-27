import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

const router = Router();

// Helper to map Prisma camelCase to snake_case for the frontend
const toSnakeCase = (key: any) => ({
  id: key.id,
  name: key.name,
  api_key: key.apiKey ? key.apiKey.substring(0, 4) + '•'.repeat(Math.max(0, key.apiKey.length - 8)) + key.apiKey.substring(key.apiKey.length - 4) : '',
  is_active: key.isActive,
  daily_quota: key.dailyQuota,
  quota_exceeded_at: key.quotaExceededAt,
  last_used_at: key.lastUsedAt,
  last_error: key.lastError,
  last_error_at: key.lastErrorAt,
  error_type: key.errorType,
  consecutive_errors: key.consecutiveErrors,
  created_at: key.createdAt,
});

// GET /api/yt-api-keys — list all API keys
router.get('/', async (_req: Request, res: Response) => {
  try {
    const keys = await prisma.ytApiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys.map(toSnakeCase));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// GET /api/yt-api-keys/count — count of active keys
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.ytApiKey.count({ where: { isActive: true } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count API keys' });
  }
});

// POST /api/yt-api-keys — create key
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, api_key } = req.body as { name?: string; api_key?: string };
    if (!name || !api_key) {
      res.status(400).json({ error: 'name and api_key are required' });
      return;
    }
    const key = await prisma.ytApiKey.create({
      data: { name, apiKey: api_key },
    });
    res.status(201).json(toSnakeCase(key));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// PUT /api/yt-api-keys/:id — update quota
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { daily_quota } = req.body as { daily_quota?: number };
    const key = await prisma.ytApiKey.update({
      where: { id },
      data: { ...(daily_quota !== undefined && { dailyQuota: daily_quota }) },
    });
    res.json(toSnakeCase(key));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// POST /api/yt-api-keys/:id/reset-error — clear error state
router.post('/:id/reset-error', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const key = await prisma.ytApiKey.update({
      where: { id },
      data: {
        quotaExceededAt: null,
        lastError: null,
        lastErrorAt: null,
        errorType: null,
        consecutiveErrors: 0,
      },
    });
    res.json(toSnakeCase(key));
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset error status' });
  }
});

// DELETE /api/yt-api-keys/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.ytApiKey.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
