import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2, RefreshCw, X, FileText, Check, Clock, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { templatesApi } from '../services/api';
import type { MessageTemplate } from '../types';

export default function Templates() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const syncMutation = useMutation({
    mutationFn: templatesApi.sync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Templates synced from WhatsApp');
    },
    onError: () => toast.error('Sync failed'),
  });

  const submitMutation = useMutation({
    mutationFn: templatesApi.submit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template submitted for approval');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Submission failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const templates = data?.data || [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
          <p className="text-gray-500 mt-1">
            Create and manage WhatsApp message templates
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            className="btn btn-secondary flex items-center gap-2"
            disabled={syncMutation.isPending}
          >
            <RefreshCw size={18} className={syncMutation.isPending ? 'animate-spin' : ''} />
            Sync
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Create Template
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="card p-4 mb-6 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <FileText className="text-blue-600 flex-shrink-0" size={20} />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About WhatsApp Templates</p>
            <p>
              WhatsApp requires all outreach messages to use pre-approved templates.
              Create your template here, then submit it for Meta's approval (24-48 hours).
              Use {"{{1}}"}, {"{{2}}"} etc. as placeholders for dynamic content.
            </p>
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-500">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            No templates yet. Create your first message template.
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <StatusBadge status={template.status} />
                    <span className="badge bg-gray-100 text-gray-600">
                      {template.language === 'hi' ? 'Hindi' : 'English'}
                    </span>
                    <span className="badge bg-gray-100 text-gray-600">
                      {template.category}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 mt-2">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {template.bodyText}
                    </pre>
                    {template.footerText && (
                      <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                        {template.footerText}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(template.status === 'DRAFT' || template.status === 'REJECTED') && (
                    <button
                      onClick={() => submitMutation.mutate(template.id)}
                      className="btn btn-primary text-sm py-1.5"
                      disabled={submitMutation.isPending}
                    >
                      <Send size={16} className="mr-1" />
                      Submit for Approval
                    </button>
                  )}
                  {template.status !== 'APPROVED' && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this template?')) {
                          deleteMutation.mutate(template.id);
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
        <CreateTemplateModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MessageTemplate['status'] }) {
  const config: Record<
    MessageTemplate['status'],
    { color: string; icon: React.ReactNode }
  > = {
    DRAFT: { color: 'bg-gray-100 text-gray-800', icon: null },
    PENDING_APPROVAL: {
      color: 'bg-yellow-100 text-yellow-800',
      icon: <Clock size={12} />,
    },
    APPROVED: {
      color: 'bg-green-100 text-green-800',
      icon: <Check size={12} />,
    },
    REJECTED: {
      color: 'bg-red-100 text-red-800',
      icon: <XCircle size={12} />,
    },
  };

  const { color, icon } = config[status];

  return (
    <span className={`badge ${color} flex items-center gap-1`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    language: 'hi',
    category: 'MARKETING' as const,
    bodyText: '',
    footerText: '',
  });

  const { data: examplesData } = useQuery({
    queryKey: ['template-examples'],
    queryFn: templatesApi.getExamples,
  });

  const createMutation = useMutation({
    mutationFn: templatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template created');
      onClose();
    },
    onError: () => toast.error('Failed to create template'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const loadExample = (example: Partial<MessageTemplate>) => {
    setFormData({
      name: example.name || '',
      language: example.language || 'hi',
      category: (example.category as any) || 'MARKETING',
      bodyText: example.bodyText || '',
      footerText: example.footerText || '',
    });
  };

  const examples = examplesData?.data || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create Message Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Example Templates */}
          {examples.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Load Example
              </label>
              <div className="flex flex-wrap gap-2">
                {examples.map((example, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => loadExample(example)}
                    className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Product Introduction"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language *
              </label>
              <select
                className="input"
                value={formData.language}
                onChange={(e) =>
                  setFormData({ ...formData, language: e.target.value })
                }
              >
                <option value="hi">Hindi</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              className="input"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value as any })
              }
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Body *
            </label>
            <textarea
              className="input font-mono text-sm"
              rows={8}
              placeholder={`नमस्ते {{1}}! 🙏

शुद्धिका प्योर मस्टर्ड ऑयल - 100% शुद्ध सरसों का तेल

✅ कोल्ड प्रेस्ड
✅ कोई मिलावट नहीं

संपर्क करें: {{2}}`}
              value={formData.bodyText}
              onChange={(e) =>
                setFormData({ ...formData, bodyText: e.target.value })
              }
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use {"{{1}}"}, {"{{2}}"}, etc. for dynamic placeholders (name, contact, etc.)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Footer (Optional)
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Shuddhika - Guaranteed Purity"
              value={formData.footerText}
              onChange={(e) =>
                setFormData({ ...formData, footerText: e.target.value })
              }
            />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preview
            </label>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                {formData.bodyText || 'Your message will appear here...'}
              </pre>
              {formData.footerText && (
                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-green-200">
                  {formData.footerText}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
