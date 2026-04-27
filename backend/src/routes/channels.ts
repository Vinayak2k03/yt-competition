import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

const router = Router();

// Helper to map Prisma camelCase to snake_case for the frontend
const toSnakeCase = (channel: any) => ({
  id: channel.id,
  display_name: channel.displayName,
  youtube_url: channel.youtubeUrl,
  youtube_channel_id: channel.youtubeChannelId,
  network_group: channel.networkGroup,
  brand_cluster: channel.brandCluster,
  is_active: channel.isActive,
  created_at: channel.createdAt,
});

// GET /api/yt-channels — list all channels
router.get('/', async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.ytChannel.findMany({
      orderBy: { displayName: 'asc' },
    });
    res.json(channels.map(toSnakeCase));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/yt-channels/active — active channels only
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.ytChannel.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });
    res.json(channels.map(toSnakeCase));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/yt-channels/count — count of active channels
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.ytChannel.count({ where: { isActive: true } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count channels' });
  }
});

// POST /api/yt-channels — create channel
router.post('/', async (req: Request, res: Response) => {
  try {
    const { display_name, youtube_url, youtube_channel_id, network_group, brand_cluster } =
      req.body as Record<string, string>;

    if (!display_name || !youtube_url) {
      res.status(400).json({ error: 'display_name and youtube_url are required' });
      return;
    }

    const channel = await prisma.ytChannel.create({
      data: {
        displayName: display_name,
        youtubeUrl: youtube_url,
        youtubeChannelId: youtube_channel_id ?? null,
        networkGroup: network_group ?? null,
        brandCluster: brand_cluster ?? null,
      },
    });
    res.status(201).json(toSnakeCase(channel));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PUT /api/yt-channels/:id — update channel
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { display_name, youtube_url, youtube_channel_id, network_group, brand_cluster, is_active } =
      req.body as Record<string, string | boolean>;

    const channel = await prisma.ytChannel.update({
      where: { id },
      data: {
        ...(display_name !== undefined && { displayName: display_name as string }),
        ...(youtube_url !== undefined && { youtubeUrl: youtube_url as string }),
        ...(youtube_channel_id !== undefined && { youtubeChannelId: youtube_channel_id as string | null }),
        ...(network_group !== undefined && { networkGroup: network_group as string }),
        ...(brand_cluster !== undefined && { brandCluster: brand_cluster as string }),
        ...(is_active !== undefined && { isActive: Boolean(is_active) }),
      },
    });
    res.json(toSnakeCase(channel));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// PATCH /api/yt-channels/:id/toggle — toggle is_active
router.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body as { is_active: boolean };
    const channel = await prisma.ytChannel.update({
      where: { id },
      data: { isActive: is_active },
    });
    res.json(toSnakeCase(channel));
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle channel' });
  }
});

// DELETE /api/yt-channels/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.ytChannel.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

export default router;
