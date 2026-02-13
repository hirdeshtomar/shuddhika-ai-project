import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// GET /api/push/vapid-key - Get the public VAPID key
router.get('/vapid-key', authenticate, (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    data: { vapidPublicKey: env.VAPID_PUBLIC_KEY || null },
  });
});

// POST /api/push/subscribe - Save a push subscription
router.post('/subscribe', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const { endpoint, keys } = subscribeSchema.parse(req.body);

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: req.user!.id,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: req.user!.id,
    },
  });

  res.json({ success: true, message: 'Subscribed to push notifications' });
});

// POST /api/push/unsubscribe - Remove a push subscription
router.post('/unsubscribe', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);

  await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});

  res.json({ success: true, message: 'Unsubscribed from push notifications' });
});

export default router;
