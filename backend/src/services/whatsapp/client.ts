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
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: request.to,
        type: 'template',
        template: {
          name: request.templateName,
          language: {
            code: request.languageCode,
          },
          components: request.components || [],
        },
      };

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

      console.error('WhatsApp API Error:', {
        status: error.response?.status,
        code: errorCode,
        message: errorMessage,
      });

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

    // Body component with parameters
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
  if (bodyParams.length === 0 && template.bodyText) {
    // Support both numbered ({{1}}) and named ({{name}}) variables
    const namedVars = template.bodyText.match(/\{\{([a-zA-Z_]\w*)\}\}/g) || [];
    const numberedVars = template.bodyText.match(/\{\{\d+\}\}/g) || [];

    if (namedVars.length > 0) {
      // Named params: map variable names to lead fields
      const fieldMap: Record<string, string> = {
        name: lead.name || lead.businessName || 'there',
        business_name: lead.businessName || lead.name || '',
        businessname: lead.businessName || lead.name || '',
        city: lead.city || '',
        phone: lead.phone || '',
      };
      bodyParams = namedVars.map((v) => {
        const key = v.replace(/\{|\}/g, '').toLowerCase();
        return fieldMap[key] || lead.name || 'there';
      });
    } else if (numberedVars.length > 0) {
      // Numbered params: {{1}}=name, {{2}}=businessName, {{3}}=city, {{4}}=phone
      const leadFields = [
        lead.name || lead.businessName || 'there',
        lead.businessName || lead.name || '',
        lead.city || '',
        lead.phone || '',
      ];
      bodyParams = leadFields.slice(0, numberedVars.length);
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
  const components = whatsappClient.buildTemplateComponents(bodyParams, headerParams);
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

    // Update lead's last contacted time
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactedAt: new Date() },
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
