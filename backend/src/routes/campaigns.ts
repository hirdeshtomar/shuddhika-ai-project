import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse, CreateCampaignInput } from '../types/index.js';
import { sendCampaignMessage } from '../services/whatsapp/client.js';

const router = Router();

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  type: z.enum(['WHATSAPP', 'SMS', 'CALL']).default('WHATSAPP'),
  templateId: z.string().min(1, 'Template ID is required'),
  leadIds: z.array(z.string()).optional(),
  headerMediaUrl: z.string().url().optional(),
  skipDuplicateTemplate: z.boolean().default(true),
  targetFilters: z.object({
    status: z.array(z.string()).optional(),
    source: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
  }).optional(),
  scheduledAt: z.string().datetime().optional(),
});

// GET /api/campaigns - List all campaigns
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const skip = (page - 1) * limit;

  const status = req.query.status as string | undefined;

  const where: any = {};
  if (status) {
    where.status = status;
  }

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { name: true, language: true },
        },
        createdBy: {
          select: { name: true, email: true },
        },
        _count: {
          select: { leads: true },
        },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  res.json({
    success: true,
    data: campaigns,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/campaigns/:id - Get single campaign with stats
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      template: true,
      createdBy: {
        select: { name: true, email: true },
      },
      leads: {
        take: 100,
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              businessName: true,
              city: true,
            },
          },
        },
      },
    },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  res.json({ success: true, data: campaign });
});

// GET /api/campaigns/:id/stats - Get detailed campaign statistics
router.get('/:id/stats', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      totalLeads: true,
      sentCount: true,
      deliveredCount: true,
      readCount: true,
      failedCount: true,
    },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  // Calculate rates
  const stats = {
    ...campaign,
    deliveryRate: campaign.sentCount > 0
      ? ((campaign.deliveredCount / campaign.sentCount) * 100).toFixed(2)
      : 0,
    readRate: campaign.deliveredCount > 0
      ? ((campaign.readCount / campaign.deliveredCount) * 100).toFixed(2)
      : 0,
    failureRate: campaign.totalLeads > 0
      ? ((campaign.failedCount / campaign.totalLeads) * 100).toFixed(2)
      : 0,
  };

  res.json({ success: true, data: stats });
});

// POST /api/campaigns - Create new campaign
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = createCampaignSchema.parse(req.body) as CreateCampaignInput;

  // Verify template exists and is approved
  const template = await prisma.messageTemplate.findUnique({
    where: { id: data.templateId },
  });

  if (!template) {
    throw new AppError('Template not found', 404);
  }

  if (template.status !== 'APPROVED') {
    throw new AppError('Template must be approved before using in a campaign', 400);
  }

  // Count leads: either specific leadIds or filter-based
  let totalLeads: number;

  if (data.leadIds?.length) {
    // Specific leads selected — count only valid ones
    totalLeads = await prisma.lead.count({
      where: {
        id: { in: data.leadIds },
        optedOut: false,
        status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
      },
    });
  } else {
    // Filter-based targeting
    const leadWhere: any = {
      optedOut: false,
      status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
    };

    if (data.targetFilters?.status?.length) {
      leadWhere.status = { in: data.targetFilters.status };
    }
    if (data.targetFilters?.source?.length) {
      leadWhere.source = { in: data.targetFilters.source };
    }
    if (data.targetFilters?.tags?.length) {
      leadWhere.tags = { hasSome: data.targetFilters.tags };
    }
    if (data.targetFilters?.cities?.length) {
      leadWhere.city = { in: data.targetFilters.cities };
    }

    totalLeads = await prisma.lead.count({ where: leadWhere });
  }

  // Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type || 'WHATSAPP',
      templateId: data.templateId,
      targetFilters: {
        ...(data.leadIds?.length ? { leadIds: data.leadIds } : data.targetFilters),
        ...(data.headerMediaUrl ? { headerMediaUrl: data.headerMediaUrl } : {}),
        skipDuplicateTemplate: data.skipDuplicateTemplate !== false,
      },
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      totalLeads,
      createdById: req.user!.id,
    },
    include: {
      template: { select: { name: true } },
    },
  });

  res.status(201).json({
    success: true,
    data: campaign,
    message: `Campaign created with ${totalLeads} potential leads`,
  });
});

// POST /api/campaigns/:id/start - Start a campaign
router.post('/:id/start', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status === 'RUNNING') {
    throw new AppError('Campaign is already running', 400);
  }

  if (campaign.status === 'COMPLETED') {
    throw new AppError('Campaign has already completed', 400);
  }

  // Get matching leads — either specific IDs or filter-based
  const targetFilters = campaign.targetFilters as any || {};
  let leads: { id: string }[];

  // Find leads who already received this template successfully (for dedup)
  let alreadyReceivedIds: Set<string> = new Set();
  if (targetFilters.skipDuplicateTemplate !== false) {
    const alreadyReceived = await prisma.messageLog.findMany({
      where: {
        templateId: campaign.templateId,
        direction: 'OUTBOUND',
        status: { notIn: ['FAILED'] },
      },
      select: { leadId: true },
      distinct: ['leadId'],
    });
    alreadyReceivedIds = new Set(alreadyReceived.map(m => m.leadId));
  }

  if (targetFilters.leadIds?.length) {
    // Specific leads were selected at creation
    leads = await prisma.lead.findMany({
      where: {
        id: { in: targetFilters.leadIds },
        optedOut: false,
        status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
      },
      select: { id: true },
    });
  } else {
    // Filter-based targeting
    const leadWhere: any = {
      optedOut: false,
      status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
    };

    if (targetFilters.status?.length) {
      leadWhere.status = { in: targetFilters.status };
    }
    if (targetFilters.source?.length) {
      leadWhere.source = { in: targetFilters.source };
    }
    if (targetFilters.tags?.length) {
      leadWhere.tags = { hasSome: targetFilters.tags };
    }
    if (targetFilters.cities?.length) {
      leadWhere.city = { in: targetFilters.cities };
    }

    leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { id: true },
    });
  }

  // Remove leads who already received this template
  if (alreadyReceivedIds.size > 0) {
    const before = leads.length;
    leads = leads.filter(l => !alreadyReceivedIds.has(l.id));
    if (before !== leads.length) {
      console.log(`[Campaign ${campaign.id}] Skipped ${before - leads.length} leads who already received this template`);
    }
  }

  if (leads.length === 0) {
    throw new AppError('No leads match the campaign filters', 400);
  }

  // Create campaign-lead associations
  await prisma.campaignLead.createMany({
    data: leads.map((lead) => ({
      campaignId: campaign.id,
      leadId: lead.id,
      status: 'PENDING',
    })),
    skipDuplicates: true,
  });

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      totalLeads: leads.length,
    },
  });

  // Send messages in the background (non-blocking)
  // Respond immediately, process sends asynchronously
  const headerMediaUrl = (campaign.targetFilters as any)?.headerMediaUrl;
  processCampaignMessages(campaign.id, campaign.templateId, leads.map(l => l.id), headerMediaUrl)
    .catch(err => console.error(`Campaign ${campaign.id} send error:`, err));

  res.json({
    success: true,
    message: `Campaign started. Sending messages to ${leads.length} leads.`,
    data: { leadsCount: leads.length },
  });
});

// POST /api/campaigns/:id/pause - Pause a running campaign
router.post('/:id/pause', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status !== 'RUNNING') {
    throw new AppError('Only running campaigns can be paused', 400);
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'PAUSED' },
  });

  res.json({ success: true, message: 'Campaign paused' });
});

// POST /api/campaigns/:id/resume - Resume a paused campaign
router.post('/:id/resume', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status !== 'PAUSED') {
    throw new AppError('Only paused campaigns can be resumed', 400);
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  res.json({ success: true, message: 'Campaign resumed' });
});

// POST /api/campaigns/:id/resend - Send pending messages for a running/paused campaign
router.post('/:id/resend', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status !== 'RUNNING' && campaign.status !== 'PAUSED') {
    throw new AppError('Campaign must be running or paused to resend', 400);
  }

  // Get all PENDING leads for this campaign
  const pendingLeads = await prisma.campaignLead.findMany({
    where: { campaignId: campaign.id, status: 'PENDING' },
    select: { leadId: true },
  });

  if (pendingLeads.length === 0) {
    throw new AppError('No pending messages to send', 400);
  }

  // Make sure campaign is RUNNING
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  // Process in background
  const resendHeaderMediaUrl = (campaign.targetFilters as any)?.headerMediaUrl;
  processCampaignMessages(campaign.id, campaign.templateId, pendingLeads.map(l => l.leadId), resendHeaderMediaUrl)
    .catch(err => console.error(`Campaign ${campaign.id} resend error:`, err));

  res.json({
    success: true,
    message: `Sending ${pendingLeads.length} pending messages.`,
    data: { pendingCount: pendingLeads.length },
  });
});

// GET /api/campaigns/:id/analytics - Get full analytics for campaign detail page
router.get('/:id/analytics', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      template: {
        select: { name: true, language: true, bodyText: true },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  const leadBreakdown = await prisma.campaignLead.findMany({
    where: { campaignId: campaign.id },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          businessName: true,
          city: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const statusDistribution = await prisma.campaignLead.groupBy({
    by: ['status'],
    where: { campaignId: campaign.id },
    _count: true,
  });

  const timeline = await prisma.messageLog.findMany({
    where: { campaignId: campaign.id },
    select: {
      id: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const funnel = {
    total: campaign.totalLeads,
    sent: campaign.sentCount,
    delivered: campaign.deliveredCount,
    read: campaign.readCount,
    failed: campaign.failedCount,
    pending: statusDistribution.find(s => s.status === 'PENDING')?._count || 0,
    optedOut: statusDistribution.find(s => s.status === 'OPTED_OUT')?._count || 0,
    deliveryRate: campaign.sentCount > 0
      ? parseFloat(((campaign.deliveredCount / campaign.sentCount) * 100).toFixed(2))
      : 0,
    readRate: campaign.deliveredCount > 0
      ? parseFloat(((campaign.readCount / campaign.deliveredCount) * 100).toFixed(2))
      : 0,
  };

  const timelineBuckets: Record<string, { sent: number; delivered: number; read: number; failed: number }> = {};
  for (const msg of timeline) {
    const hour = msg.sentAt
      ? new Date(msg.sentAt).toISOString().slice(0, 13) + ':00:00Z'
      : new Date(msg.createdAt).toISOString().slice(0, 13) + ':00:00Z';
    if (!timelineBuckets[hour]) {
      timelineBuckets[hour] = { sent: 0, delivered: 0, read: 0, failed: 0 };
    }
    if (msg.sentAt) timelineBuckets[hour].sent++;
    if (msg.deliveredAt) timelineBuckets[hour].delivered++;
    if (msg.readAt) timelineBuckets[hour].read++;
    if (msg.failedAt) timelineBuckets[hour].failed++;
  }

  const timelineChart = Object.entries(timelineBuckets)
    .map(([hour, counts]) => ({ hour, ...counts }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  res.json({
    success: true,
    data: {
      campaign,
      funnel,
      statusDistribution: statusDistribution.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      leads: leadBreakdown,
      timelineChart,
    },
  });
});

// DELETE /api/campaigns/:id - Delete a campaign
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status === 'RUNNING') {
    throw new AppError('Cannot delete a running campaign. Pause it first.', 400);
  }

  await prisma.campaign.delete({
    where: { id: campaign.id },
  });

  res.json({ success: true, message: 'Campaign deleted' });
});

/**
 * Process campaign messages in the background without Redis/BullMQ.
 * Sends one message at a time with a delay to respect WhatsApp rate limits.
 * Checks campaign status before each send so pause/cancel takes effect.
 */
async function processCampaignMessages(
  campaignId: string,
  templateId: string,
  leadIds: string[],
  headerMediaUrl?: string
): Promise<void> {
  console.log(`[Campaign ${campaignId}] Starting to send ${leadIds.length} messages`);
  let sent = 0;
  let failed = 0;
  let throttleBackoff = 0; // escalating backoff for consecutive 131049 errors
  const BASE_DELAY = 5000; // 5s between messages (WhatsApp-safe)
  const MAX_RETRIES = 2; // retry throttled messages up to 2 times

  for (const leadId of leadIds) {
    // Check if campaign is still running (allows pause/cancel)
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign || campaign.status !== 'RUNNING') {
      console.log(`[Campaign ${campaignId}] Stopped — status is ${campaign?.status}`);
      break;
    }

    try {
      let result: { success: boolean; messageId?: string; error?: string; errorCode?: number } | undefined;
      let attempts = 0;

      // Retry loop for throttled (131049) messages
      while (attempts <= MAX_RETRIES) {
        result = await sendCampaignMessage(leadId, campaignId, templateId, [], headerMediaUrl);

        if (result.success || result.errorCode !== 131049) {
          break; // success or non-throttle error — don't retry
        }

        // 131049 throttle — exponential backoff then retry
        attempts++;
        throttleBackoff = Math.min(throttleBackoff + 1, 5);
        const waitTime = 15000 * throttleBackoff; // 15s, 30s, 45s, 60s, 75s
        console.log(`[Campaign ${campaignId}] Throttled (131049) for lead ${leadId} — retry ${attempts}/${MAX_RETRIES} after ${waitTime / 1000}s`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      if (!result) continue;

      // Update campaign-lead status
      const newStatus = result.success ? 'SENT' : 'FAILED';
      await prisma.campaignLead.updateMany({
        where: { campaignId, leadId },
        data: { status: newStatus },
      });

      if (result.success) {
        sent++;
        throttleBackoff = Math.max(0, throttleBackoff - 1); // cool down on success
      } else {
        failed++;
        console.log(`[Campaign ${campaignId}] Failed for lead ${leadId}: [${result.errorCode}] ${result.error}`);
      }

      // Update campaign counters
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          sentCount: sent,
          failedCount: failed,
        },
      });
    } catch (err: any) {
      failed++;
      console.error(`[Campaign ${campaignId}] Error sending to ${leadId}:`, err.message);

      await prisma.campaignLead.updateMany({
        where: { campaignId, leadId },
        data: { status: 'FAILED' },
      });
    }

    // Rate limit: 5s base + random jitter (0-2s) to appear natural
    const jitter = Math.floor(Math.random() * 2000);
    await new Promise(resolve => setTimeout(resolve, BASE_DELAY + jitter));
  }

  // Mark campaign as completed if it's still running
  const finalCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (finalCampaign?.status === 'RUNNING') {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        sentCount: sent,
        failedCount: failed,
      },
    });
  }

  console.log(`[Campaign ${campaignId}] Done — sent: ${sent}, failed: ${failed}`);
}

export default router;
