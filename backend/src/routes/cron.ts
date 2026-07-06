import { Router, Request, Response } from 'express';
import { runCampaignTick } from '../services/campaignTick.js';
import { ApiResponse } from '../types/index.js';

const router = Router();

/**
 * GET /api/cron/campaign-tick
 * Called by Vercel Cron every minute. When CRON_SECRET is set (recommended),
 * Vercel automatically sends it as "Authorization: Bearer <CRON_SECRET>".
 */
router.get('/campaign-tick', async (req: Request, res: Response<ApiResponse>) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const result = await runCampaignTick();
  res.json({ success: true, data: result });
});

export default router;
