import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, TrendingUp, Search } from 'lucide-react';
import { dashboardApi, leadsApi } from '../services/api';

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
  });

  const { data: leadStats } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: leadsApi.getStats,
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
      name: 'Messages Sent (WhatsApp)',
      value: dashboardStats?.messagesSent || 0,
      icon: MessageSquare,
      color: 'bg-primary-500',
      href: '/leads',
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="/scraper"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Search className="text-green-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Find Leads</p>
              <p className="text-sm text-gray-500">Discover new mustard oil buyers</p>
            </div>
          </a>
          <a
            href="/leads"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users className="text-blue-500" size={24} />
            <div>
              <p className="font-medium text-gray-900">Leads &amp; Outreach</p>
              <p className="text-sm text-gray-500">View leads, send WhatsApp via AiSensy</p>
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
