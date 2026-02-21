import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, X, MessageSquareReply } from 'lucide-react';
import toast from 'react-hot-toast';
import { autoRepliesApi } from '../services/api';
import type { AutoReply } from '../types';

export default function AutoReplies() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReply | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['auto-replies'],
    queryFn: autoRepliesApi.list,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      autoRepliesApi.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-replies'] });
    },
    onError: () => toast.error('Failed to update rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: autoRepliesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-replies'] });
      toast.success('Auto-reply rule deleted');
    },
    onError: () => toast.error('Failed to delete rule'),
  });

  const rules = data?.data || [];

  const triggerTypeLabel: Record<string, string> = {
    KEYWORD: 'Keyword Match',
    BUTTON: 'Button Click',
    ANY: 'Any Message',
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auto-Replies</h1>
          <p className="text-gray-500 mt-1">
            Configure automatic replies for incoming WhatsApp messages
          </p>
        </div>
        <button
          onClick={() => {
            setEditingRule(null);
            setShowModal(true);
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Add Rule
        </button>
      </div>

      {/* Info Card */}
      <div className="card p-4 mb-6 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <MessageSquareReply className="text-blue-600 flex-shrink-0" size={20} />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Auto-Replies Work</p>
            <p>
              When a lead sends a WhatsApp message that matches a rule's trigger, the system
              automatically sends the configured reply. Rules are checked in priority order
              (lower number = checked first). Only the first matching rule fires per message.
            </p>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-500">Loading...</div>
        ) : rules.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            No auto-reply rules yet. Add your first rule to get started.
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className={`card p-4 ${!rule.isActive ? 'opacity-60' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                    <span className="badge bg-purple-100 text-purple-800">
                      {triggerTypeLabel[rule.triggerType] || rule.triggerType}
                    </span>
                    <span className="badge bg-gray-100 text-gray-600">
                      Priority: {rule.priority}
                    </span>
                  </div>

                  {/* Keywords */}
                  {rule.triggerKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {rule.triggerKeywords.map((kw, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reply Preview */}
                  <div className="bg-gray-50 rounded-lg p-3 mt-2">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {rule.replyText.length > 300
                        ? rule.replyText.slice(0, 300) + '...'
                        : rule.replyText}
                    </pre>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Active Toggle */}
                  <button
                    onClick={() =>
                      toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      rule.isActive ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    title={rule.isActive ? 'Active — click to disable' : 'Disabled — click to enable'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        rule.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setShowModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600"
                    title="Edit"
                  >
                    <Pencil size={18} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm('Delete this auto-reply rule?')) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <AutoReplyModal
          rule={editingRule}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

function AutoReplyModal({
  rule,
  onClose,
}: {
  rule: AutoReply | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!rule;

  const [formData, setFormData] = useState({
    name: rule?.name || '',
    triggerType: rule?.triggerType || ('KEYWORD' as 'KEYWORD' | 'BUTTON' | 'ANY'),
    triggerKeywords: rule?.triggerKeywords.join(', ') || '',
    replyText: rule?.replyText || '',
    isActive: rule?.isActive ?? true,
    priority: rule?.priority ?? 0,
  });

  const createMutation = useMutation({
    mutationFn: autoRepliesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-replies'] });
      toast.success('Auto-reply rule created');
      onClose();
    },
    onError: () => toast.error('Failed to create rule'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AutoReply> }) =>
      autoRepliesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-replies'] });
      toast.success('Auto-reply rule updated');
      onClose();
    },
    onError: () => toast.error('Failed to update rule'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = formData.triggerKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const payload = {
      name: formData.name,
      triggerType: formData.triggerType,
      triggerKeywords: keywords,
      replyText: formData.replyText,
      isActive: formData.isActive,
      priority: formData.priority,
    };

    if (isEdit && rule) {
      updateMutation.mutate({ id: rule.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Edit Auto-Reply Rule' : 'Create Auto-Reply Rule'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule Name *
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Price Details Reply"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trigger Type *
              </label>
              <select
                className="input"
                value={formData.triggerType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    triggerType: e.target.value as 'KEYWORD' | 'BUTTON' | 'ANY',
                  })
                }
              >
                <option value="KEYWORD">Keyword Match</option>
                <option value="BUTTON">Button Click</option>
                <option value="ANY">Any Message</option>
              </select>
            </div>
          </div>

          {formData.triggerType !== 'ANY' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trigger Keywords
              </label>
              <input
                type="text"
                className="input"
                placeholder="price, send price, price detail"
                value={formData.triggerKeywords}
                onChange={(e) =>
                  setFormData({ ...formData, triggerKeywords: e.target.value })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated keywords. Message will match if it contains any of these words.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply Text *
            </label>
            <textarea
              className="input font-mono text-sm"
              rows={8}
              placeholder="Enter the auto-reply message..."
              value={formData.replyText}
              onChange={(e) => setFormData({ ...formData, replyText: e.target.value })}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <input
                type="number"
                className="input"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower number = checked first
              </p>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.isActive ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                {formData.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preview
            </label>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                {formData.replyText || 'Your reply message will appear here...'}
              </pre>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
