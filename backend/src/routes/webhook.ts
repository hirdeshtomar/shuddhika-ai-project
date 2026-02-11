import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { processWebhookEvent } from '../services/whatsapp/webhook.js';
import { WhatsAppWebhookPayload } from '../types/index.js';

const router = Router();

/**
 * GET /api/webhook/whatsapp - Webhook verification (required by Meta)
 */
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * POST /api/webhook/whatsapp - Receive WhatsApp events
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  // Always respond with 200 immediately to acknowledge receipt
  res.sendStatus(200);

  try {
    const payload = req.body as WhatsAppWebhookPayload;

    // Verify this is a WhatsApp webhook
    if (payload.object !== 'whatsapp_business_account') {
      console.log('Ignoring non-WhatsApp webhook');
      return;
    }

    // Process the event asynchronously
    await processWebhookEvent(payload);
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
  }
});

export default router;
