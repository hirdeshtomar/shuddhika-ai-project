import { prisma } from '../config/database.js';
import { sendCampaignMessage } from './whatsapp/client.js';

/**
 * Cron-driven campaign sender.
 *
 * Called once per minute (Vercel Cron in production, setInterval locally).
 * Each tick sends whatever messages are due across all RUNNING campaigns,
 * then exits — no long-lived process needed. All anti-block safeguards live here:
 *   - business hours window (9 AM – 9 PM IST)
 *   - global daily cap across all campaigns
 *   - per-campaign speed delays + per-speed daily limits
 *   - immediate pause on Meta spam/rate errors
 *   - auto-pause when recent success rate collapses
 */

// Sending speed presets (delay in ms between messages)
export const SENDING_SPEEDS: Record<string, { delayMs: number; label: string; dailyLimit?: number }> = {
  fast: { delayMs: 5_000, label: '1 per 5s' },             // ~12/min — risky for new numbers
  normal: { delayMs: 30_000, label: '1 per 30s' },          // ~2/min — safe for established accounts
  slow: { delayMs: 300_000, label: '1 per 5min' },          // safe for newer numbers
  very_slow: { delayMs: 600_000, label: '1 per 10min' },    // for accounts with warnings
  warmup: { delayMs: 1_800_000, label: '1 per 30min', dailyLimit: 10 }, // for new numbers getting 131049
};

// Error codes that mean Meta is flagging US — stop immediately
const FATAL_ERROR_CODES = new Set([
  131048, // Spam rate limit hit
  368,    // Temporarily blocked for policy violations
  130429, // Rate limit hit
  131056, // (Business, consumer) pair rate limit
]);

const SEND_HOUR_START = 9;   // 9 AM IST
const SEND_HOUR_END = 21;    // 9 PM IST
const RATE_WINDOW = 20;
const MIN_SUCCESS_RATE = 0.60;
const MAX_TICK_MS = 50_000;  // stay under serverless limits

function istHour(): number {
  return (new Date().getUTCHours() + 5.5) % 24;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TickResult {
  campaignsProcessed: number;
  messagesSent: number;
  messagesFailed: number;
  skippedReason?: string;
}

export async function runCampaignTick(): Promise<TickResult> {
  const result: TickResult = { campaignsProcessed: 0, messagesSent: 0, messagesFailed: 0 };
  const tickStart = Date.now();

  // Business hours: outside the window we simply don't send.
  // Campaigns stay RUNNING and resume automatically next morning.
  const hour = istHour();
  if (hour < SEND_HOUR_START || hour >= SEND_HOUR_END) {
    result.skippedReason = `outside business hours (${hour.toFixed(1)} IST)`;
    return result;
  }

  // Global daily cap across all campaigns
  const GLOBAL_DAILY_CAP = parseInt(process.env.CAMPAIGN_GLOBAL_DAILY_CAP || '250', 10);
  let sentToday = await prisma.messageLog.count({
    where: { direction: 'OUTBOUND', channel: 'WHATSAPP', sentAt: { gte: startOfToday() } },
  });
  if (sentToday >= GLOBAL_DAILY_CAP) {
    result.skippedReason = `global daily cap reached (${GLOBAL_DAILY_CAP})`;
    return result;
  }

  const campaigns = await prisma.campaign.findMany({
    where: { status: 'RUNNING' },
    orderBy: { startedAt: 'asc' },
  });

  for (const campaign of campaigns) {
    if (Date.now() - tickStart > MAX_TICK_MS) break;
    result.campaignsProcessed++;

    const filters = (campaign.targetFilters as any) || {};
    const speed = SENDING_SPEEDS[filters.sendingSpeed] ?? SENDING_SPEEDS['normal']!;
    const headerMediaUrl = filters.headerMediaUrl as string | undefined;

    // Per-campaign daily limit (speed presets like warmup have one)
    if (speed.dailyLimit) {
      const campaignSentToday = await prisma.messageLog.count({
        where: { campaignId: campaign.id, direction: 'OUTBOUND', sentAt: { gte: startOfToday() } },
      });
      if (campaignSentToday >= speed.dailyLimit) continue;
    }

    // Is a send due yet for this campaign's speed?
    const sinceLastSend = campaign.lastSendAt
      ? Date.now() - campaign.lastSendAt.getTime()
      : Number.MAX_SAFE_INTEGER;
    if (sinceLastSend < speed.delayMs) continue;

    // Success-rate check over the last RATE_WINDOW messages
    const recent = await prisma.messageLog.findMany({
      where: { campaignId: campaign.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      take: RATE_WINDOW,
      select: { status: true },
    });
    if (recent.length === RATE_WINDOW) {
      const successRate = recent.filter((m) => m.status !== 'FAILED').length / RATE_WINDOW;
      if (successRate < MIN_SUCCESS_RATE) {
        console.log(`[Tick] Campaign ${campaign.id}: success rate ${Math.round(successRate * 100)}% — auto-pausing`);
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
        continue;
      }
    }

    // How many to send this tick: for sub-minute delays, several fit in one tick
    const perTick = Math.max(1, Math.min(Math.floor(60_000 / speed.delayMs), 10));

    for (let i = 0; i < perTick; i++) {
      if (Date.now() - tickStart > MAX_TICK_MS) break;
      if (sentToday >= GLOBAL_DAILY_CAP) break;

      const next = await prisma.campaignLead.findFirst({
        where: { campaignId: campaign.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!next) {
        // Nothing pending — campaign complete
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        console.log(`[Tick] Campaign ${campaign.id} completed`);
        break;
      }

      // In-tick pacing for sub-minute speeds (skip delay before the first send)
      if (i > 0) {
        const jitter = Math.floor(Math.random() * Math.max(speed.delayMs * 0.1, 2000));
        await sleep(speed.delayMs + jitter);
      }

      let fatal = false;
      try {
        const sendResult = await sendCampaignMessage(
          next.leadId, campaign.id, campaign.templateId, [], headerMediaUrl
        );

        await prisma.campaignLead.update({
          where: { id: next.id },
          data: { status: sendResult.success ? 'SENT' : 'FAILED' },
        });

        if (sendResult.success) {
          result.messagesSent++;
          sentToday++;
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { sentCount: { increment: 1 }, lastSendAt: new Date() },
          });
        } else {
          result.messagesFailed++;
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { failedCount: { increment: 1 }, lastSendAt: new Date() },
          });
          console.log(`[Tick] Campaign ${campaign.id} lead ${next.leadId} failed: [${sendResult.errorCode}] ${sendResult.error}`);

          if (sendResult.errorCode && FATAL_ERROR_CODES.has(sendResult.errorCode)) {
            console.log(`[Tick] Campaign ${campaign.id}: FATAL error ${sendResult.errorCode} — pausing immediately`);
            await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
            fatal = true;
          }
        }
      } catch (err: any) {
        result.messagesFailed++;
        console.error(`[Tick] Campaign ${campaign.id} error:`, err.message);
        await prisma.campaignLead.update({
          where: { id: next.id },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }

      if (fatal) break;
    }
  }

  return result;
}
