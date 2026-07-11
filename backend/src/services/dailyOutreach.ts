import { prisma } from '../config/database.js';
import { scrapeGoogleMaps } from './scrapers/googleMaps.js';
import { sendLeadViaAiSensy, isAiSensyConfigured, resolveSendProfile } from './aisensy.js';
import { sendPushNotification } from './pushNotification.js';
import { getAutomationSettings, istDateString, istHour, istStartOfToday } from './automationSettings.js';

/**
 * Daily auto-outreach: runs once a day (Vercel Cron).
 *
 * 1. Picks a rotating set of buyer categories + cities so each day targets
 *    different places, over time covering the whole matrix.
 * 2. Scrapes Google Maps for those (leads are relevance-scored + saved).
 * 3. Sends the day's approved template to the top new, relevant, uncontacted
 *    leads via AiSensy — up to a daily cap.
 *
 * Cold-outreach caps still apply (Meta allows ~2 marketing msgs/user/day and
 * quality rules), so keep DAILY_OUTREACH_CAP modest and let replies do the work.
 */

// PREMIUM default categories — buyers who want pure/quality oil, not the cheapest.
// (Editable per-account via AutomationSettings.targetQueries.)
const OUTREACH_QUERIES = [
  'organic food store',
  'organic store',
  'health food store',
  'gourmet food store',
  'premium supermarket',
  'cold pressed oil store',
  'pickle manufacturer',
  'namkeen manufacturer',
  'sweet shop',
  'bakery',
];

// PREMIUM default cities — metros & affluent hubs where premium demand concentrates.
// (Editable per-account via AutomationSettings.targetCities.)
const OUTREACH_CITIES = [
  'Delhi', 'Gurugram', 'Noida', 'Mumbai', 'Pune',
  'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
  'Chandigarh', 'Ahmedabad', 'Jaipur',
];

/** Deterministic day index so the rotation advances one step per calendar day. */
function dayIndex(): number {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

export interface DailyOutreachResult {
  ran: boolean;
  skippedReason?: string;
  targets: string[];
  leadsScraped: number;
  messagesSent: number;
  messagesFailed: number;
}

/**
 * @param opts.force  Run now, ignoring the enabled flag / scheduled hour / once-a-day gate
 *                    (used by the "Run now" button). Still needs AiSensy configured.
 */
export async function runDailyOutreach(opts: { force?: boolean } = {}): Promise<DailyOutreachResult> {
  const result: DailyOutreachResult = {
    ran: false, targets: [], leadsScraped: 0, messagesSent: 0, messagesFailed: 0,
  };

  if (!isAiSensyConfigured()) {
    result.skippedReason = 'AiSensy not configured (set AISENSY_API_KEY and AISENSY_CAMPAIGN_NAME)';
    return result;
  }

  const settings = await getAutomationSettings();
  const relevanceMin = settings.minRelevanceScore;

  const hour = istHour();
  if (!opts.force) {
    if (!settings.enabled) {
      result.skippedReason = 'Automation is turned off';
      return result;
    }
    if (hour < settings.workStartHourIST || hour >= settings.workEndHourIST) {
      result.skippedReason = `Outside working hours (${settings.workStartHourIST}:00–${settings.workEndHourIST}:00 IST)`;
      return result;
    }
  }

  // How many automated messages have already gone out today?
  const todaysRuns = await prisma.outreachRun.aggregate({
    where: { type: 'AUTOMATED', startedAt: { gte: istStartOfToday() } },
    _sum: { sent: true },
  });
  const sentToday = todaysRuns._sum.sent || 0;
  const remaining = Math.max(0, settings.dailyCap - sentToday);

  if (!opts.force && remaining <= 0) {
    result.skippedReason = `Daily total of ${settings.dailyCap} already sent`;
    return result;
  }

  // Spread the remaining messages evenly over the hours left in the window,
  // so sending trickles through the day instead of bursting.
  const hoursLeft = opts.force ? 1 : Math.max(1, settings.workEndHourIST - hour);
  let batch = Math.ceil((opts.force ? settings.dailyCap : remaining) / hoursLeft);
  batch = Math.min(batch, settings.maxPerBatch);
  if (!opts.force) batch = Math.min(batch, remaining);
  batch = Math.max(1, batch);

  result.ran = true;
  const d = dayIndex();

  // Top up the lead pool if we don't have enough qualifying, uncontacted leads
  // for this batch. Only scrape when needed — keeps Google API cost down.
  const qualifyingWhere = {
    status: 'NEW' as const,
    optedOut: false,
    lastContactedAt: null,
    relevanceScore: { gte: relevanceMin },
  };
  const queries = settings.targetQueries?.length ? settings.targetQueries : OUTREACH_QUERIES;
  const cities = settings.targetCities?.length ? settings.targetCities : OUTREACH_CITIES;

  const available = await prisma.lead.count({ where: qualifyingWhere });
  if (available < batch) {
    for (let i = 0; i < settings.combosPerDay; i++) {
      const query = queries[(d + i) % queries.length]!;
      const city = cities[(d * settings.combosPerDay + hour + i) % cities.length]!;
      result.targets.push(`${query} in ${city}`);
      try {
        const scr = await scrapeGoogleMaps(query, city);
        result.leadsScraped += scr.leadsAdded;
      } catch (err: any) {
        console.error(`[Outreach] scrape failed for "${query} in ${city}":`, err.message);
      }
    }
  }

  // Select this batch's best new, uncontacted, high-relevance leads
  const candidates = await prisma.lead.findMany({
    where: qualifyingWhere,
    orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
    take: batch,
  });

  const sendProfile = await resolveSendProfile(settings.messageProfileId);
  const errorsSample: string[] = [];
  for (const lead of candidates) {
    const r = await sendLeadViaAiSensy(lead, sendProfile);
    if (r.success) result.messagesSent++;
    else {
      result.messagesFailed++;
      if (r.error && errorsSample.length < 5) errorsSample.push(`${lead.name}: ${r.error}`);
    }
    // Gentle spacing between sends
    await new Promise((res) => setTimeout(res, 1500));
  }

  // Log this run to the history
  await prisma.outreachRun.create({
    data: {
      type: 'AUTOMATED',
      finishedAt: new Date(),
      totalLeads: candidates.length,
      sent: result.messagesSent,
      failed: result.messagesFailed,
      targets: result.targets,
      errorsSample,
      note: opts.force ? 'Manual "Run Now"' : 'Scheduled daily run',
    },
  }).catch((e: any) => console.error('[DailyOutreach] failed to log run:', e.message));

  // Record last-run snapshot + mark today done (so it won't repeat this calendar day)
  await prisma.automationSettings.update({
    where: { id: settings.id },
    data: {
      lastRunAt: new Date(),
      lastRunDate: istDateString(),
      lastRunTargets: result.targets,
      lastScraped: result.leadsScraped,
      lastSent: result.messagesSent,
      lastFailed: result.messagesFailed,
      lastRunNote: opts.force ? 'Manual run' : 'Scheduled run',
    },
  }).catch((e: any) => console.error('[DailyOutreach] failed to save last-run:', e.message));

  // Notify the team
  if (result.messagesSent > 0 || result.leadsScraped > 0) {
    sendPushNotification({
      title: 'Daily outreach done',
      body: `${result.messagesSent} messages sent to new leads. ${result.leadsScraped} fresh leads added today.`,
      url: '/leads',
      tag: 'daily-outreach',
    }).catch(() => {});
  }

  console.log(`[DailyOutreach] targets=${result.targets.join('; ')} scraped=${result.leadsScraped} sent=${result.messagesSent} failed=${result.messagesFailed}`);
  return result;
}
