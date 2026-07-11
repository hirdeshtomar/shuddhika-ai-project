import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';
import { getAutomationSettings } from '../services/automationSettings.js';
import { isAiSensyConfigured } from '../services/aisensy.js';
import { runDailyOutreach } from '../services/dailyOutreach.js';

const router = Router();

// GET /api/automation - current settings + last-run snapshot
router.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const settings = await getAutomationSettings();
  res.json({
    success: true,
    data: {
      ...settings,
      aisensyConfigured: isAiSensyConfigured(),
      campaignName: process.env.AISENSY_CAMPAIGN_NAME || null,
    },
  });
});

// PUT /api/automation - update settings
const updateSchema = z.object({
  enabled: z.boolean().optional(),
  runHourIST: z.number().int().min(0).max(23).optional(),
  dailyCap: z.number().int().min(1).max(250).optional(),
  minRelevanceScore: z.number().int().min(0).max(100).optional(),
  combosPerDay: z.number().int().min(1).max(8).optional(),
});

router.put('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = updateSchema.parse(req.body);
  await getAutomationSettings(); // ensure the row exists
  const updated = await prisma.automationSettings.update({
    where: { id: 'default' },
    data,
  });
  res.json({ success: true, data: updated, message: 'Automation settings saved' });
});

// GET /api/automation/runs - recent run history (manual + automated)
router.get('/runs', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const runs = await prisma.outreachRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 30,
  });
  res.json({ success: true, data: runs });
});

// POST /api/automation/run-now - trigger immediately (ignores schedule)
router.post('/run-now', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const result = await runDailyOutreach({ force: true });
  res.json({
    success: result.ran,
    message: result.ran
      ? `Ran now: scraped ${result.leadsScraped}, sent ${result.messagesSent}, failed ${result.messagesFailed}.`
      : `Did not run: ${result.skippedReason}`,
    data: result,
  });
});

export default router;
