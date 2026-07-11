import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendLeadViaAiSensy, isAiSensyConfigured, resolveSendProfile } from '../services/aisensy.js';
import { ApiResponse, AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../config/database.js';

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

  const result = await sendLeadViaAiSensy(lead, await resolveSendProfile((req.body as any)?.profileId));
  res.json({
    success: result.success,
    message: result.success
      ? 'Sent via AiSensy — check the recipient WhatsApp and AiSensy inbox.'
      : `Failed: ${result.error}`,
    data: result,
  });
});

/**
 * POST /api/aisensy/send-leads - manual send to selected leads.
 * Body: { leadIds: string[] }. Skips opted-out / do-not-contact leads.
 */
const sendLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1, 'Select at least one lead'),
  profileId: z.string().optional(),
});

router.post('/send-leads', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  if (!isAiSensyConfigured()) {
    throw new AppError('AiSensy not configured (set AISENSY_API_KEY)', 400);
  }
  const { leadIds, profileId } = sendLeadsSchema.parse(req.body);
  const profile = await resolveSendProfile(profileId);

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      optedOut: false,
      status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
    },
  });

  const run = await prisma.outreachRun.create({
    data: {
      type: 'MANUAL',
      totalLeads: leadIds.length,
      skipped: leadIds.length - leads.length,
      note: 'Manual "Send WhatsApp" from Leads',
    },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const lead of leads) {
    const r = await sendLeadViaAiSensy(lead, profile);
    if (r.success) sent++;
    else {
      failed++;
      if (r.error && errors.length < 5) errors.push(`${lead.name}: ${r.error}`);
    }
    await new Promise((res) => setTimeout(res, 1200)); // gentle spacing
  }

  await prisma.outreachRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), sent, failed, errorsSample: errors },
  });

  res.json({
    success: true,
    message: `Sent ${sent} via WhatsApp. ${failed} failed. ${leads.length < leadIds.length ? `${leadIds.length - leads.length} skipped (opted out / do-not-contact).` : ''}`,
    data: { sent, failed, skipped: leadIds.length - leads.length, errors },
  });
});

export default router;
