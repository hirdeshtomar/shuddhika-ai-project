import { prisma } from '../config/database.js';
import { scrapeGoogleMaps } from './scrapers/googleMaps.js';
import { sendLeadViaAiSensy, isAiSensyConfigured } from './aisensy.js';
import { sendPushNotification } from './pushNotification.js';

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

// High-intent buyer categories (best mustard-oil prospects first)
const OUTREACH_QUERIES = [
  'edible oil wholesaler',
  'mustard oil dealer',
  'kirana store',
  'wholesale grocery',
  'pickle manufacturers',
  'namkeen manufacturers',
  'sweet shops',
  'provision stores',
];

// Cities to rotate through (mustard-oil-strong states weighted first)
const OUTREACH_CITIES = [
  'Lucknow', 'Kanpur', 'Patna', 'Varanasi', 'Gorakhpur',
  'Jaipur', 'Jodhpur', 'Kolkata', 'Bhopal', 'Indore',
  'Ranchi', 'Agra', 'Meerut', 'Ludhiana', 'Delhi',
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

export async function runDailyOutreach(): Promise<DailyOutreachResult> {
  const result: DailyOutreachResult = {
    ran: false, targets: [], leadsScraped: 0, messagesSent: 0, messagesFailed: 0,
  };

  if (!isAiSensyConfigured()) {
    result.skippedReason = 'AiSensy not configured (set AISENSY_API_KEY and AISENSY_CAMPAIGN_NAME)';
    return result;
  }
  if (process.env.DAILY_OUTREACH_ENABLED !== 'true') {
    result.skippedReason = 'Daily outreach disabled (set DAILY_OUTREACH_ENABLED=true)';
    return result;
  }

  result.ran = true;
  const d = dayIndex();

  // Rotate: pick a few query/city combos that shift each day.
  const combosPerDay = parseInt(process.env.DAILY_OUTREACH_COMBOS || '3', 10);
  const relevanceMin = parseInt(process.env.DAILY_OUTREACH_MIN_RELEVANCE || '55', 10);
  const dailyCap = parseInt(process.env.DAILY_OUTREACH_CAP || '40', 10);

  // 1 + 2. Scrape today's rotating targets
  for (let i = 0; i < combosPerDay; i++) {
    const query = OUTREACH_QUERIES[(d + i) % OUTREACH_QUERIES.length]!;
    const city = OUTREACH_CITIES[(d * combosPerDay + i) % OUTREACH_CITIES.length]!;
    result.targets.push(`${query} in ${city}`);
    try {
      const scr = await scrapeGoogleMaps(query, city);
      result.leadsScraped += scr.leadsAdded;
    } catch (err: any) {
      console.error(`[DailyOutreach] scrape failed for "${query} in ${city}":`, err.message);
    }
  }

  // 3. Select the best new, uncontacted, high-relevance leads
  const candidates = await prisma.lead.findMany({
    where: {
      status: 'NEW',
      optedOut: false,
      lastContactedAt: null,
      relevanceScore: { gte: relevanceMin },
    },
    orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
    take: dailyCap,
  });

  for (const lead of candidates) {
    const r = await sendLeadViaAiSensy(lead);
    if (r.success) result.messagesSent++;
    else result.messagesFailed++;
    // Gentle spacing between sends
    await new Promise((res) => setTimeout(res, 1500));
  }

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
