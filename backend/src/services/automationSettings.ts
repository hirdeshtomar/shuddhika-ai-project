import { prisma } from '../config/database.js';

const SETTINGS_ID = 'default';

export type AutomationSettings = Awaited<ReturnType<typeof getAutomationSettings>>;

/** Get the singleton settings row, creating it with env-based defaults if missing. */
export async function getAutomationSettings() {
  const existing = await prisma.automationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  // Seed defaults from env (so existing env config carries over the first time)
  return prisma.automationSettings.create({
    data: {
      id: SETTINGS_ID,
      enabled: process.env.DAILY_OUTREACH_ENABLED === 'true',
      dailyCap: parseInt(process.env.DAILY_OUTREACH_CAP || '15', 10),
      minRelevanceScore: parseInt(process.env.DAILY_OUTREACH_MIN_RELEVANCE || '55', 10),
      combosPerDay: parseInt(process.env.DAILY_OUTREACH_COMBOS || '3', 10),
      runHourIST: 10,
    },
  });
}

/** IST date string "YYYY-MM-DD" — used for the once-per-day gate. */
export function istDateString(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Current IST hour 0-23. */
export function istHour(d: Date = new Date()): number {
  return Math.floor((d.getTime() + 5.5 * 60 * 60 * 1000) / (60 * 60 * 1000)) % 24;
}

/** UTC Date instant corresponding to IST midnight of the current day. */
export function istStartOfToday(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
}
