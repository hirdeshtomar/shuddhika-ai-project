import axios from 'axios';
import { prisma } from '../config/database.js';

/**
 * AiSensy integration.
 *
 * A single AiSensy API call both creates the contact and sends the WhatsApp
 * template — so "add lead + send outreach" is one request. Replies land in
 * AiSensy's team inbox AND (via Coexistence) the WhatsApp Business app on the
 * phone, so staff get notifications and a native chat experience.
 *
 * Docs: https://wiki.aisensy.com/en/articles/11501889-api-reference-docs
 */

const AISENSY_API_URL =
  process.env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2';

export function isAiSensyConfigured(): boolean {
  // Sending needs the API key. The campaign can come from a MessageProfile or env.
  return !!process.env.AISENSY_API_KEY;
}

/** A resolved send configuration (from a MessageProfile, or env fallback). */
export interface SendProfile {
  campaignName: string;
  templateParams: string;      // "none" | "name" | "name,business" | ...
  mediaUrl?: string | null;
  mediaFilename?: string | null;
}

function envProfile(): SendProfile {
  return {
    campaignName: process.env.AISENSY_CAMPAIGN_NAME || '',
    templateParams: process.env.AISENSY_TEMPLATE_PARAMS ?? 'name',
    mediaUrl: process.env.AISENSY_MEDIA_URL || null,
    mediaFilename: process.env.AISENSY_MEDIA_FILENAME || null,
  };
}

/**
 * Resolve which SendProfile to use:
 *  - a specific MessageProfile by id, else
 *  - the default MessageProfile, else
 *  - env fallback (AISENSY_CAMPAIGN_NAME etc.)
 */
export async function resolveSendProfile(profileId?: string | null): Promise<SendProfile> {
  const { prisma } = await import('../config/database.js');
  let p = null;
  if (profileId) p = await prisma.messageProfile.findUnique({ where: { id: profileId } });
  if (!p) p = await prisma.messageProfile.findFirst({ where: { isDefault: true } });
  if (!p) p = await prisma.messageProfile.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!p) return envProfile();
  return {
    campaignName: p.aisensyCampaignName,
    templateParams: p.templateParams,
    mediaUrl: p.mediaUrl,
    mediaFilename: p.mediaFilename,
  };
}

/** Normalise an Indian phone to AiSensy's expected "91XXXXXXXXXX" (no +). */
function toAiSensyDestination(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits; // already includes country code
}

export interface AiSensySendResult {
  success: boolean;
  error?: string;
}

/**
 * Send the outreach template to one lead via AiSensy.
 * templateParams map to {{1}}, {{2}}, ... in the approved AiSensy campaign template.
 * We pass name + business name by default (matches our other templates).
 */
export async function sendLeadViaAiSensy(
  lead: {
    id: string;
    name: string;
    phone: string;
    businessName?: string | null;
    city?: string | null;
  },
  profile?: SendProfile
): Promise<AiSensySendResult> {
  if (!isAiSensyConfigured()) {
    return { success: false, error: 'AiSensy not configured (missing AISENSY_API_KEY)' };
  }

  const cfg = profile ?? envProfile();
  if (!cfg.campaignName) {
    return { success: false, error: 'No AiSensy campaign selected (pick a message template)' };
  }

  // Build templateParams to MATCH the campaign template's {{ }} variables.
  //   "none" -> no variables; "name" -> {{1}}=name; "name,business" -> {{1}}{{2}}; ...
  const fieldMap: Record<string, string> = {
    name: lead.name || lead.businessName || 'there',
    business: lead.businessName || lead.name || 'your business',
    businessname: lead.businessName || lead.name || 'your business',
    city: lead.city || '',
  };
  const spec = (cfg.templateParams ?? 'name').trim().toLowerCase();
  const templateParams =
    spec === '' || spec === 'none'
      ? []
      : spec.split(',').map((f) => fieldMap[f.trim()] ?? '');

  const payload: Record<string, any> = {
    apiKey: process.env.AISENSY_API_KEY,
    campaignName: cfg.campaignName,
    destination: toAiSensyDestination(lead.phone),
    userName: lead.name || lead.businessName || 'there',
    source: 'shuddhika-scraper',
    templateParams,
    tags: ['mustard-oil-lead'],
    attributes: {
      business_name: lead.businessName || '',
      city: lead.city || '',
    },
  };

  // Header media (e.g. video link) overrides the template's approval sample.
  if (cfg.mediaUrl) {
    payload.media = {
      url: cfg.mediaUrl,
      filename: cfg.mediaFilename || 'shuddhika-mustard-oil.mp4',
    };
  }

  // Log the outbound attempt (mirrors our MessageLog for reporting/dedup)
  const messageLog = await prisma.messageLog.create({
    data: {
      leadId: lead.id,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      content: `AiSensy campaign: ${cfg.campaignName}`,
      status: 'PENDING',
    },
  });

  try {
    const resp = await axios.post(AISENSY_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    // AiSensy returns HTTP 200 even when it REJECTS the send — the real outcome
    // is in the body. Only count as sent when the body doesn't signal a failure.
    const body = resp.data ?? {};
    const bodyError =
      body.success === false
        ? (body.errorMessage || body.error || body.message || 'AiSensy rejected the message')
        : (body.error || body.errorMessage || null);

    if (bodyError) {
      await prisma.messageLog.update({
        where: { id: messageLog.id },
        data: { status: 'FAILED', failedAt: new Date(), errorMessage: String(bodyError).slice(0, 500) },
      });
      return { success: false, error: String(bodyError) };
    }

    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        // Keep AiSensy's raw acceptance response for debugging
        content: `AiSensy: ${JSON.stringify(body).slice(0, 400)}`,
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CONTACTED', lastContactedAt: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    const errMsg = error.response?.data?.errorMessage
      || error.response?.data?.error
      || error.response?.data?.message
      || error.message;
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: { status: 'FAILED', failedAt: new Date(), errorMessage: String(errMsg).slice(0, 500) },
    });
    return { success: false, error: errMsg };
  }
}
