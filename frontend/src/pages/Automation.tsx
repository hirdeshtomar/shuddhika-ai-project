import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Play, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { automationApi, messageProfilesApi } from '../services/api';

export default function Automation() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['automation'],
    queryFn: automationApi.get,
  });
  const settings = data?.data;

  const { data: profilesData } = useQuery({
    queryKey: ['message-profiles'],
    queryFn: messageProfilesApi.list,
  });
  const profiles = profilesData?.data || [];

  // Local editable form state
  const [form, setForm] = useState({
    enabled: false,
    runHourIST: 10,
    dailyCap: 15,
    minRelevanceScore: 55,
    combosPerDay: 3,
    messageProfileId: '' as string,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled,
        runHourIST: settings.runHourIST,
        dailyCap: settings.dailyCap,
        minRelevanceScore: settings.minRelevanceScore,
        combosPerDay: settings.combosPerDay,
        messageProfileId: settings.messageProfileId || '',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: automationApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      toast.success('Settings saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const runNowMutation = useMutation({
    mutationFn: automationApi.runNow,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
      toast.success(res.message || 'Run triggered');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to run'),
  });

  const { data: runsData } = useQuery({
    queryKey: ['automation-runs'],
    queryFn: automationApi.runs,
  });
  const runs = runsData?.data || [];

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  const hourLabel = (h: number) => {
    const ampm = h < 12 ? 'AM' : 'PM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:00 ${ampm} IST`;
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
          <Zap className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Automation</h1>
          <p className="text-gray-500 text-sm">Auto-find leads and send WhatsApp outreach every day</p>
        </div>
      </div>

      {/* AiSensy status */}
      {settings && !settings.aisensyConfigured && (
        <div className="card p-4 mb-6 flex items-center gap-3 bg-yellow-50 border-yellow-200">
          <AlertTriangle className="text-yellow-600" size={20} />
          <p className="text-sm text-yellow-800">
            AiSensy is not configured. Set AISENSY_API_KEY and AISENSY_CAMPAIGN_NAME in the
            server settings before enabling automation.
          </p>
        </div>
      )}

      {/* On/off + settings */}
      <div className="card p-6 mb-6 space-y-6">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="font-medium text-gray-900">Automation</p>
            <p className="text-sm text-gray-500">When on, it runs by itself every day at the chosen time</p>
          </div>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="w-11 h-6 rounded-full appearance-none bg-gray-300 checked:bg-primary-500 relative transition-colors cursor-pointer before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:bg-white before:rounded-full before:transition-transform checked:before:translate-x-5"
          />
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template to send</label>
          {profiles.length === 0 ? (
            <p className="text-sm text-amber-600">
              No templates yet — add one on the <a href="/templates" className="underline">Templates</a> page.
            </p>
          ) : (
            <select
              value={form.messageProfileId}
              onChange={(e) => setForm({ ...form, messageProfileId: e.target.value })}
              className="input w-full max-w-md"
            >
              <option value="">Default template</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Run each day at</label>
          <select
            value={form.runHourIST}
            onChange={(e) => setForm({ ...form, runHourIST: Number(e.target.value) })}
            className="input w-48"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Leads to contact per day: <span className="font-bold text-primary-600">{form.dailyCap}</span>
          </label>
          <input
            type="range" min={5} max={100} step={5}
            value={form.dailyCap}
            onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">Start low (15–20) while your WhatsApp number builds quality.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum relevance score: <span className="font-bold text-primary-600">{form.minRelevanceScore}</span>
          </label>
          <input
            type="range" min={0} max={95} step={5}
            value={form.minRelevanceScore}
            onChange={(e) => setForm({ ...form, minRelevanceScore: Number(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">Higher = only the strongest mustard-oil prospects get messaged.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City + category searches per day: <span className="font-bold text-primary-600">{form.combosPerDay}</span>
          </label>
          <input
            type="range" min={1} max={8} step={1}
            value={form.combosPerDay}
            onChange={(e) => setForm({ ...form, combosPerDay: Number(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">How many different places to scrape each day (they rotate).</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="btn btn-primary"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            onClick={() => {
              if (confirm('Run the outreach now? This scrapes and sends real WhatsApp messages immediately.')) {
                runNowMutation.mutate();
              }
            }}
            disabled={runNowMutation.isPending || (settings && !settings.aisensyConfigured)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Play size={16} />
            {runNowMutation.isPending ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Last run */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={18} /> Last Run
        </h2>
        {settings?.lastRunAt ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle size={16} className="text-green-500" />
              {new Date(settings.lastRunAt).toLocaleString('en-IN')}
              {settings.lastRunNote && <span className="text-gray-400">· {settings.lastRunNote}</span>}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Leads found" value={settings.lastScraped} />
              <Stat label="Messages sent" value={settings.lastSent} />
              <Stat label="Failed" value={settings.lastFailed} />
            </div>
            {settings.lastRunTargets?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Searched:</p>
                <div className="flex flex-wrap gap-2">
                  {settings.lastRunTargets.map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Has not run yet. Use “Run Now” to test it.</p>
        )}
      </div>

      {/* Run history */}
      <div className="card p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Run History</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No runs yet.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.type === 'AUTOMATED' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {r.type === 'AUTOMATED' ? 'Automated' : 'Manual'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {new Date(r.startedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-green-600 font-medium">{r.sent} sent</span>
                    <span className="text-red-600 font-medium">{r.failed} failed</span>
                    {r.skipped > 0 && <span className="text-gray-500">{r.skipped} skipped</span>}
                    <span className="text-gray-400">of {r.totalLeads}</span>
                  </div>
                </div>
                {r.targets?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.targets.map((t) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}
                {r.errorsSample?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-600 cursor-pointer">Why messages failed ({r.errorsSample.length} shown)</summary>
                    <ul className="mt-1 space-y-1">
                      {r.errorsSample.map((e, i) => (
                        <li key={i} className="text-xs text-gray-600 bg-red-50 rounded px-2 py-1">{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
