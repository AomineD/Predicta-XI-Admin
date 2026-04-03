'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

interface PredictionConfig {
  model: string;
  periodHours: number;
  batchSize: number;
  automationEnabled: boolean;
  outputMarkets: string[];
  inputDataFields: string[];
  historicalContextEnabled: boolean;
  historicalContextCount: number;
  reasoningEffort: string | null;
  matchSyncEnabled: boolean;
  matchSyncIntervalHours: number;
  resultSyncEnabled: boolean;
  resultSyncHourUtc: number;
  predictionWindowMinutes: number;
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
const PROVIDERS = ['deepseek', 'openai', 'google', 'zhipu', 'moonshot'];

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 font-sans">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted/60 font-sans mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Field({ label, subtitle, children }: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="w-44 flex-none">
        <span className="text-sm text-text-muted font-sans pt-0.5">{label}</span>
        {subtitle && <p className="text-xs text-text-muted/50 font-sans mt-0.5 leading-tight">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-surface-3'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 pb-1 first:pt-0">
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans">{children}</span>
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
    if (cfg && !form) setForm({
      ...cfg,
      matchSyncEnabled: cfg.matchSyncEnabled ?? false,
      matchSyncIntervalHours: cfg.matchSyncIntervalHours ?? 12,
      resultSyncEnabled: cfg.resultSyncEnabled ?? false,
      resultSyncHourUtc: cfg.resultSyncHourUtc ?? 3,
      predictionWindowMinutes: cfg.predictionWindowMinutes ?? 0,
    });
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
    mutationFn: () => api.post('/admin/api-keys', { provider: newProvider, key: newKey }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); setNewProvider(''); setNewKey(''); },
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const changePassword = useMutation({
    mutationFn: () => api.put('/admin/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' });
    },
    onError: (err: Error) => {
      setPasswordMessage({ type: 'error', text: err.message });
    },
  });

  const handleChangePassword = () => {
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    changePassword.mutate();
  };

  // Danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const deleteAllMatches = useMutation({
    mutationFn: () => api.post('/admin/matches/delete-all', {}) as Promise<{ matchesDeleted: number; predictionsDeleted: number }>,
    onSuccess: (data: { matchesDeleted: number; predictionsDeleted: number }) => {
      setShowDeleteConfirm(false);
      setDeleteResult({ type: 'success', text: `Deleted ${data.matchesDeleted} matches and ${data.predictionsDeleted} predictions` });
      qc.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err: Error) => {
      setShowDeleteConfirm(false);
      setDeleteResult({ type: 'error', text: err.message });
    },
  });

  if (!form) return <p className="text-text-muted text-sm">Loading config...</p>;

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

      {/* Model & Reasoning */}
      <SectionCard title="Model & Reasoning" subtitle="LLM model configuration for prediction generation">
        <Field label="Active model" subtitle="LLM model used for generating match predictions">
          <select
            value={form.model}
            onChange={(e) => setField('model', e.target.value)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Reasoning effort" subtitle="Depth of reasoning for supported models (DeepSeek R1, GPT Think)">
          <select
            value={form.reasoningEffort ?? ''}
            onChange={(e) => setField('reasoningEffort', e.target.value || null)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {REASONING_OPTIONS.map((r) => <option key={r} value={r}>{r || '-- default --'}</option>)}
          </select>
        </Field>

        <Field label="Historical context" subtitle="Include past prediction outcomes to improve accuracy">
          <Toggle value={form.historicalContextEnabled} onChange={(v) => setField('historicalContextEnabled', v)} />
        </Field>
      </SectionCard>

      {/* Automations */}
      <SectionCard title="Automations" subtitle="Scheduled tasks for predictions, match syncing, and result syncing">
        <SubHeading>Predictions</SubHeading>

        <Field label="Enabled" subtitle="When off, predictions must be triggered manually">
          <Toggle value={form.automationEnabled} onChange={(v) => setField('automationEnabled', v)} />
        </Field>

        <Field label="Interval (hours)" subtitle="How often the prediction scheduler runs automatically">
          <input
            type="number"
            min={1}
            max={24}
            value={form.periodHours}
            onChange={(e) => setField('periodHours', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Batch size" subtitle="Maximum matches processed per scheduler run">
          <input
            type="number"
            min={1}
            max={100}
            value={form.batchSize}
            onChange={(e) => setField('batchSize', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Prediction window (min)" subtitle="Only predict matches kicking off within this many minutes. 0 = predict up to 72h ahead">
          <input
            type="number"
            min={0}
            max={1440}
            value={form.predictionWindowMinutes}
            onChange={(e) => setField('predictionWindowMinutes', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <SubHeading>Match Sync</SubHeading>

        <Field label="Enabled" subtitle="Automatically sync upcoming matches from API-Football">
          <Toggle value={form.matchSyncEnabled} onChange={(v) => setField('matchSyncEnabled', v)} />
        </Field>

        <Field label="Interval (hours)" subtitle="How often to sync upcoming week matches">
          <select
            value={form.matchSyncIntervalHours}
            onChange={(e) => setField('matchSyncIntervalHours', Number(e.target.value))}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {[6, 12, 24].map((h) => <option key={h} value={h}>{h}h</option>)}
          </select>
        </Field>

        <SubHeading>Result Sync</SubHeading>

        <Field label="Enabled" subtitle="Automatically sync match results daily">
          <Toggle value={form.resultSyncEnabled} onChange={(v) => setField('resultSyncEnabled', v)} />
        </Field>

        <Field label="Hour (UTC)" subtitle="UTC hour at which results are synced each day">
          <select
            value={form.resultSyncHourUtc}
            onChange={(e) => setField('resultSyncHourUtc', Number(e.target.value))}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00 UTC</option>
            ))}
          </select>
        </Field>
      </SectionCard>

      <SectionCard title="Output Markets" subtitle="Betting markets included in each generated prediction">
        <MultiCheckbox options={MARKETS} value={form.outputMarkets} onChange={(v) => setField('outputMarkets', v)} />
      </SectionCard>

      <SectionCard title="Input Data Fields" subtitle="Data sources the model receives to generate predictions">
        <MultiCheckbox options={DATA_FIELDS} value={form.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>

      <SectionCard title="API Keys" subtitle="Encrypted LLM provider keys for prediction generation">
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
            <select
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="h-9 w-36 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
            >
              <option value="">Select provider</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-text-muted font-sans">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-..."
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

      <SectionCard title="Security" subtitle="Change your admin panel password">
        <Field label="Current password" subtitle="Enter your current password to verify identity">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="h-9 w-64 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </Field>

        <Field label="New password" subtitle="Minimum 8 characters">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="h-9 w-64 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </Field>

        <Field label="Confirm password" subtitle="Re-enter the new password">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="h-9 w-64 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </Field>

        {passwordMessage && (
          <p className={`text-xs font-sans mt-2 ${passwordMessage.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {passwordMessage.text}
          </p>
        )}

        <div className="mt-4">
          <Button
            variant="secondary"
            loading={changePassword.isPending}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            Change Password
          </Button>
        </div>
      </SectionCard>

      {/* Danger Zone */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: '#1A1215', border: '1px solid rgba(239,68,68,0.2)' }}>
        <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1 font-sans">Danger Zone</h2>
        <p className="text-xs text-red-400/60 font-sans mb-4">Destructive actions that cannot be undone</p>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-text-primary font-sans">Delete all matches</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">Remove all matches and associated predictions from the database</p>
          </div>
          <Button variant="danger" onClick={() => { setDeleteResult(null); setShowDeleteConfirm(true); }}>
            Delete All Matches
          </Button>
        </div>

        {deleteResult && (
          <p className={`text-xs font-sans mt-2 ${deleteResult.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {deleteResult.text}
          </p>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#121A2B', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary font-sans">Are you sure?</h3>
            </div>
            <p className="text-sm text-text-muted font-sans mb-6">
              This will permanently delete <strong className="text-text-primary">all matches</strong> and their <strong className="text-text-primary">associated predictions</strong> from the database. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleteAllMatches.isPending} onClick={() => deleteAllMatches.mutate()}>
                Yes, Delete All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
