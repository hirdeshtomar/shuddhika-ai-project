import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  aisensyCampaignName: z.string().min(1, 'AiSensy campaign name is required'),
  templateParams: z.string().default('name'),
  mediaUrl: z.string().url().optional().or(z.literal('')).transform((v) => v || null),
  mediaFilename: z.string().optional().transform((v) => v || null),
  isDefault: z.boolean().optional(),
});

// GET /api/message-profiles
router.get('/', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const profiles = await prisma.messageProfile.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: profiles });
});

// POST /api/message-profiles
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = profileSchema.parse(req.body);
  if (data.isDefault) {
    await prisma.messageProfile.updateMany({ data: { isDefault: false } });
  }
  const profile = await prisma.messageProfile.create({ data });
  res.status(201).json({ success: true, data: profile, message: 'Template saved' });
});

// PUT /api/message-profiles/:id
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = profileSchema.partial().parse(req.body);
  if (data.isDefault) {
    await prisma.messageProfile.updateMany({ data: { isDefault: false } });
  }
  const profile = await prisma.messageProfile.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: profile, message: 'Template updated' });
});

// DELETE /api/message-profiles/:id
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  await prisma.messageProfile.delete({ where: { id: req.params.id } }).catch(() => {
    throw new AppError('Template not found', 404);
  });
  res.json({ success: true, message: 'Template deleted' });
});

export default router;
