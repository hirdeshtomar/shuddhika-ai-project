import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse, CreateCampaignInput } from '../types/index.js';
import { whatsappClient } from '../services/whatsapp/client.js';

const router = Router();

// Validation schemas
// Sending is handled by the cron tick (services/campaignTick.ts).
// Once a campaign is RUNNING, the tick picks it up within a minute.

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  type: z.enum(['WHATSAPP', 'SMS', 'CALL']).default('WHATSAPP'),
  templateId: z.string().min(1, 'Template ID is required'),
  leadIds: z.array(z.string()).optional(),
  headerMediaUrl: z.string().url().optional(),
  skipDuplicateTemplate: z.boolean().default(true),
  sendingSpeed: z.enum(['fast', 'normal', 'slow', 'very_slow', 'warmup']).default('normal'),
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
        sendingSpeed: data.sendingSpeed || 'normal',
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

  // Quality gate: refuse to start when Meta rates the number RED,
  // force slow sending when YELLOW. Skipped silently if the API call fails.
  const quality = await whatsappClient.getPhoneNumberQuality();
  let forcedSpeed: string | null = null;
  if (quality.qualityRating === 'RED') {
    throw new AppError(
      'WhatsApp number quality is RED — sending now risks a permanent block. Wait for quality to recover (check Meta Business Manager) before running campaigns.',
      400
    );
  } else if (quality.qualityRating === 'YELLOW') {
    forcedSpeed = 'slow';
    console.log(`[Campaign ${campaign.id}] Quality is YELLOW — forcing slow sending speed`);
  }

  // Get matching leads — either specific IDs or filter-based
  const targetFilters = campaign.targetFilters as any || {};

  // Frequency cap: skip leads contacted recently (default 5 days, configurable per campaign)
  const minDaysSinceContact = Number(targetFilters.minDaysSinceContact ?? 5);
  const contactCutoff = new Date(Date.now() - minDaysSinceContact * 24 * 60 * 60 * 1000);
  const frequencyCapWhere = minDaysSinceContact > 0
    ? { OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: contactCutoff } }] }
    : {};
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
        ...frequencyCapWhere,
      },
      select: { id: true },
    });
  } else {
    // Filter-based targeting
    const leadWhere: any = {
      optedOut: false,
      status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] },
      ...frequencyCapWhere,
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

  // Persist forced speed (quality YELLOW) so the cron tick respects it
  if (forcedSpeed) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { targetFilters: { ...targetFilters, sendingSpeed: forcedSpeed } },
    });
  }

  // Sending starts within a minute via the campaign tick cron
  res.json({
    success: true,
    message: `Campaign started. ${leads.length} messages will begin sending within a minute.`,
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

  // The campaign tick cron picks up PENDING leads within a minute
  res.json({
    success: true,
    message: `${pendingLeads.length} pending messages will resume sending within a minute.`,
    data: { pendingCount: pendingLeads.length },
  });
});

// POST /api/campaigns/:id/retry-failed - Retry failed messages (excludes DO_NOT_CONTACT leads)
router.post('/:id/retry-failed', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  if (campaign.status !== 'RUNNING' && campaign.status !== 'PAUSED' && campaign.status !== 'COMPLETED') {
    throw new AppError('Campaign must be running, paused, or completed to retry', 400);
  }

  // Get all FAILED campaign leads, excluding DO_NOT_CONTACT leads
  const failedLeads = await prisma.campaignLead.findMany({
    where: {
      campaignId: campaign.id,
      status: 'FAILED',
      lead: { status: { notIn: ['DO_NOT_CONTACT', 'REJECTED'] }, optedOut: false },
    },
    select: { leadId: true },
  });

  if (failedLeads.length === 0) {
    throw new AppError('No retryable failed messages', 400);
  }

  // Reset failed leads to PENDING
  await prisma.campaignLead.updateMany({
    where: {
      campaignId: campaign.id,
      leadId: { in: failedLeads.map((l) => l.leadId) },
      status: 'FAILED',
    },
    data: { status: 'PENDING' },
  });

  // Set campaign to RUNNING
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING' },
  });

  // The campaign tick cron picks up the reset PENDING leads within a minute
  res.json({
    success: true,
    message: `${failedLeads.length} failed messages queued for retry.`,
    data: { retryCount: failedLeads.length },
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

// GET /api/campaigns/quality/status - WhatsApp number quality rating (GREEN/YELLOW/RED)
router.get('/quality/status', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const quality = await whatsappClient.getPhoneNumberQuality();
  res.json({
    success: true,
    data: {
      qualityRating: quality.qualityRating,
      error: quality.error,
      advice:
        quality.qualityRating === 'RED'
          ? 'Do NOT send campaigns. Wait for quality to recover.'
          : quality.qualityRating === 'YELLOW'
            ? 'At risk — campaigns will be forced to slow speed.'
            : 'Healthy.',
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

export default router;
