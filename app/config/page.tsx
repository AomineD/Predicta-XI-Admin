'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

interface PredictionConfig {
  activeModel: string;
  intervalHours: number;
  batchSize: number;
  automationEnabled: boolean;
  outputMarkets: string[];
  inputDataFields: string[];
  historicalContextEnabled: boolean;
  reasoningEffort: string | null;
}

interface ApiKey {
  id: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

const MODELS = ['deepseek-r1', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-think', 'gemini-3.1-pro', 'glm-5', 'kimi-k2.5'];
const MARKETS = ['match_result', 'over_under_2_5', 'btts', 'double_chance', 'asian_handicap', 'correct_score', 'first_goal'];
const DATA_FIELDS = ['fixture_info', 'standings', 'recent_form', 'season_stats', 'h2h', 'injuries', 'odds', 'top_scorers'];
const REASONING_OPTIONS = ['', 'low', 'medium', 'high'];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 font-sans">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <span className="w-44 text-sm text-text-muted font-sans pt-0.5 flex-none">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function MultiCheckbox({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((x) => x !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-3 py-1 rounded-lg text-xs font-sans font-medium transition-colors ${
            value.includes(opt)
              ? 'bg-primary text-background'
              : 'bg-surface-3 text-text-secondary hover:text-text-primary'
          }`}
        >
          {opt.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}

export default function ConfigPage() {
  const qc = useQueryClient();

  const { data: cfg } = useQuery<PredictionConfig>({
    queryKey: ['prediction-config'],
    queryFn: () => api.get('/admin/prediction-config'),
  });

  const { data: apiKeys } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/admin/api-keys'),
  });

  const [form, setForm] = useState<PredictionConfig | null>(null);

  useEffect(() => {
    if (cfg && !form) setForm(cfg);
  }, [cfg, form]);

  const saveConfig = useMutation({
    mutationFn: (body: PredictionConfig) => api.put('/admin/prediction-config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prediction-config'] }),
  });

  // API Keys
  const [newProvider, setNewProvider] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const addKey = useMutation({
    mutationFn: () => api.post('/admin/api-keys', { provider: newProvider, apiKey: newKey }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); setNewProvider(''); setNewKey(''); },
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  if (!form) return <p className="text-text-muted text-sm">Loading config…</p>;

  const setField = <K extends keyof PredictionConfig>(key: K, value: PredictionConfig[K]) =>
    setForm((f) => f ? { ...f, [key]: value } : f);

  return (
    <div>
      <PageHeader
        title="Config"
        description="Prediction engine settings and API keys"
        action={
          <Button variant="primary" loading={saveConfig.isPending} onClick={() => saveConfig.mutate(form)}>
            Save Config
          </Button>
        }
      />

      <SectionCard title="Model & Automation">
        <Field label="Active model">
          <select
            value={form.activeModel}
            onChange={(e) => setField('activeModel', e.target.value)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Reasoning effort">
          <select
            value={form.reasoningEffort ?? ''}
            onChange={(e) => setField('reasoningEffort', e.target.value || null)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {REASONING_OPTIONS.map((r) => <option key={r} value={r}>{r || '— default —'}</option>)}
          </select>
        </Field>

        <Field label="Interval (hours)">
          <input
            type="number"
            min={1}
            max={24}
            value={form.intervalHours}
            onChange={(e) => setField('intervalHours', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Batch size">
          <input
            type="number"
            min={1}
            max={100}
            value={form.batchSize}
            onChange={(e) => setField('batchSize', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Automation enabled">
          <button
            type="button"
            onClick={() => setField('automationEnabled', !form.automationEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.automationEnabled ? 'bg-primary' : 'bg-surface-3'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                form.automationEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </Field>

        <Field label="Historical context">
          <button
            type="button"
            onClick={() => setField('historicalContextEnabled', !form.historicalContextEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.historicalContextEnabled ? 'bg-primary' : 'bg-surface-3'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                form.historicalContextEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </Field>
      </SectionCard>

      <SectionCard title="Output Markets">
        <MultiCheckbox options={MARKETS} value={form.outputMarkets} onChange={(v) => setField('outputMarkets', v)} />
      </SectionCard>

      <SectionCard title="Input Data Fields">
        <MultiCheckbox options={DATA_FIELDS} value={form.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>

      <SectionCard title="API Keys">
        {/* Existing keys */}
        {(apiKeys ?? []).length > 0 && (
          <div className="divide-y mb-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {(apiKeys ?? []).map((k) => (
              <div key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium text-text-primary font-sans">{k.provider}</span>
                  <span className="ml-3 text-xs text-text-muted font-sans">••••••••••••</span>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteKey.mutate(k.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add key */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted font-sans">Provider</label>
            <input
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              placeholder="e.g. openai"
              className="h-9 w-36 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-text-muted font-sans">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-…"
                className="h-9 flex-1 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-text-muted text-xs hover:text-text-primary px-2"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <Button
            variant="secondary"
            loading={addKey.isPending}
            disabled={!newProvider || !newKey}
            onClick={() => addKey.mutate()}
          >
            Add Key
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
