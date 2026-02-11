import axios from 'axios';
import type { ApiResponse, Lead, Campaign, MessageTemplate, DashboardStats, LeadStats, User, CampaignAnalytics, Conversation, ConversationMessages, MessageLogEntry } from '../types';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', {
      email,
      password,
    });
    if (data.data?.token) {
      localStorage.setItem('token', data.data.token);
    }
    return data;
  },

  register: async (email: string, password: string, name: string) => {
    const { data } = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/register', {
      email,
      password,
      name,
    });
    if (data.data?.token) {
      localStorage.setItem('token', data.data.token);
    }
    return data;
  },

  me: async () => {
    const { data } = await api.get<ApiResponse<User>>('/auth/me');
    return data;
  },

  logout: () => {
    localStorage.removeItem('token');
  },
};

// Dashboard
export const dashboardApi = {
  getStats: async () => {
    const { data } = await api.get<ApiResponse<DashboardStats>>('/dashboard');
    return data;
  },
};

// Leads
export const leadsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    source?: string;
    search?: string;
    city?: string;
  }) => {
    const { data } = await api.get<ApiResponse<Lead[]>>('/leads', { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<ApiResponse<Lead>>(`/leads/${id}`);
    return data;
  },

  create: async (lead: Partial<Lead>) => {
    const { data } = await api.post<ApiResponse<Lead>>('/leads', lead);
    return data;
  },

  update: async (id: string, lead: Partial<Lead>) => {
    const { data } = await api.put<ApiResponse<Lead>>(`/leads/${id}`, lead);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<void>>(`/leads/${id}`);
    return data;
  },

  bulkImport: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<ApiResponse<{
      total: number;
      imported: number;
      duplicates: number;
      errors: Array<{ row: number; error: string }>;
    }>>('/leads/bulk-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  bulkDelete: async (ids: string[]) => {
    const { data } = await api.post<ApiResponse<void>>('/leads/bulk-delete', { ids });
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<ApiResponse<LeadStats>>('/leads/stats');
    return data;
  },
};

// Campaigns
export const campaignsApi = {
  list: async (params?: { page?: number; limit?: number; status?: string }) => {
    const { data } = await api.get<ApiResponse<Campaign[]>>('/campaigns', { params });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<ApiResponse<Campaign>>(`/campaigns/${id}`);
    return data;
  },

  create: async (campaign: Partial<Campaign>) => {
    const { data } = await api.post<ApiResponse<Campaign>>('/campaigns', campaign);
    return data;
  },

  start: async (id: string) => {
    const { data } = await api.post<ApiResponse<{ leadsCount: number }>>(`/campaigns/${id}/start`);
    return data;
  },

  pause: async (id: string) => {
    const { data } = await api.post<ApiResponse<void>>(`/campaigns/${id}/pause`);
    return data;
  },

  resume: async (id: string) => {
    const { data } = await api.post<ApiResponse<void>>(`/campaigns/${id}/resume`);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<void>>(`/campaigns/${id}`);
    return data;
  },

  getStats: async (id: string) => {
    const { data } = await api.get<ApiResponse<Campaign>>(`/campaigns/${id}/stats`);
    return data;
  },

  getAnalytics: async (id: string) => {
    const { data } = await api.get<ApiResponse<CampaignAnalytics>>(`/campaigns/${id}/analytics`);
    return data;
  },

  resend: async (id: string) => {
    const { data } = await api.post<ApiResponse<{ pendingCount: number }>>(`/campaigns/${id}/resend`);
    return data;
  },
};

// Templates
export const templatesApi = {
  list: async () => {
    const { data } = await api.get<ApiResponse<MessageTemplate[]>>('/templates');
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<ApiResponse<MessageTemplate>>(`/templates/${id}`);
    return data;
  },

  create: async (template: Partial<MessageTemplate>) => {
    const { data } = await api.post<ApiResponse<MessageTemplate>>('/templates', template);
    return data;
  },

  update: async (id: string, template: Partial<MessageTemplate>) => {
    const { data } = await api.put<ApiResponse<MessageTemplate>>(`/templates/${id}`, template);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<void>>(`/templates/${id}`);
    return data;
  },

  submit: async (id: string) => {
    const { data } = await api.post<ApiResponse<void>>(`/templates/${id}/submit`);
    return data;
  },

  sync: async () => {
    const { data } = await api.post<ApiResponse<void>>('/templates/sync');
    return data;
  },

  getExamples: async () => {
    const { data } = await api.get<ApiResponse<Array<Partial<MessageTemplate>>>>('/templates/examples/list');
    return data;
  },
};

// Conversations (Chat)
export const conversationsApi = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const { data } = await api.get<ApiResponse<Conversation[]>>('/conversations', { params });
    return data;
  },

  getMessages: async (leadId: string, params?: { page?: number; limit?: number }) => {
    const { data } = await api.get<ApiResponse<ConversationMessages>>(`/conversations/${leadId}/messages`, { params });
    return data;
  },

  sendText: async (leadId: string, text: string) => {
    const { data } = await api.post<ApiResponse<MessageLogEntry>>(`/conversations/${leadId}/send-text`, { text });
    return data;
  },

  sendTemplate: async (leadId: string, templateId: string, bodyParams: string[] = []) => {
    const { data } = await api.post<ApiResponse<MessageLogEntry>>(`/conversations/${leadId}/send-template`, {
      templateId,
      bodyParams,
    });
    return data;
  },
};

export default api;
