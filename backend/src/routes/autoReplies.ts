import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';

const router = Router();

const autoReplySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  triggerType: z.enum(['KEYWORD', 'BUTTON', 'ANY']).default('KEYWORD'),
  triggerKeywords: z.array(z.string()).default([]),
  replyText: z.string().min(1, 'Reply text is required'),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
});

// GET /api/auto-replies — List all rules
router.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const rules = await prisma.autoReply.findMany({
    orderBy: { priority: 'asc' },
  });

  res.json({ success: true, data: rules });
});

// POST /api/auto-replies — Create rule
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = autoReplySchema.parse(req.body);

  const rule = await prisma.autoReply.create({ data });

  res.status(201).json({ success: true, data: rule, message: 'Auto-reply rule created' });
});

// PUT /api/auto-replies/:id — Update rule
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const existing = await prisma.autoReply.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Auto-reply rule not found', 404);

  const data = autoReplySchema.partial().parse(req.body);

  const rule = await prisma.autoReply.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: rule });
});

// DELETE /api/auto-replies/:id — Delete rule
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const existing = await prisma.autoReply.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Auto-reply rule not found', 404);

  await prisma.autoReply.delete({ where: { id: req.params.id } });

  res.json({ success: true, message: 'Auto-reply rule deleted' });
});

export default router;
