import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, Trash2, Eye, X, Search, Check, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignsApi, templatesApi, leadsApi } from '../services/api';
import type { CampaignStatus, MessageTemplate, Lead } from '../types';

const SAVED_MEDIA = [
  {
    label: 'Shuddhika Yellow Mustard Oil Video',
    url: 'https://bewnoeqjndeeirjxncrl.supabase.co/storage/v1/object/public/shuddhika-test/%20Shuddhika%20Pure%20Yellow%20Mustard%20Oil.mp4',
    type: 'video' as const,
  },
];

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
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to start campaign'),
  });

  const pauseMutation = useMutation({
    mutationFn: campaignsApi.pause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign paused');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to pause campaign'),
  });

  const deleteMutation = useMutation({
    mutationFn: campaignsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to delete campaign'),
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
                    campaign.status === 'PAUSED' ||
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
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadSearch, setLeadSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [addedWithin, setAddedWithin] = useState<number>(0);
  const [headerMediaUrl, setHeaderMediaUrl] = useState(SAVED_MEDIA[0]?.url || '');
  const [skipDuplicate, setSkipDuplicate] = useState(true);
  const [sendingSpeed, setSendingSpeed] = useState<string>('warmup');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: templates[0]?.id || '',
  });

  const selectedTemplate = templates.find((t) => t.id === formData.templateId);
  const needsMediaUrl = selectedTemplate?.headerType === 'IMAGE' || selectedTemplate?.headerType === 'VIDEO';

  const { data: citiesData } = useQuery({
    queryKey: ['lead-cities'],
    queryFn: leadsApi.getCities,
  });
  const availableCities = (citiesData?.data || []) as string[];

  const createdAfter = addedWithin > 0
    ? new Date(Date.now() - addedWithin * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads-picker', leadSearch, cityFilter, statusFilter, addedWithin],
    queryFn: () => leadsApi.list({
      search: leadSearch || undefined,
      city: cityFilter || undefined,
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
      createdAfter,
      limit: 500,
    }),
  });

  const leads = (leadsData?.data || []) as Lead[];
  const totalMatchingLeads = (leadsData as any)?.pagination?.total ?? leads.length;

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (cityFilter ? 1 : 0) +
    (addedWithin > 0 ? 1 : 0) +
    (leadSearch ? 1 : 0);

  const createMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create campaign'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLeadIds.size === 0) {
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
      skipDuplicateTemplate: skipDuplicate,
      sendingSpeed,
      leadIds: Array.from(selectedLeadIds),
    };
    if (needsMediaUrl && headerMediaUrl.trim()) {
      payload.headerMediaUrl = headerMediaUrl.trim();
    }
    createMutation.mutate(payload);
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedLeadIds(new Set()); // clear selection when filter changes
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const selectAll = () => setSelectedLeadIds(new Set(leads.map((l) => l.id)));
  const deselectAll = () => setSelectedLeadIds(new Set());

  const statusColors: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-500',
    CONTACTED: 'bg-yellow-100 text-yellow-700',
    INTERESTED: 'bg-green-100 text-green-700',
    NEGOTIATING: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Create Campaign</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* ── Left column: Campaign settings ── */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Diwali Promotion 2024"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="input"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Template *</label>
                <select
                  className="input"
                  value={formData.templateId}
                  onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                  required
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.language === 'hi' ? 'Hindi' : 'English'})
                    </option>
                  ))}
                </select>
              </div>

              {needsMediaUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {selectedTemplate?.headerType === 'VIDEO' ? 'Video' : 'Image'} URL *
                  </label>
                  <select
                    className="input mb-2"
                    value={SAVED_MEDIA.some((m) => m.url === headerMediaUrl) ? headerMediaUrl : '__custom__'}
                    onChange={(e) => setHeaderMediaUrl(e.target.value === '__custom__' ? '' : e.target.value)}
                  >
                    {SAVED_MEDIA.filter(
                      (m) => m.type === (selectedTemplate?.headerType === 'VIDEO' ? 'video' : 'image')
                    ).map((m) => (
                      <option key={m.url} value={m.url}>{m.label}</option>
                    ))}
                    <option value="__custom__">Custom URL...</option>
                  </select>
                  {!SAVED_MEDIA.some((m) => m.url === headerMediaUrl) && (
                    <input
                      type="url"
                      className="input"
                      placeholder={selectedTemplate?.headerType === 'VIDEO' ? 'https://example.com/video.mp4' : 'https://example.com/image.jpg'}
                      value={headerMediaUrl}
                      onChange={(e) => setHeaderMediaUrl(e.target.value)}
                      required
                    />
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedTemplate?.headerType === 'VIDEO' ? 'Public .mp4 URL (max 16MB)' : 'Public JPEG/PNG URL (max 5MB)'}
                  </p>
                </div>
              )}

              <label className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50 cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={skipDuplicate}
                  onChange={(e) => setSkipDuplicate(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Skip leads who already received this template</p>
                  <p className="text-xs text-gray-500 mt-0.5">Avoids sending the same message twice.</p>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sending Speed</label>
                <select className="input" value={sendingSpeed} onChange={(e) => setSendingSpeed(e.target.value)}>
                  <option value="warmup">Warmup — 1 per 30 min, max 10/day</option>
                  <option value="very_slow">Very Slow — 1 per 10 min</option>
                  <option value="slow">Slow — 1 per 5 min</option>
                  <option value="normal">Normal — 1 per 30s</option>
                  <option value="fast">Fast — 1 per 5s (risky)</option>
                </select>
              </div>
            </div>

            {/* ── Right column: Lead picker ── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Select Leads
                  {activeFilterCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                      {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                    </span>
                  )}
                </label>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLeadSearch('');
                      setCityFilter('');
                      setStatusFilter([]);
                      setAddedWithin(0);
                      setSelectedLeadIds(new Set());
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Search + City */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    className="input pl-8 text-sm py-2"
                    placeholder="Search name, phone, business..."
                    value={leadSearch}
                    onChange={(e) => { setLeadSearch(e.target.value); setSelectedLeadIds(new Set()); }}
                  />
                </div>
                <select
                  className="input text-sm py-2 min-w-[110px]"
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); setSelectedLeadIds(new Set()); }}
                >
                  <option value="">All Cities</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap gap-1.5">
                {(['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      statusFilter.includes(s)
                        ? `${statusColors[s]} border-current ring-1 ring-current`
                        : 'bg-gray-100 text-gray-500 border-transparent hover:border-gray-300'
                    }`}
                  >
                    {statusFilter.includes(s) ? '✓ ' : ''}{s}
                  </button>
                ))}
              </div>

              {/* Date presets */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 shrink-0">Added:</span>
                {([{ label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }, { label: 'All time', value: 0 }]).map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setAddedWithin(value); setSelectedLeadIds(new Set()); }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      addedWithin === value
                        ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                        : 'bg-gray-100 text-gray-500 border-transparent hover:border-gray-300'
                    }`}
                  >
                    {addedWithin === value && value > 0 ? '✓ ' : ''}{label}
                  </button>
                ))}
              </div>

              {/* Count + select all */}
              <div className="flex items-center justify-between pt-0.5 border-t">
                <span className="text-xs text-gray-500">
                  {leadsLoading ? 'Loading...' : (
                    selectedLeadIds.size > 0
                      ? <><span className="font-semibold text-primary-700">{selectedLeadIds.size}</span> of {totalMatchingLeads} selected</>
                      : <><span className="font-semibold text-gray-700">{totalMatchingLeads}</span> lead{totalMatchingLeads !== 1 ? 's' : ''} match</>
                  )}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="text-xs text-primary-600 hover:text-primary-800 font-medium">
                    Select all ({leads.length})
                  </button>
                  {selectedLeadIds.size > 0 && (
                    <button type="button" onClick={deselectAll} className="text-xs text-gray-400 hover:text-gray-600">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Lead list */}
              <div className="border rounded-lg flex-1 overflow-y-auto divide-y" style={{ minHeight: 180, maxHeight: 320 }}>
                {leadsLoading ? (
                  <div className="p-4 text-center text-sm text-gray-400">Loading leads...</div>
                ) : leads.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    No leads match these filters
                  </div>
                ) : (
                  leads.map((lead) => {
                    const selected = selectedLeadIds.has(lead.id);
                    return (
                      <label
                        key={lead.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          selected ? 'bg-primary-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          selected ? 'bg-primary-600 border-primary-600' : 'border-gray-300'
                        }`}>
                          {selected && <Check size={10} className="text-white" />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggleLead(lead.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {lead.businessName || lead.name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {lead.phone}{lead.city ? ` · ${lead.city}` : ''}
                          </div>
                        </div>
                        <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full font-medium ${statusColors[lead.status] || 'bg-gray-100 text-gray-500'}`}>
                          {lead.status}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 pb-4 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : `Create Campaign (${selectedLeadIds.size} leads)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


