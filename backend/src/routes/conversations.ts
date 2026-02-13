import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';
import { whatsappClient } from '../services/whatsapp/client.js';

const router = Router();

const sendTextSchema = z.object({
  text: z.string().min(1, 'Message text is required').max(4096),
});

const sendTemplateSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  bodyParams: z.array(z.string()).default([]),
  headerMediaUrl: z.string().url().optional(),
});

// GET /api/conversations - List leads with their latest message
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 30));
  const skip = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  const where: any = {
    messages: { some: {} },
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { businessName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        businessName: true,
        city: true,
        optedOut: true,
        lastContactedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            direction: true,
            status: true,
            createdAt: true,
          },
        },
      },
      skip,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  const conversations = leads
    .map((lead) => ({
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      businessName: lead.businessName,
      city: lead.city,
      optedOut: lead.optedOut,
      lastMessage: lead.messages[0] || null,
    }))
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  res.json({
    success: true,
    data: conversations,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/conversations/:leadId/messages - Full message history for a lead
router.get('/:leadId/messages', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const leadId = req.params.leadId;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const skip = (page - 1) * limit;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      phone: true,
      businessName: true,
      city: true,
      status: true,
      optedOut: true,
      lastContactedAt: true,
    },
  });

  if (!lead) {
    throw new AppError('Lead not found', 404);
  }

  const [messages, total] = await Promise.all([
    prisma.messageLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      select: {
        id: true,
        direction: true,
        content: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        errorMessage: true,
        createdAt: true,
        template: {
          select: { name: true, bodyText: true, headerType: true, headerContent: true },
        },
        campaign: {
          select: { name: true },
        },
      },
    }),
    prisma.messageLog.count({ where: { leadId } }),
  ]);

  res.json({
    success: true,
    data: {
      lead,
      messages,
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST /api/conversations/:leadId/send-text - Send a text message to a lead
router.post('/:leadId/send-text', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const leadId = req.params.leadId!;
  const { text } = sendTextSchema.parse(req.body);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });

  if (!lead) {
    throw new AppError('Lead not found', 404);
  }

  if (lead.optedOut) {
    throw new AppError('Cannot send messages to opted-out leads', 400);
  }

  const messageLog = await prisma.messageLog.create({
    data: {
      leadId,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      content: text,
      status: 'PENDING',
    },
  });

  const result = await whatsappClient.sendTextMessage(lead.phone, text);

  if (result.success) {
    const updated = await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        whatsappMessageId: result.messageId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactedAt: new Date() },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Message sent',
    });
  } else {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: result.error,
      },
    });

    throw new AppError(
      `Failed to send message: ${result.error}. Note: Text messages only work within the 24-hour window after the lead last messaged you. Use a template message instead.`,
      400
    );
  }
});

// POST /api/conversations/:leadId/send-template - Send a template message to a lead
router.post('/:leadId/send-template', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const leadId = req.params.leadId!;
  const { templateId, bodyParams, headerMediaUrl } = sendTemplateSchema.parse(req.body);

  const [lead, template] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.messageTemplate.findUnique({ where: { id: templateId } }),
  ]);

  if (!lead) throw new AppError('Lead not found', 404);
  if (!template) throw new AppError('Template not found', 404);
  if (template.status !== 'APPROVED') throw new AppError('Template must be approved', 400);
  if (!template.whatsappTemplateName) throw new AppError('Template not configured for WhatsApp', 400);
  if (lead.optedOut) throw new AppError('Cannot send messages to opted-out leads', 400);

  // Build header params for templates with IMAGE/VIDEO headers
  const mediaUrl = headerMediaUrl || template.headerContent || undefined;

  const messageLog = await prisma.messageLog.create({
    data: {
      leadId,
      templateId,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      content: mediaUrl ? JSON.stringify({ text: template.bodyText, mediaUrl, mediaType: template.headerType }) : template.bodyText,
      status: 'PENDING',
    },
  });
  let headerParams: { type: 'text' | 'image' | 'video'; value: string } | undefined;
  if (template.headerType === 'IMAGE' && mediaUrl) {
    headerParams = { type: 'image', value: mediaUrl };
  } else if (template.headerType === 'VIDEO' && mediaUrl) {
    headerParams = { type: 'video', value: mediaUrl };
  }

  const components = whatsappClient.buildTemplateComponents(bodyParams, headerParams);
  const result = await whatsappClient.sendTemplateMessage({
    to: lead.phone,
    templateName: template.whatsappTemplateName,
    languageCode: template.language,
    components,
  });

  if (result.success) {
    const updated = await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        whatsappMessageId: result.messageId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactedAt: new Date() },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Template message sent',
    });
  } else {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: result.error,
      },
    });

    throw new AppError(`Failed to send template message: ${result.error}`, 400);
  }
});

export default router;
