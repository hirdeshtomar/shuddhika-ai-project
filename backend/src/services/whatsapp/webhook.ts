import { prisma } from '../../config/database.js';
import {
  WhatsAppWebhookPayload,
  WhatsAppMessageStatus,
  WhatsAppIncomingMessage,
} from '../../types/index.js';
import { sendPushNotification } from '../pushNotification.js';

/**
 * Process incoming WhatsApp webhook events
 */
export async function processWebhookEvent(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      // Process message status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(status);
        }
      }

      // Process incoming messages
      if (value.messages) {
        for (const message of value.messages) {
          await processIncomingMessage(message);
        }
      }
    }
  }
}

/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function processStatusUpdate(status: WhatsAppMessageStatus): Promise<void> {
  const { id: whatsappMessageId, status: messageStatus, timestamp, errors } = status;

  // Find the message log by WhatsApp message ID
  const messageLog = await prisma.messageLog.findUnique({
    where: { whatsappMessageId },
  });

  if (!messageLog) {
    console.log(`Message log not found for WhatsApp ID: ${whatsappMessageId}`);
    return;
  }

  const statusTimestamp = new Date(parseInt(timestamp) * 1000);

  // Update message log based on status
  const updateData: any = {};

  switch (messageStatus) {
    case 'sent':
      updateData.status = 'SENT';
      updateData.sentAt = statusTimestamp;
      break;

    case 'delivered':
      updateData.status = 'DELIVERED';
      updateData.deliveredAt = statusTimestamp;
      break;

    case 'read':
      updateData.status = 'READ';
      updateData.readAt = statusTimestamp;
      break;

    case 'failed':
      updateData.status = 'FAILED';
      updateData.failedAt = statusTimestamp;
      if (errors && errors.length > 0) {
        updateData.errorMessage = errors.map((e) => `${e.code}: ${e.title} - ${e.message}`).join('; ');
      }
      break;
  }

  await prisma.messageLog.update({
    where: { id: messageLog.id },
    data: updateData,
  });

  // Update campaign stats if this message is part of a campaign
  if (messageLog.campaignId) {
    await updateCampaignStats(messageLog.campaignId);
  }

  console.log(`Updated message ${messageLog.id} status to ${messageStatus}`);
}

/**
 * Handle incoming messages from leads
 */
async function processIncomingMessage(message: WhatsAppIncomingMessage): Promise<void> {
  const { from, id } = message;

  // Extract readable content based on message type
  const content = extractMessageContent(message);

  // Find lead by phone number
  const lead = await prisma.lead.findUnique({
    where: { phone: from },
  });

  if (!lead) {
    console.log(`Lead not found for phone: ${from}`);
    return;
  }

  // Check for opt-out keywords
  const messageText = content.toLowerCase();
  const optOutKeywords = ['stop', 'unsubscribe', 'opt out', 'रोकें', 'बंद करो'];

  if (optOutKeywords.some((keyword) => messageText.includes(keyword))) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        optedOut: true,
        optedOutAt: new Date(),
        status: 'DO_NOT_CONTACT',
      },
    });

    console.log(`Lead ${lead.id} opted out`);
    return;
  }

  // Log incoming message
  await prisma.messageLog.create({
    data: {
      leadId: lead.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      whatsappMessageId: id,
      content,
      status: 'DELIVERED',
      deliveredAt: new Date(),
    },
  });

  console.log(`Received message from lead ${lead.id}: ${content}`);

  // Send push notification
  const senderName = lead.name || lead.phone;
  const msgPreview = content.length > 100 ? content.slice(0, 100) + '...' : content;
  sendPushNotification({
    title: `New message from ${senderName}`,
    body: msgPreview,
    url: `/conversations?lead=${lead.id}`,
    tag: `msg-${lead.id}`,
  }).catch((err) => console.error('Push notification error:', err));
}

/**
 * Extract human-readable content from any WhatsApp message type
 */
function extractMessageContent(message: WhatsAppIncomingMessage): string {
  switch (message.type) {
    case 'text':
      return message.text?.body || '[Text]';
    case 'button':
      return message.button?.text || '[Button]';
    case 'interactive':
      return message.interactive?.button_reply?.title
        || message.interactive?.list_reply?.title
        || '[Interactive]';
    case 'image':
      return message.image?.caption || '[Image]';
    case 'video':
      return message.video?.caption || '[Video]';
    case 'document':
      return message.document?.caption || `[Document: ${message.document?.filename || 'file'}]`;
    case 'location':
      return message.location?.name || message.location?.address || '[Location]';
    default:
      return `[${message.type}]`;
  }
}

/**
 * Update campaign statistics after status change
 */
async function updateCampaignStats(campaignId: string): Promise<void> {
  const stats = await prisma.messageLog.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: true,
  });

  const statsMap = stats.reduce((acc, item) => {
    acc[item.status] = item._count;
    return acc;
  }, {} as Record<string, number>);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: (statsMap['SENT'] || 0) + (statsMap['DELIVERED'] || 0) + (statsMap['READ'] || 0),
      deliveredCount: (statsMap['DELIVERED'] || 0) + (statsMap['READ'] || 0),
      readCount: statsMap['READ'] || 0,
      failedCount: statsMap['FAILED'] || 0,
    },
  });
}
