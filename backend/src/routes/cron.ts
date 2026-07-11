import { Router, Request, Response } from 'express';
import { runDailyOutreach } from '../services/dailyOutreach.js';
import { ApiResponse } from '../types/index.js';

const router = Router();

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.authorization === `Bearer ${secret}`;
}

/**
 * GET /api/cron/daily-outreach
 * Called by Vercel Cron once a day. Scrapes rotating targets and sends the
 * day's approved template to the best new leads via AiSensy.
 */
router.get('/daily-outreach', async (req: Request, res: Response<ApiResponse>) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const result = await runDailyOutreach();
  res.json({ success: true, data: result });
});

export default router;
