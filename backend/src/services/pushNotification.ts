import webpush from 'web-push';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

// Initialize web-push with VAPID keys
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

/**
 * Send push notification to all subscribed clients
 */
export async function sendPushNotification(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return; // Push not configured
  }

  const subscriptions = await prisma.pushSubscription.findMany();

  const notifications = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        {
          TTL: 86400,       // 24 hours — keeps notification alive if device is offline
          urgency: 'high',  // Wakes Android devices in Doze mode via FCM
        }
      );
    } catch (error: any) {
      // If subscription is expired or invalid, remove it
      if (error.statusCode === 404 || error.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        console.log(`Removed expired push subscription: ${sub.id}`);
      } else {
        console.error(`Push notification error for sub ${sub.id}:`, error.statusCode, error.body);
      }
    }
  });

  await Promise.allSettled(notifications);
}
