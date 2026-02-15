import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Upload,
  Trash2,
  Edit,
  Phone,
  Mail,
  MapPin,
  Building,
  X,
  UserX,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsApi } from '../services/api';
import type { Lead, LeadStatus } from '../types';

export default function Leads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', page, search, statusFilter],
    queryFn: () =>
      leadsApi.list({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: leadsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted');
    },
    onError: () => toast.error('Failed to delete lead'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: leadsApi.bulkDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedLeads([]);
      toast.success('Leads deleted');
    },
    onError: () => toast.error('Failed to delete leads'),
  });

  const cleanupMutation = useMutation({
    mutationFn: leadsApi.cleanup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success(data.message || 'Cleanup complete');
    },
    onError: () => toast.error('Failed to clean up leads'),
  });

  const backfillMutation = useMutation({
    mutationFn: leadsApi.backfillContacted,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success(data.message || 'Status updated');
    },
    onError: () => toast.error('Failed to update lead statuses'),
  });

  const leads = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map((l) => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">
            Manage your potential customers
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm('Update all leads with sent messages from NEW to CONTACTED?')) {
                backfillMutation.mutate();
              }
            }}
            disabled={backfillMutation.isPending}
            className="btn btn-secondary flex items-center gap-2"
            title="Fix status for leads already contacted"
          >
            <RefreshCw size={18} className={backfillMutation.isPending ? 'animate-spin' : ''} />
            {backfillMutation.isPending ? 'Updating...' : 'Fix Status'}
          </button>
          <button
            onClick={() => {
              if (confirm('Remove all "Do Not Contact" leads (not on WhatsApp, opted out, etc.)? This cannot be undone.')) {
                cleanupMutation.mutate();
              }
            }}
            disabled={cleanupMutation.isPending}
            className="btn btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
            title="Remove leads not on WhatsApp"
          >
            <UserX size={18} />
            {cleanupMutation.isPending ? 'Cleaning...' : 'Cleanup'}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Upload size={18} />
            Import CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by name, phone, email, or business..."
              className="input pl-10"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input w-full sm:w-48"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="INTERESTED">Interested</option>
            <option value="NEGOTIATING">Negotiating</option>
            <option value="CONVERTED">Converted</option>
            <option value="REJECTED">Rejected</option>
            <option value="DO_NOT_CONTACT">Do Not Contact</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedLeads.length > 0 && (
        <div className="card p-3 mb-4 flex items-center justify-between bg-primary-50 border-primary-200">
          <span className="text-sm text-primary-700">
            {selectedLeads.length} lead(s) selected
          </span>
          <button
            onClick={() => bulkDeleteMutation.mutate(selectedLeads)}
            className="btn btn-danger text-sm py-1"
          >
            <Trash2 size={16} className="mr-1" />
            Delete Selected
          </button>
        </div>
      )}

      {/* Leads Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedLeads.length === leads.length && leads.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.name}</div>
                      {lead.city && (
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin size={12} />
                          {lead.city}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Phone size={14} />
                        {lead.phone}
                      </div>
                      {lead.email && (
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                          <Mail size={14} />
                          {lead.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.businessName && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Building size={14} />
                          {lead.businessName}
                        </div>
                      )}
                      {lead.businessType && (
                        <div className="text-xs text-gray-500 mt-1">
                          {lead.businessType}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {formatSource(lead.source)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingLead(lead)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this lead?')) {
                            deleteMutation.mutate(lead.id);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 ml-2"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {(page - 1) * pagination.limit + 1} to{' '}
              {Math.min(page * pagination.limit, pagination.total)} of{' '}
              {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingLead) && (
        <LeadModal
          lead={editingLead}
          onClose={() => {
            setShowAddModal(false);
            setEditingLead(null);
          }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const colors: Record<LeadStatus, string> = {
    NEW: 'badge-info',
    CONTACTED: 'bg-yellow-100 text-yellow-800',
    INTERESTED: 'badge-success',
    NEGOTIATING: 'bg-purple-100 text-purple-800',
    CONVERTED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'badge-error',
    DO_NOT_CONTACT: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`badge ${colors[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatSource(source: string): string {
  const names: Record<string, string> = {
    MANUAL: 'Manual',
    CSV_IMPORT: 'CSV',
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

function LeadModal({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: lead?.name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    businessName: lead?.businessName || '',
    businessType: lead?.businessType || '',
    city: lead?.city || '',
    state: lead?.state || '',
    status: lead?.status || 'NEW',
    notes: lead?.notes || '',
  });

  const createMutation = useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created');
      onClose();
    },
    onError: () => toast.error('Failed to create lead'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      leadsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated');
      onClose();
    },
    onError: () => toast.error('Failed to update lead'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lead) {
      updateMutation.mutate({ id: lead.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {lead ? 'Edit Lead' : 'Add New Lead'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                className="input"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              className="input"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name
              </label>
              <input
                type="text"
                className="input"
                value={formData.businessName}
                onChange={(e) =>
                  setFormData({ ...formData, businessName: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Type
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Grocery, Restaurant"
                value={formData.businessType}
                onChange={(e) =>
                  setFormData({ ...formData, businessType: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                className="input"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                className="input"
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
              />
            </div>
          </div>
          {lead && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                className="input"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as LeadStatus })
                }
              >
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="INTERESTED">Interested</option>
                <option value="NEGOTIATING">Negotiating</option>
                <option value="CONVERTED">Converted</option>
                <option value="REJECTED">Rejected</option>
                <option value="DO_NOT_CONTACT">Do Not Contact</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              className="input"
              rows={3}
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : lead
                ? 'Update'
                : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: leadsApi.bulkImport,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(data.message || 'Import completed');
      onClose();
    },
    onError: () => toast.error('Import failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      importMutation.mutate(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Import Leads from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file with the following columns:
              <br />
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                name, phone, email, business_name, business_type, city, state, pincode, address, tags
              </code>
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!file || importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
