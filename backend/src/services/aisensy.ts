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
  return !!(process.env.AISENSY_API_KEY && process.env.AISENSY_CAMPAIGN_NAME);
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
export async function sendLeadViaAiSensy(lead: {
  id: string;
  name: string;
  phone: string;
  businessName?: string | null;
  city?: string | null;
}): Promise<AiSensySendResult> {
  if (!isAiSensyConfigured()) {
    return { success: false, error: 'AiSensy not configured' };
  }

  // Build templateParams to MATCH the approved AiSensy template's {{ }} variables.
  // Controlled by AISENSY_TEMPLATE_PARAMS (comma-separated field names, in order):
  //   ""  or "none"      -> no variables  (template has no {{1}})   e.g. "Hello, we manufacture..."
  //   "name"             -> 1 variable {{1}} = shop/contact name    (default)
  //   "name,business"    -> 2 variables {{1}} {{2}}
  //   "name,business,city" -> 3 variables, etc.
  const fieldMap: Record<string, string> = {
    name: lead.name || lead.businessName || 'there',
    business: lead.businessName || lead.name || 'your business',
    businessname: lead.businessName || lead.name || 'your business',
    city: lead.city || '',
  };
  const spec = (process.env.AISENSY_TEMPLATE_PARAMS ?? 'name').trim().toLowerCase();
  const templateParams =
    spec === '' || spec === 'none'
      ? []
      : spec.split(',').map((f) => fieldMap[f.trim()] ?? '');

  const payload: Record<string, any> = {
    apiKey: process.env.AISENSY_API_KEY,
    campaignName: process.env.AISENSY_CAMPAIGN_NAME,
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

  // Header video: pass the real media URL on every send (overrides the template's
  // approval-sample video). Set AISENSY_MEDIA_URL to a public direct URL —
  // a Supabase public-bucket link works best for WhatsApp streaming.
  if (process.env.AISENSY_MEDIA_URL) {
    payload.media = {
      url: process.env.AISENSY_MEDIA_URL,
      filename: process.env.AISENSY_MEDIA_FILENAME || 'shuddhika-mustard-oil.mp4',
    };
  }

  // Log the outbound attempt (mirrors our MessageLog for reporting/dedup)
  const messageLog = await prisma.messageLog.create({
    data: {
      leadId: lead.id,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      content: `AiSensy campaign: ${process.env.AISENSY_CAMPAIGN_NAME}`,
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
