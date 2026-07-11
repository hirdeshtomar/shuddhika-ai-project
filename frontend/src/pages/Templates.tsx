import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, Star, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { messageProfilesApi, type MessageProfile } from '../services/api';

const PARAM_OPTIONS = [
  { value: 'none', label: 'No variables (message has no {{1}})' },
  { value: 'name', label: 'One variable — {{1}} = shop/contact name' },
  { value: 'name,business', label: 'Two — {{1}} name, {{2}} business' },
  { value: 'name,business,city', label: 'Three — {{1}} name, {{2}} business, {{3}} city' },
];

const blank: Partial<MessageProfile> = {
  name: '', aisensyCampaignName: '', templateParams: 'name', mediaUrl: '', mediaFilename: '', isDefault: false,
};

export default function Templates() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['message-profiles'], queryFn: messageProfilesApi.list });
  const profiles = data?.data || [];

  const [editing, setEditing] = useState<Partial<MessageProfile> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (p: Partial<MessageProfile>) =>
      p.id ? messageProfilesApi.update(p.id, p) : messageProfilesApi.create(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-profiles'] });
      setEditing(null);
      toast.success('Template saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: messageProfilesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-profiles'] });
      toast.success('Template deleted');
    },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <FileText className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-gray-500 text-sm">Your AiSensy campaigns, ready to pick when sending</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2" onClick={() => setEditing({ ...blank })}>
          <Plus size={18} /> Add
        </button>
      </div>

      <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-sm text-blue-800">
        AiSensy doesn't let apps list templates automatically, so add each one here once:
        give it a name, paste the exact <strong>AiSensy API campaign name</strong>, choose how many
        <code className="mx-1">{'{{ }}'}</code>variables its message has, and (for video templates) the video link.
      </div>

      {profiles.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No templates yet. Click “Add”.</div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  {p.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Star size={10} /> Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">Campaign: <code>{p.aisensyCampaignName}</code></p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Variables: {p.templateParams === 'none' ? 'none' : p.templateParams}
                  {p.mediaUrl && <span className="inline-flex items-center gap-1 ml-2"><Video size={11} /> video set</span>}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button className="btn btn-secondary text-sm py-1" onClick={() => setEditing(p)}>Edit</button>
                <button
                  className="p-2 text-gray-400 hover:text-red-600"
                  onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editing.id ? 'Edit' : 'Add'} Template</h2>
            <div className="space-y-4">
              <Field label="Name (shown in dropdowns)">
                <input className="input" value={editing.name || ''} placeholder="Mustard Oil Intro (video)"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="AiSensy API campaign name (must match exactly, status Live)">
                <input className="input" value={editing.aisensyCampaignName || ''} placeholder="shuddhika_daily_outreach"
                  onChange={(e) => setEditing({ ...editing, aisensyCampaignName: e.target.value })} />
              </Field>
              <Field label="How many variables does the message have?">
                <select className="input" value={editing.templateParams || 'name'}
                  onChange={(e) => setEditing({ ...editing, templateParams: e.target.value })}>
                  {PARAM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Header video/image link (optional — for media templates)">
                <input className="input" value={editing.mediaUrl || ''} placeholder="https://…supabase.co/…/video.mp4"
                  onChange={(e) => setEditing({ ...editing, mediaUrl: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!editing.isDefault}
                  onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />
                Use as default (preselected when sending &amp; for automation)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saveMutation.isPending || !editing.name || !editing.aisensyCampaignName}
                onClick={() => saveMutation.mutate(editing)}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
