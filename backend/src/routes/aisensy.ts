import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendLeadViaAiSensy, isAiSensyConfigured } from '../services/aisensy.js';
import { ApiResponse } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/aisensy/status - is AiSensy configured?
router.get('/status', (_req: Request, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    data: {
      configured: isAiSensyConfigured(),
      campaignName: process.env.AISENSY_CAMPAIGN_NAME || null,
      dailyOutreachEnabled: process.env.DAILY_OUTREACH_ENABLED === 'true',
    },
  });
});

/**
 * POST /api/aisensy/test - send the outreach template to ONE number.
 * Protected by CRON_SECRET so it can't be triggered by anyone with the URL.
 * Body: { phone, name?, businessName? }
 */
const testSchema = z.object({
  phone: z.string().min(10),
  name: z.string().optional(),
  businessName: z.string().optional(),
});

router.post('/test', async (req: Request, res: Response<ApiResponse>) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    throw new AppError('Unauthorized — send header "Authorization: Bearer <CRON_SECRET>"', 401);
  }
  if (!isAiSensyConfigured()) {
    throw new AppError('AiSensy not configured (set AISENSY_API_KEY and AISENSY_CAMPAIGN_NAME)', 400);
  }

  const { phone, name, businessName } = testSchema.parse(req.body);

  // Use a throwaway lead id-shaped object; sendLeadViaAiSensy logs to MessageLog
  // via lead.id, so create a real lead row for the test target if needed.
  const { prisma } = await import('../config/database.js');
  const normalized = phone.replace(/\D/g, '');
  const lead = await prisma.lead.upsert({
    where: { phone: normalized.length === 10 ? `91${normalized}` : normalized },
    update: {},
    create: {
      phone: normalized.length === 10 ? `91${normalized}` : normalized,
      name: name || 'Test Contact',
      businessName: businessName || 'Test Business',
      source: 'MANUAL',
      status: 'NEW',
    },
  });

  const result = await sendLeadViaAiSensy(lead);
  res.json({
    success: result.success,
    message: result.success
      ? 'Sent via AiSensy — check the recipient WhatsApp and AiSensy inbox.'
      : `Failed: ${result.error}`,
    data: result,
  });
});

export default router;
