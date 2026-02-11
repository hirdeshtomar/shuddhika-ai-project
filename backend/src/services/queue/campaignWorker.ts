import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { sendCampaignMessage } from '../whatsapp/client.js';

// Redis connection
const connection = new IORedis(env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Campaign message queue
export const campaignQueue = new Queue('campaign-messages', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

// Job types
interface SendMessageJob {
  campaignId: string;
  leadId: string;
  templateId: string;
  bodyParams: string[];
}

interface ProcessCampaignJob {
  campaignId: string;
}

/**
 * Add all campaign leads to the message queue
 */
export async function queueCampaignMessages(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      leads: {
        where: { status: 'PENDING' },
        include: {
          lead: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const jobs: { name: string; data: SendMessageJob }[] = [];

  for (const campaignLead of campaign.leads) {
    const lead = campaignLead.lead;

    // Skip opted-out leads
    if (lead.optedOut) {
      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: { status: 'OPTED_OUT' },
      });
      continue;
    }

    // Build body parameters from lead data
    const bodyParams = [
      lead.name, // {{1}} - Name
      lead.businessName || 'your business', // {{2}} - Business name
    ];

    jobs.push({
      name: 'send-message',
      data: {
        campaignId,
        leadId: lead.id,
        templateId: campaign.templateId,
        bodyParams,
      },
    });
  }

  // Add jobs to queue in batches with rate limiting
  // WhatsApp allows ~1000 messages/day for new numbers, ~10k for established
  const batchSize = 50;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    await campaignQueue.addBulk(
      batch.map((job, index) => ({
        name: job.name,
        data: job.data,
        opts: {
          delay: (i + index) * 2000, // 2 second delay between messages
        },
      }))
    );
  }

  return jobs.length;
}

/**
 * Campaign message worker
 */
export function startCampaignWorker(): Worker {
  const worker = new Worker<SendMessageJob>(
    'campaign-messages',
    async (job: Job<SendMessageJob>) => {
      const { campaignId, leadId, templateId, bodyParams } = job.data;

      console.log(`Processing message for lead ${leadId} in campaign ${campaignId}`);

      // Update campaign lead status to indicate processing
      await prisma.campaignLead.updateMany({
        where: {
          campaignId,
          leadId,
        },
        data: { status: 'SENT' },
      });

      // Send the message
      const result = await sendCampaignMessage(leadId, campaignId, templateId, bodyParams);

      if (!result.success) {
        // Update campaign lead status to failed
        await prisma.campaignLead.updateMany({
          where: {
            campaignId,
            leadId,
          },
          data: { status: 'FAILED' },
        });

        throw new Error(result.error || 'Failed to send message');
      }

      // Update campaign stats
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          sentCount: { increment: 1 },
        },
      });

      return { success: true, messageId: result.messageId };
    },
    {
      connection,
      concurrency: 5, // Process 5 messages at a time
      limiter: {
        max: 50, // Max 50 jobs per minute
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`Message sent for job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

/**
 * Check and update campaign completion status
 */
export async function checkCampaignCompletion(campaignId: string): Promise<void> {
  const pendingCount = await prisma.campaignLead.count({
    where: {
      campaignId,
      status: 'PENDING',
    },
  });

  if (pendingCount === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    console.log(`Campaign ${campaignId} completed`);
  }
}
