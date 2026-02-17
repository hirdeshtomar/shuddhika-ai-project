import { Request } from 'express';
import { User, Lead, Campaign, MessageTemplate } from '@prisma/client';

// Extend Express Request to include authenticated user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Lead types
export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessType?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  status?: Lead['status'];
  optedOut?: boolean;
}

export interface LeadFilters {
  status?: string[];
  source?: string[];
  tags?: string[];
  city?: string;
  search?: string;
  optedOut?: boolean;
}

// Campaign types
export interface CreateCampaignInput {
  name: string;
  description?: string;
  type?: Campaign['type'];
  templateId: string;
  leadIds?: string[];
  headerMediaUrl?: string;
  skipDuplicateTemplate?: boolean;
  sendingSpeed?: 'fast' | 'normal' | 'slow' | 'very_slow';
  targetFilters?: {
    status?: string[];
    source?: string[];
    tags?: string[];
    cities?: string[];
  };
  scheduledAt?: Date;
}

export interface CampaignStats {
  totalLeads: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  deliveryRate: number;
  readRate: number;
}

// WhatsApp types
export interface WhatsAppMessageRequest {
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: WhatsAppParameter[];
  sub_type?: string;
  index?: number;
}

export interface WhatsAppParameter {
  type: 'text' | 'image' | 'video' | 'document';
  parameter_name?: string;
  text?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    statuses?: WhatsAppMessageStatus[];
    messages?: WhatsAppIncomingMessage[];
  };
  field: string;
}

export interface WhatsAppMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  sticker?: { id: string; mime_type: string; animated?: boolean };
}

// CSV Import types
export interface CsvLeadRow {
  name: string;
  phone: string;
  email?: string;
  business_name?: string;
  business_type?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  tags?: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: Array<{
    row: number;
    error: string;
  }>;
}

// Scraper types
export interface ScraperConfig {
  source: Lead['source'];
  query: string;
  location?: string;
  maxResults?: number;
}

export interface ScrapedLead {
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessType?: string;
  city?: string;
  state?: string;
  address?: string;
  source: Lead['source'];
}
