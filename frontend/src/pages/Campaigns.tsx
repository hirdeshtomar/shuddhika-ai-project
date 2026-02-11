import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, Trash2, Eye, X, Search, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignsApi, templatesApi, leadsApi } from '../services/api';
import type { CampaignStatus, MessageTemplate, Lead } from '../types';

export default function Campaigns() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
  });

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const startMutation = useMutation({
    mutationFn: campaignsApi.start,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(data.message || 'Campaign started');
    },
    onError: () => toast.error('Failed to start campaign'),
  });

  const pauseMutation = useMutation({
    mutationFn: campaignsApi.pause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign paused');
    },
    onError: () => toast.error('Failed to pause campaign'),
  });

  const deleteMutation = useMutation({
    mutationFn: campaignsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
    },
    onError: () => toast.error('Failed to delete campaign'),
  });

  const campaigns = data?.data || [];
  const templates = templatesData?.data || [];
  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED');

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">Manage your outreach campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
          disabled={approvedTemplates.length === 0}
        >
          <Plus size={18} />
          Create Campaign
        </button>
      </div>

      {approvedTemplates.length === 0 && (
        <div className="card p-6 mb-6 bg-yellow-50 border-yellow-200">
          <p className="text-yellow-800">
            You need at least one approved WhatsApp template to create a campaign.{' '}
            <a href="/templates" className="underline">
              Create a template first
            </a>
            .
          </p>
        </div>
      )}

      {/* Campaigns List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-500">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            No campaigns yet. Create your first campaign to start reaching leads.
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">
                      {campaign.name}
                    </h3>
                    <StatusBadge status={campaign.status} />
                  </div>
                  {campaign.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {campaign.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                    <span>Leads: {campaign.totalLeads}</span>
                    <span>Sent: {campaign.sentCount}</span>
                    <span>Delivered: {campaign.deliveredCount}</span>
                    <span>Read: {campaign.readCount}</span>
                    {campaign.failedCount > 0 && (
                      <span className="text-red-600">
                        Failed: {campaign.failedCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="View Details"
                  >
                    <Eye size={18} />
                  </button>
                  {campaign.status === 'DRAFT' && (
                    <button
                      onClick={() => startMutation.mutate(campaign.id)}
                      className="btn btn-primary text-sm py-1.5"
                      disabled={startMutation.isPending}
                    >
                      <Play size={16} className="mr-1" />
                      Start
                    </button>
                  )}
                  {campaign.status === 'RUNNING' && (
                    <button
                      onClick={() => pauseMutation.mutate(campaign.id)}
                      className="btn btn-secondary text-sm py-1.5"
                    >
                      <Pause size={16} className="mr-1" />
                      Pause
                    </button>
                  )}
                  {campaign.status === 'PAUSED' && (
                    <button
                      onClick={() => campaignsApi.resume(campaign.id)}
                      className="btn btn-primary text-sm py-1.5"
                    >
                      <Play size={16} className="mr-1" />
                      Resume
                    </button>
                  )}
                  {(campaign.status === 'DRAFT' ||
                    campaign.status === 'COMPLETED' ||
                    campaign.status === 'CANCELLED') && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this campaign?')) {
                          deleteMutation.mutate(campaign.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          templates={approvedTemplates}
          onClose={() => setShowCreateModal(false)}
        />
      )}

    </div>
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

function CreateCampaignModal({
  templates,
  onClose,
}: {
  templates: MessageTemplate[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetMode, setTargetMode] = useState<'filter' | 'select'>('select');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadSearch, setLeadSearch] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: templates[0]?.id || '',
    targetFilters: {
      status: [] as string[],
      cities: [] as string[],
    },
  });

  // Check if selected template needs a media header
  const selectedTemplate = templates.find((t) => t.id === formData.templateId);
  const needsMediaUrl = selectedTemplate?.headerType === 'IMAGE' || selectedTemplate?.headerType === 'VIDEO';

  // Fetch leads for the picker
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads-picker', leadSearch],
    queryFn: () => leadsApi.list({ search: leadSearch || undefined, limit: 100 }),
    enabled: targetMode === 'select',
  });

  const leads = (leadsData?.data || []) as Lead[];

  const createMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      onClose();
    },
    onError: () => toast.error('Failed to create campaign'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetMode === 'select' && selectedLeadIds.size === 0) {
      toast.error('Select at least one lead');
      return;
    }
    if (needsMediaUrl && !headerMediaUrl.trim()) {
      toast.error(`This template requires a ${selectedTemplate?.headerType?.toLowerCase()} URL`);
      return;
    }
    const payload: any = {
      name: formData.name,
      description: formData.description,
      templateId: formData.templateId,
    };
    if (needsMediaUrl && headerMediaUrl.trim()) {
      payload.headerMediaUrl = headerMediaUrl.trim();
    }
    if (targetMode === 'select') {
      payload.leadIds = Array.from(selectedLeadIds);
    } else {
      payload.targetFilters = formData.targetFilters;
    }
    createMutation.mutate(payload);
  };

  const handleStatusChange = (status: string) => {
    setFormData((prev) => ({
      ...prev,
      targetFilters: {
        ...prev.targetFilters,
        status: prev.targetFilters.status.includes(status)
          ? prev.targetFilters.status.filter((s) => s !== status)
          : [...prev.targetFilters.status, status],
      },
    }));
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedLeadIds(new Set(leads.map((l) => l.id)));
  };

  const deselectAll = () => {
    setSelectedLeadIds(new Set());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Create Campaign</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Name *
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Diwali Promotion 2024"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              className="input"
              rows={2}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Template *
            </label>
            <select
              className="input"
              value={formData.templateId}
              onChange={(e) =>
                setFormData({ ...formData, templateId: e.target.value })
              }
              required
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.language === 'hi' ? 'Hindi' : 'English'})
                </option>
              ))}
            </select>
          </div>

          {/* Header Media URL (for IMAGE/VIDEO templates) */}
          {needsMediaUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {selectedTemplate?.headerType === 'VIDEO' ? 'Video' : 'Image'} URL *
              </label>
              <input
                type="url"
                className="input"
                placeholder={
                  selectedTemplate?.headerType === 'VIDEO'
                    ? 'https://example.com/promo-video.mp4'
                    : 'https://example.com/product-image.jpg'
                }
                value={headerMediaUrl}
                onChange={(e) => setHeaderMediaUrl(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {selectedTemplate?.headerType === 'VIDEO'
                  ? 'Provide a publicly accessible .mp4 video URL (max 16MB)'
                  : 'Provide a publicly accessible image URL (JPEG/PNG, max 5MB)'}
              </p>
            </div>
          )}

          {/* Target Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Leads
            </label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setTargetMode('select')}
                className={`flex-1 px-3 py-2 text-sm font-medium ${
                  targetMode === 'select'
                    ? 'bg-primary-50 text-primary-700 border-r border-primary-200'
                    : 'bg-white text-gray-600 border-r hover:bg-gray-50'
                }`}
              >
                Select Leads
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('filter')}
                className={`flex-1 px-3 py-2 text-sm font-medium ${
                  targetMode === 'filter'
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Filter by Status
              </button>
            </div>
          </div>

          {/* Select Specific Leads */}
          {targetMode === 'select' && (
            <div>
              <div className="relative mb-2">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="Search by name, phone, or business..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-primary-600 hover:text-primary-800"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                {leadsLoading ? (
                  <div className="p-3 text-center text-sm text-gray-500">Loading leads...</div>
                ) : leads.length === 0 ? (
                  <div className="p-3 text-center text-sm text-gray-500">No leads found</div>
                ) : (
                  leads.map((lead) => (
                    <label
                      key={lead.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                        selectedLeadIds.has(lead.id) ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          selectedLeadIds.has(lead.id)
                            ? 'bg-primary-600 border-primary-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {selectedLeadIds.has(lead.id) && (
                          <Check size={14} className="text-white" />
                        )}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {lead.businessName || lead.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {lead.phone}
                          {lead.city ? ` · ${lead.city}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{lead.status}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Filter by Status */}
          {targetMode === 'filter' && (
            <div>
              <div className="flex flex-wrap gap-2">
                {['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING'].map((status) => (
                  <label
                    key={status}
                    className={`px-3 py-1.5 rounded-full text-sm cursor-pointer ${
                      formData.targetFilters.status.includes(status)
                        ? 'bg-primary-100 text-primary-700 border-primary-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    } border`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={formData.targetFilters.status.includes(status)}
                      onChange={() => handleStatusChange(status)}
                    />
                    {status.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to target all eligible leads
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? 'Creating...'
                : targetMode === 'select'
                  ? `Create Campaign (${selectedLeadIds.size} leads)`
                  : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

