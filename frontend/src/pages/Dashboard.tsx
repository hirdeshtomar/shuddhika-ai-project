import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, MessageSquare, TrendingUp, Phone, CheckCircle, AlertCircle } from 'lucide-react';
import { dashboardApi, leadsApi } from '../services/api';
import api from '../services/api';

interface WhatsAppAccountInfo {
  configured: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  phoneDisplay: string | null;
  verifiedName: string | null;
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
  });

  const { data: leadStats } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: leadsApi.getStats,
  });

  const { data: waInfo } = useQuery({
    queryKey: ['whatsapp-account-info'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: WhatsAppAccountInfo }>('/whatsapp/account-info');
      return data.data;
    },
  });

  const dashboardStats = stats?.data;
  const leadData = leadStats?.data;

  const statCards = [
    {
      name: 'Total Leads',
      value: dashboardStats?.totalLeads || 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/leads',
    },
    {
      name: 'New Leads',
      value: dashboardStats?.newLeads || 0,
      icon: TrendingUp,
      color: 'bg-green-500',
      href: '/leads',
    },
    {
      name: 'Active Campaigns',
      value: dashboardStats?.activeCampaigns || 0,
      icon: Megaphone,
      color: 'bg-purple-500',
      href: '/campaigns',
    },
    {
      name: 'Messages Sent',
      value: dashboardStats?.messagesSent || 0,
      icon: MessageSquare,
      color: 'bg-primary-500',
      href: '/conversations',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome to Shuddhika Lead Management System
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => {
          const Wrapper = stat.href ? 'a' : 'div';
          return (
            <Wrapper key={stat.name} href={stat.href} className={`card p-6 ${stat.href ? 'hover:ring-2 hover:ring-primary-200 transition-shadow cursor-pointer' : ''}`}>
              <div className="flex items-center gap-4">
                <div
                  className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center`}
                >
                  <stat.icon className="text-white" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>

      {/* WhatsApp Business Account */}
      {waInfo && (
        <div className={`card p-4 mb-8 flex items-center gap-4 ${waInfo.configured ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${waInfo.configured ? 'bg-green-100' : 'bg-yellow-100'}`}>
            <Phone size={20} className={waInfo.configured ? 'text-green-600' : 'text-yellow-600'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900">WhatsApp Business Account</p>
              {waInfo.configured ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={10} /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                  <AlertCircle size={10} /> Not configured
                </span>
              )}
            </div>
            {waInfo.configured ? (
              <p className="text-sm text-gray-600 mt-0.5">
                {waInfo.verifiedName && <span className="font-medium">{waInfo.verifiedName}</span>}
                {waInfo.verifiedName && waInfo.phoneDisplay && ' — '}
                {waInfo.phoneDisplay && <span>{waInfo.phoneDisplay}</span>}
                {waInfo.wabaId && <span className="text-gray-400 ml-2 text-xs">WABA: {waInfo.wabaId}</span>}
              </p>
            ) : (
              <p className="text-sm text-yellow-700 mt-0.5">
                Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to your environment variables
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lead Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Leads by Status
          </h2>
          <div className="space-y-3">
            {leadData?.byStatus &&
              Object.entries(leadData.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${getStatusColor(
                        status
                      )}`}
                    />
                    <span className="text-sm text-gray-600">
                      {formatStatus(status)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Leads by Source
          </h2>
          <div className="space-y-3">
            {leadData?.bySource &&
              Object.entries(leadData.bySource).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {formatSource(source)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <a
            href="/leads"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users className="text-blue-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Add New Lead</p>
              <p className="text-sm text-gray-500">Import or create leads</p>
            </div>
          </a>
          <a
            href="/campaigns"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Megaphone className="text-purple-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Create Campaign</p>
              <p className="text-sm text-gray-500">Start a new outreach</p>
            </div>
          </a>
          <a
            href="/conversations"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <MessageSquare className="text-primary-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Conversations</p>
              <p className="text-sm text-gray-500">Chat with your leads</p>
            </div>
          </a>
          <a
            href="/templates"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <MessageSquare className="text-primary-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Message Templates</p>
              <p className="text-sm text-gray-500">Manage WhatsApp templates</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    NEW: 'bg-blue-500',
    CONTACTED: 'bg-yellow-500',
    INTERESTED: 'bg-green-500',
    NEGOTIATING: 'bg-purple-500',
    CONVERTED: 'bg-emerald-500',
    REJECTED: 'bg-red-500',
    DO_NOT_CONTACT: 'bg-gray-500',
  };
  return colors[status] || 'bg-gray-400';
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSource(source: string): string {
  const names: Record<string, string> = {
    MANUAL: 'Manual Entry',
    CSV_IMPORT: 'CSV Import',
    JUSTDIAL: 'JustDial',
    INDIAMART: 'IndiaMART',
    GOOGLE_MAPS: 'Google Maps',
    FACEBOOK: 'Facebook',
    INSTAGRAM: 'Instagram',
    WEBSITE: 'Website',
    REFERRAL: 'Referral',
  };
  return names[source] || source;
}
