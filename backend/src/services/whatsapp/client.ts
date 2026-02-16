import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { WhatsAppMessageRequest, WhatsAppTemplateComponent } from '../../types/index.js';

export class WhatsAppClient {
  private client: AxiosInstance;
  private phoneNumberId: string;

  constructor() {
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || '';

    this.client = axios.create({
      baseURL: env.WHATSAPP_API_URL,
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a template message to a WhatsApp number
   */
  async sendTemplateMessage(request: WhatsAppMessageRequest): Promise<{
    messageId: string;
    success: boolean;
    error?: string;
    errorCode?: number;
  }> {
    try {
      const template: any = {
        name: request.templateName,
        language: {
          code: request.languageCode,
        },
      };

      // Only include components if there are actual components to send
      // Sending components: [] causes (#100) Invalid parameter
      if (request.components && request.components.length > 0) {
        template.components = request.components;
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: request.to,
        type: 'template',
        template,
      };

      console.log('[WhatsApp] Sending payload:', JSON.stringify(payload, null, 2));

      const response = await this.client.post(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      const messageId = response.data?.messages?.[0]?.id;

      return {
        messageId,
        success: true,
      };
    } catch (error: any) {
      const waError = error.response?.data?.error;
      const errorCode = waError?.code;
      const errorMessage = waError?.message ||
        error.message ||
        'Unknown error sending WhatsApp message';

      console.error('WhatsApp API Error:', JSON.stringify(error.response?.data, null, 2));

      return {
        messageId: '',
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Send a simple text message (only works within 24-hour window)
   */
  async sendTextMessage(to: string, text: string): Promise<{
    messageId: string;
    success: boolean;
    error?: string;
  }> {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      };

      const response = await this.client.post(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      return {
        messageId: response.data?.messages?.[0]?.id || '',
        success: true,
      };
    } catch (error: any) {
      return {
        messageId: '',
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Upload media to WhatsApp for sending
   */
  async uploadMedia(buffer: Buffer, mimeType: string, filename: string): Promise<{
    mediaId: string;
    success: boolean;
    error?: string;
  }> {
    try {
      const blob = new Blob([buffer], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', mimeType);

      const response = await fetch(
        `${env.WHATSAPP_API_URL}/${this.phoneNumberId}/media`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
          body: formData,
        }
      );

      const data = await response.json() as any;
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Media upload failed');
      }

      return { mediaId: data.id, success: true };
    } catch (error: any) {
      return { mediaId: '', success: false, error: error.message };
    }
  }

  /**
   * Send a media message (image, video, document, audio) within 24hr window
   */
  async sendMediaMessage(
    to: string,
    mediaId: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    caption?: string
  ): Promise<{ messageId: string; success: boolean; error?: string }> {
    try {
      const mediaPayload: any = { id: mediaId };
      if (caption && ['image', 'video', 'document'].includes(mediaType)) {
        mediaPayload.caption = caption;
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: mediaType,
        [mediaType]: mediaPayload,
      };

      const response = await this.client.post(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      return {
        messageId: response.data?.messages?.[0]?.id || '',
        success: true,
      };
    } catch (error: any) {
      return {
        messageId: '',
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Get all message templates from WhatsApp Business Account
   * Handles pagination to fetch every template across all pages
   */
  async getTemplates(): Promise<any[]> {
    if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
      console.error('WHATSAPP_BUSINESS_ACCOUNT_ID not configured');
      throw new Error('WhatsApp Business Account ID not configured');
    }

    try {
      console.log(`Fetching templates from WABA: ${env.WHATSAPP_BUSINESS_ACCOUNT_ID}`);
      const allTemplates: any[] = [];

      // First page uses the configured client
      const firstResponse = await this.client.get(
        `/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
        {
          params: {
            fields: 'id,name,status,category,language,components,quality_score',
            limit: '100',
          },
        }
      );
      allTemplates.push(...(firstResponse.data?.data || []));

      // Follow pagination cursors (Meta returns full absolute URLs)
      let nextUrl: string | undefined = firstResponse.data?.paging?.next;
      while (nextUrl) {
        const response = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        });
        allTemplates.push(...(response.data?.data || []));
        nextUrl = response.data?.paging?.next;
      }

      console.log(`WhatsApp API returned ${allTemplates.length} templates (all pages)`);
      return allTemplates;
    } catch (error: any) {
      console.error('Error fetching templates:', {
        status: error.response?.status,
        message: error.response?.data?.error?.message || error.message,
      });
      throw new Error(error.response?.data?.error?.message || 'Failed to fetch templates from WhatsApp');
    }
  }

  /**
   * Create a new message template (requires approval)
   */
  async createTemplate(template: {
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    components: any[];
  }): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      const response = await this.client.post(
        `/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
        template
      );

      return {
        success: true,
        templateId: response.data?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Build template components with parameters
   */
  buildTemplateComponents(
    bodyParams: string[],
    headerParams?: { type: 'text' | 'image' | 'video'; value: string },
    buttons?: Array<{ type: 'quick_reply' | 'url'; payload?: string }>
  ): WhatsAppTemplateComponent[] {
    const components: WhatsAppTemplateComponent[] = [];

    // Header component
    if (headerParams) {
      const headerComponent: WhatsAppTemplateComponent = {
        type: 'header',
        parameters: [],
      };

      if (headerParams.type === 'text') {
        headerComponent.parameters = [{ type: 'text', text: headerParams.value }];
      } else if (headerParams.type === 'image') {
        headerComponent.parameters = [{ type: 'image', image: { link: headerParams.value } }];
      } else if (headerParams.type === 'video') {
        headerComponent.parameters = [{ type: 'video', video: { link: headerParams.value } }];
      }

      components.push(headerComponent);
    }

    // Body component with positional parameters (WhatsApp matches by order)
    if (bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((text) => ({ type: 'text', text })),
      });
    }

    // Button components
    if (buttons && buttons.length > 0) {
      buttons.forEach((button, index) => {
        if (button.type === 'quick_reply') {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index,
            parameters: [{ type: 'text', text: button.payload || '' }],
          });
        }
      });
    }

    return components;
  }
}

// Singleton instance
export const whatsappClient = new WhatsAppClient();

/**
 * Send a campaign message to a lead
 */
export async function sendCampaignMessage(
  leadId: string,
  campaignId: string,
  templateId: string,
  bodyParams: string[],
  headerMediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: number }> {
  // Get lead and template
  const [lead, template] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.messageTemplate.findUnique({ where: { id: templateId } }),
  ]);

  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }

  if (!template || !template.whatsappTemplateName) {
    return { success: false, error: 'Template not configured for WhatsApp' };
  }

  if (lead.optedOut) {
    return { success: false, error: 'Lead has opted out' };
  }

  // Auto-fill body params from lead data when none provided
  // WhatsApp matches template parameters by POSITION, so we always send plain strings
  let resolvedBodyParams: string[] = bodyParams;
  if (bodyParams.length === 0 && template.bodyText) {
    // Extract all variables in order (both {{1}} and {{name}} styles)
    const allVars = template.bodyText.match(/\{\{[^}]+\}\}/g) || [];

    if (allVars.length > 0) {
      const fieldMap: Record<string, string> = {
        name: lead.name || lead.businessName || 'there',
        business_name: lead.businessName || lead.name || '',
        businessname: lead.businessName || lead.name || '',
        city: lead.city || '',
        phone: lead.phone || '',
        '1': lead.name || lead.businessName || 'there',
        '2': lead.businessName || lead.name || '',
        '3': lead.city || '',
        '4': lead.phone || '',
      };

      resolvedBodyParams = allVars.map((v) => {
        const key = v.replace(/\{|\}/g, '').toLowerCase();
        // WhatsApp rejects empty string parameters — always use a fallback
        return fieldMap[key] || lead.name || 'there';
      }).map((p) => p || 'N/A');
    }
  }

  // Build header params from template type + provided media URL
  const mediaUrl = headerMediaUrl || template.headerContent || undefined;

  // Create message log entry with content (including media URL for video/image templates)
  const messageLog = await prisma.messageLog.create({
    data: {
      leadId,
      campaignId,
      templateId,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      content: mediaUrl ? JSON.stringify({ text: template.bodyText, mediaUrl, mediaType: template.headerType }) : template.bodyText,
      status: 'PENDING',
    },
  });
  let headerParams: { type: 'text' | 'image' | 'video'; value: string } | undefined;
  if (template.headerType === 'IMAGE' && mediaUrl) {
    headerParams = { type: 'image', value: mediaUrl };
  } else if (template.headerType === 'VIDEO' && mediaUrl) {
    headerParams = { type: 'video', value: mediaUrl };
  }

  // Send message
  const components = whatsappClient.buildTemplateComponents(resolvedBodyParams, headerParams);
  console.log(`[Campaign] Lead ${leadId} | Template: ${template.whatsappTemplateName} | Body params: ${JSON.stringify(resolvedBodyParams)} | Header: ${JSON.stringify(headerParams)} | Components: ${JSON.stringify(components)}`);
  const result = await whatsappClient.sendTemplateMessage({
    to: lead.phone,
    templateName: template.whatsappTemplateName,
    languageCode: template.language,
    components,
  });

  // Update message log
  if (result.success) {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        whatsappMessageId: result.messageId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    // Update lead's last contacted time and status (NEW → CONTACTED)
    const updateData: any = { lastContactedAt: new Date() };
    if (lead.status === 'NEW') {
      updateData.status = 'CONTACTED';
    }
    await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });
  } else {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: result.error,
      },
    });

    // 131026 = number not on WhatsApp — mark lead so future campaigns skip them
    if (result.errorCode === 131026) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'DO_NOT_CONTACT', notes: 'Phone number not on WhatsApp (131026)' },
      });
      console.log(`[Campaign] Lead ${leadId} marked DO_NOT_CONTACT — not on WhatsApp`);
    }
  }

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
    errorCode: result.errorCode,
  };
}
