'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

interface PredictionConfig {
  model: string;
  periodMinutes: number;
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
  resultSyncIntervalHours: number;
  llmTimeoutSeconds: number;
  predictionWindowMinutes: number;
  featuredLeagueIds: number[];
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
      resultSyncIntervalHours: cfg.resultSyncIntervalHours ?? 12,
      llmTimeoutSeconds: cfg.llmTimeoutSeconds ?? 30,
      predictionWindowMinutes: cfg.predictionWindowMinutes ?? 0,
      featuredLeagueIds: cfg.featuredLeagueIds ?? [39, 140, 135],
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

  // App API Key
  const { data: appKeyInfo } = useQuery<{ prefix: string; isActive: boolean; createdAt: string } | null>({
    queryKey: ['app-key-info'],
    queryFn: async () => {
      try {
        return await api.get('/admin/app-key/info') as { prefix: string; isActive: boolean; createdAt: string } | null;
      } catch {
        return null;
      }
    },
  });

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const regenerateAppKey = useMutation({
    mutationFn: () => api.post('/admin/app-key/regenerate', {}) as Promise<{ key: string; prefix: string }>,
    onSuccess: (data: { key: string; prefix: string }) => {
      setGeneratedKey(data.key);
      setShowRegenerateConfirm(false);
      setKeyCopied(false);
      qc.invalidateQueries({ queryKey: ['app-key-info'] });
    },
  });

  const copyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
    }
  };

  const dismissKey = () => {
    setGeneratedKey(null);
    setKeyCopied(false);
  };

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

  // Danger zone — delete all matches only
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

  // Danger zone — delete all sports data
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllResult, setDeleteAllResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const deleteAllSportsData = useMutation({
    mutationFn: () => api.post('/admin/sports-data/delete-all', {}) as Promise<{ matchesDeleted: number; predictionsDeleted: number; teamsDeleted: number; competitionsDeleted: number }>,
    onSuccess: (data) => {
      setShowDeleteAllConfirm(false);
      setDeleteAllResult({
        type: 'success',
        text: `Deleted: ${data.matchesDeleted} matches, ${data.predictionsDeleted} predictions, ${data.teamsDeleted} teams, ${data.competitionsDeleted} competitions`,
      });
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: Error) => {
      setShowDeleteAllConfirm(false);
      setDeleteAllResult({ type: 'error', text: err.message });
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

        <Field label="LLM Timeout (seconds)" subtitle="Max wait time per LLM call (increase for reasoning models like DeepSeek R1)">
          <input
            type="number"
            min={15}
            max={300}
            value={form.llmTimeoutSeconds}
            onChange={(e) => setField('llmTimeoutSeconds', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
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

        <Field label="Interval (minutes)" subtitle="How often the prediction scheduler runs automatically">
          <input
            type="number"
            min={1}
            max={1440}
            value={form.periodMinutes}
            onChange={(e) => setField('periodMinutes', Number(e.target.value))}
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

        <Field label="Interval (hours)" subtitle="How often to sync match results">
          <select
            value={form.resultSyncIntervalHours}
            onChange={(e) => setField('resultSyncIntervalHours', Number(e.target.value))}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {[6, 12, 24].map((h) => <option key={h} value={h}>{h}h</option>)}
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

      {/* App API Key */}
      <SectionCard title="App API Key" subtitle="Authentication key for the Flutter app to communicate with the backend API">
        {appKeyInfo ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-text-primary font-sans">
                  Current key: <span className="text-text-muted font-mono">{appKeyInfo.prefix}••••••••</span>
                </p>
                <p className="text-xs text-text-muted/60 font-sans mt-1">
                  Generated on {new Date(appKeyInfo.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-sans px-2 py-0.5 rounded-full ${appKeyInfo.isActive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {appKeyInfo.isActive ? 'Active' : 'Revoked'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted font-sans py-2">No app API key has been generated yet.</p>
        )}

        {/* Generated key display — shown only once */}
        {generatedKey && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p className="text-xs text-green-400 font-sans font-semibold mb-2">
              New key generated — copy it now. It will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-text-primary bg-surface-3 px-3 py-2 rounded-lg break-all select-all">
                {generatedKey}
              </code>
              <Button variant="secondary" size="sm" onClick={copyKey}>
                {keyCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={dismissKey} className="text-xs text-text-muted hover:text-text-primary font-sans">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button
            variant="danger"
            loading={regenerateAppKey.isPending}
            onClick={() => setShowRegenerateConfirm(true)}
          >
            Regenerate Key
          </Button>
          <p className="text-xs text-text-muted/50 font-sans mt-2">
            This will revoke the current key and generate a new one. The Flutter app will need to be updated with the new key.
          </p>
        </div>
      </SectionCard>

      {/* Regenerate confirmation modal */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#121A2B', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary font-sans">Regenerate App API Key?</h3>
            </div>
            <p className="text-sm text-text-muted font-sans mb-6">
              The current key will be <strong className="text-text-primary">permanently revoked</strong>. The Flutter app will stop working until you update it with the new key.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowRegenerateConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={regenerateAppKey.isPending} onClick={() => regenerateAppKey.mutate()}>
                Yes, Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

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

        <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'rgba(239,68,68,0.1)' }}>
          <div>
            <p className="text-sm text-text-primary font-sans">Delete all matches</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">Remove all matches and associated predictions. Teams and leagues are kept.</p>
          </div>
          <Button variant="danger" onClick={() => { setDeleteResult(null); setShowDeleteConfirm(true); }}>
            Delete Matches
          </Button>
        </div>

        {deleteResult && (
          <p className={`text-xs font-sans mt-2 ${deleteResult.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {deleteResult.text}
          </p>
        )}

        <div className="flex items-center justify-between py-3 mt-1">
          <div>
            <p className="text-sm text-text-primary font-sans">Delete all sports data</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">Remove matches, predictions, teams and leagues. Users and credits are NOT affected.</p>
          </div>
          <Button variant="danger" onClick={() => { setDeleteAllResult(null); setShowDeleteAllConfirm(true); }}>
            Delete All Sports Data
          </Button>
        </div>

        {deleteAllResult && (
          <p className={`text-xs font-sans mt-2 ${deleteAllResult.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {deleteAllResult.text}
          </p>
        )}
      </div>

      {/* Delete matches confirmation modal */}
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

      {/* Delete all sports data confirmation modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#121A2B', border: '1px solid rgba(239,68,68,0.5)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary font-sans">Delete ALL sports data?</h3>
                <p className="text-xs text-red-400 font-sans">This cannot be undone</p>
              </div>
            </div>
            <div className="rounded-xl p-3 mb-5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs text-red-300 font-sans font-medium mb-1">Will be deleted:</p>
              <ul className="text-xs text-red-300/80 font-sans space-y-0.5 ml-2">
                <li>• All matches and predictions</li>
                <li>• All teams</li>
                <li>• All leagues / competitions</li>
              </ul>
              <p className="text-xs text-text-muted font-sans mt-2">Users, credits, purchases and API keys are NOT affected.</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDeleteAllConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleteAllSportsData.isPending} onClick={() => deleteAllSportsData.mutate()}>
                Yes, Delete Everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
