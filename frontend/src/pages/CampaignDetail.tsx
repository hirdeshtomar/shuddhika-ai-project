import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Send, CheckCheck, Eye, AlertCircle, Clock, Users, UserX, Play,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignsApi } from '../services/api';
import type { CampaignAnalytics, CampaignLeadStatus, CampaignStatus } from '../types';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-analytics', id],
    queryFn: () => campaignsApi.getAnalytics(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const resendMutation = useMutation({
    mutationFn: () => campaignsApi.resend(id!),
    onSuccess: (data) => {
      toast.success(data.message || 'Sending pending messages...');
      queryClient.invalidateQueries({ queryKey: ['campaign-analytics', id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to resend');
    },
  });

  const analytics = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Campaign not found</p>
        <button onClick={() => navigate('/campaigns')} className="btn btn-primary mt-4">
          Back to Campaigns
        </button>
      </div>
    );
  }

  const { campaign, funnel, leads, timelineChart } = analytics;
  const filteredLeads = leadStatusFilter
    ? leads.filter((l) => l.status === leadStatusFilter)
    : leads;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/campaigns')}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status as CampaignStatus} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {campaign.template?.name && `Template: ${campaign.template.name}`}
            {campaign.createdBy?.name && ` · Created by ${campaign.createdBy.name}`}
            {campaign.startedAt && ` · Started ${new Date(campaign.startedAt).toLocaleDateString()}`}
          </p>
        </div>
        {funnel.pending > 0 && (campaign.status === 'RUNNING' || campaign.status === 'PAUSED') && (
          <button
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Play size={16} />
            {resendMutation.isPending ? 'Sending...' : `Send ${funnel.pending} Pending`}
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Delivery Rate</p>
          <p className="text-2xl font-bold text-green-600">{funnel.deliveryRate}%</p>
          <p className="text-xs text-gray-400">{funnel.delivered} of {funnel.sent} sent</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Read Rate</p>
          <p className="text-2xl font-bold text-blue-600">{funnel.readRate}%</p>
          <p className="text-xs text-gray-400">{funnel.read} of {funnel.delivered} delivered</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className={`text-2xl font-bold ${funnel.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {funnel.failed}
          </p>
          <p className="text-xs text-gray-400">messages failed</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-gray-600">{funnel.pending}</p>
          <p className="text-xs text-gray-400">awaiting send</p>
        </div>
      </div>

      {/* Delivery Funnel */}
      <DeliveryFunnel funnel={funnel} />

      {/* Timeline Chart */}
      {timelineChart.length > 0 && (
        <div className="card p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Timeline</h2>
          <div className="space-y-3">
            {timelineChart.map((bucket) => {
              const maxVal = Math.max(bucket.sent, bucket.delivered, bucket.read, bucket.failed, 1);
              return (
                <div key={bucket.hour} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-gray-500 flex-shrink-0">
                    {new Date(bucket.hour).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                  <div className="flex-1 flex gap-1 h-6">
                    {bucket.sent > 0 && (
                      <div
                        className="bg-blue-400 rounded-sm"
                        style={{ width: `${(bucket.sent / maxVal) * 100}%` }}
                        title={`Sent: ${bucket.sent}`}
                      />
                    )}
                    {bucket.delivered > 0 && (
                      <div
                        className="bg-green-400 rounded-sm"
                        style={{ width: `${(bucket.delivered / maxVal) * 100}%` }}
                        title={`Delivered: ${bucket.delivered}`}
                      />
                    )}
                    {bucket.read > 0 && (
                      <div
                        className="bg-emerald-500 rounded-sm"
                        style={{ width: `${(bucket.read / maxVal) * 100}%` }}
                        title={`Read: ${bucket.read}`}
                      />
                    )}
                    {bucket.failed > 0 && (
                      <div
                        className="bg-red-400 rounded-sm"
                        style={{ width: `${(bucket.failed / maxVal) * 100}%` }}
                        title={`Failed: ${bucket.failed}`}
                      />
                    )}
                  </div>
                  <div className="w-32 flex gap-3 text-xs text-gray-500 flex-shrink-0">
                    <span className="text-blue-600">{bucket.sent}s</span>
                    <span className="text-green-600">{bucket.delivered}d</span>
                    <span className="text-emerald-600">{bucket.read}r</span>
                    {bucket.failed > 0 && <span className="text-red-600">{bucket.failed}f</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded-sm inline-block" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block" /> Delivered</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block" /> Read</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" /> Failed</span>
          </div>
        </div>
      )}

      {/* Per-lead Status Table */}
      <div className="card p-6 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Lead Status ({filteredLeads.length})
          </h2>
          <select
            className="input w-auto text-sm"
            value={leadStatusFilter}
            onChange={(e) => setLeadStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="READ">Read</option>
            <option value="FAILED">Failed</option>
            <option value="OPTED_OUT">Opted Out</option>
          </select>
        </div>

        {filteredLeads.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No leads found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">Name</th>
                  <th className="pb-2 font-medium text-gray-500">Phone</th>
                  <th className="pb-2 font-medium text-gray-500 hidden md:table-cell">Business</th>
                  <th className="pb-2 font-medium text-gray-500 hidden lg:table-cell">City</th>
                  <th className="pb-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-900">{item.lead.name}</td>
                    <td className="py-2 text-gray-600">{item.lead.phone}</td>
                    <td className="py-2 text-gray-600 hidden md:table-cell">{item.lead.businessName || '-'}</td>
                    <td className="py-2 text-gray-600 hidden lg:table-cell">{item.lead.city || '-'}</td>
                    <td className="py-2">
                      <LeadStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryFunnel({ funnel }: { funnel: CampaignAnalytics['funnel'] }) {
  const maxValue = funnel.total || 1;
  const stages = [
    { label: 'Total', value: funnel.total, color: 'bg-gray-400', icon: Users },
    { label: 'Sent', value: funnel.sent, color: 'bg-blue-500', icon: Send },
    { label: 'Delivered', value: funnel.delivered, color: 'bg-green-500', icon: CheckCheck },
    { label: 'Read', value: funnel.read, color: 'bg-emerald-500', icon: Eye },
  ];

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Delivery Funnel</h2>
      <div className="space-y-4">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-4">
            <div className="w-24 text-sm text-gray-600 flex items-center gap-2">
              <stage.icon size={16} />
              {stage.label}
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
              <div
                className={`${stage.color} h-full rounded-full transition-all duration-700`}
                style={{ width: `${Math.max((stage.value / maxValue) * 100, stage.value > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="w-24 text-right">
              <span className="font-semibold">{stage.value}</span>
              <span className="text-xs text-gray-500 ml-1">
                ({((stage.value / maxValue) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
        {funnel.failed > 0 && (
          <div className="flex items-center gap-4">
            <div className="w-24 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle size={16} />
              Failed
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
              <div
                className="bg-red-500 h-full rounded-full"
                style={{ width: `${Math.max((funnel.failed / maxValue) * 100, 2)}%` }}
              />
            </div>
            <div className="w-24 text-right">
              <span className="font-semibold text-red-600">{funnel.failed}</span>
            </div>
          </div>
        )}
        {funnel.optedOut > 0 && (
          <div className="flex items-center gap-4">
            <div className="w-24 text-sm text-orange-600 flex items-center gap-2">
              <UserX size={16} />
              Opted Out
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
              <div
                className="bg-orange-400 h-full rounded-full"
                style={{ width: `${Math.max((funnel.optedOut / maxValue) * 100, 2)}%` }}
              />
            </div>
            <div className="w-24 text-right">
              <span className="font-semibold text-orange-600">{funnel.optedOut}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadStatusBadge({ status }: { status: CampaignLeadStatus }) {
  const config: Record<CampaignLeadStatus, { color: string; icon: typeof Clock }> = {
    PENDING: { color: 'bg-gray-100 text-gray-700', icon: Clock },
    SENT: { color: 'bg-blue-100 text-blue-700', icon: Send },
    DELIVERED: { color: 'bg-green-100 text-green-700', icon: CheckCheck },
    READ: { color: 'bg-emerald-100 text-emerald-700', icon: Eye },
    FAILED: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
    OPTED_OUT: { color: 'bg-orange-100 text-orange-700', icon: UserX },
  };

  const { color, icon: Icon } = config[status] || config.PENDING;

  return (
    <span className={`badge ${color} inline-flex items-center gap-1`}>
      <Icon size={12} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const colors: Record<CampaignStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SCHEDULED: 'bg-blue-100 text-blue-800',
    RUNNING: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return <span className={`badge ${colors[status]}`}>{status}</span>;
}
