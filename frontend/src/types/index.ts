export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessType?: string;
  source: LeadSource;
  status: LeadStatus;
  tags: string[];
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  lastContactedAt?: string;
  notes?: string;
  optedOut: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LeadSource =
  | 'MANUAL'
  | 'CSV_IMPORT'
  | 'JUSTDIAL'
  | 'INDIAMART'
  | 'GOOGLE_MAPS'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'WEBSITE'
  | 'REFERRAL';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'NEGOTIATING'
  | 'CONVERTED'
  | 'REJECTED'
  | 'DO_NOT_CONTACT';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: 'WHATSAPP' | 'SMS' | 'CALL';
  status: CampaignStatus;
  templateId: string;
  template?: MessageTemplate;
  targetFilters?: {
    status?: string[];
    source?: string[];
    tags?: string[];
    cities?: string[];
  };
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  totalLeads: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
}

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null;
  headerContent?: string;
  bodyText: string;
  footerText?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Campaign Analytics
export type CampaignLeadStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'OPTED_OUT';

export interface CampaignAnalytics {
  campaign: Campaign & {
    template?: { name: string; language: string; bodyText: string };
    createdBy?: { name: string };
  };
  funnel: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
    optedOut: number;
    deliveryRate: number;
    readRate: number;
  };
  statusDistribution: Record<string, number>;
  leads: Array<{
    id: string;
    status: CampaignLeadStatus;
    createdAt: string;
    updatedAt: string;
    lead: {
      id: string;
      name: string;
      phone: string;
      businessName?: string;
      city?: string;
    };
  }>;
  timelineChart: Array<{
    hour: string;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }>;
}

// Conversations / Chat
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface Conversation {
  leadId: string;
  name: string;
  phone: string;
  businessName?: string;
  city?: string;
  optedOut: boolean;
  lastMessage: {
    id: string;
    content?: string;
    direction: MessageDirection;
    status: MessageStatus;
    createdAt: string;
  } | null;
}

export interface MessageLogEntry {
  id: string;
  direction: MessageDirection;
  content?: string;
  status: MessageStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  errorMessage?: string;
  createdAt: string;
  template?: { name: string; bodyText: string } | null;
  campaign?: { name: string } | null;
}

export interface ConversationMessages {
  lead: {
    id: string;
    name: string;
    phone: string;
    businessName?: string;
    city?: string;
    status: LeadStatus;
    optedOut: boolean;
    lastContactedAt?: string;
  };
  messages: MessageLogEntry[];
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  activeCampaigns: number;
  messagesSent: number;
}

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  bySource: Record<LeadSource, number>;
  recentlyAdded: number;
}
