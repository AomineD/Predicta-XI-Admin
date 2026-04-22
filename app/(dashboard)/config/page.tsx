'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';

const CONFIG_TABS = [
  { id: 'general', label: 'General' },
  { id: 'automations', label: 'Automations' },
  { id: 'combinadas', label: 'Combinadas' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'security', label: 'Security' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;
type ConfigTabId = typeof CONFIG_TABS[number]['id'];
const DEFAULT_CONFIG_TAB: ConfigTabId = 'general';

interface PredictionConfig {
  model: string;
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
  resultSyncInitialDelayMinutes: number;
  resultSyncRetryIntervalMinutes: number;
  resultSyncMaxRetryHours: number;
  enrichmentSyncEnabled: boolean;
  enrichmentSyncIntervalMinutes: number;
  enrichmentQueueMinutesBefore: number;
  enrichmentQueueMaxRetries: number;
  enrichmentQueueRetryMinutes: number;
  llmTimeoutSeconds: number;
  predictionWindowMinutes: number;
  featuredLeagueIds: number[];
  combinadasEnabled?: boolean;
  combinadasBasePredictionHourUtc?: number;
  combinadasMaxLegs?: number;
  combinadasMinConfidence?: number;
  combinadasCountRegular?: number;
  combinadasCountPremium?: number;
  combinadasMinConfidenceRegular?: number;
  combinadasMinConfidencePremium?: number;
  combinadasRiskMode?: string;
  combinadasRegularLeagues?: number[];
  combinadasPremiumLeagues?: number[];
  combinadasRegularExcludedTeams?: number[];
  combinadasRegularMaxOdds?: number;
  combinadasPremiumMaxOdds?: number;
  enrichmentMode?: string;
  earlyEnrichmentHourUtc?: number;
}

interface TeamLite {
  id: number;
  name: string;
  logo: string | null;
}

interface ApiKey {
  id: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

const MODELS = ['deepseek-r1', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-think', 'gemini-3.1-pro', 'glm-5', 'kimi-k2.5'];
const MARKETS = ['match_result', 'over_under_2_5', 'over_under_1_5', 'btts', 'double_chance', 'asian_handicap', 'correct_score', 'first_goal', 'corners', 'handicap', 'cards_over_under', 'penalty', 'red_card'];
const DATA_FIELDS = ['fixture_info', 'standings', 'recent_form', 'season_stats', 'h2h', 'injuries', 'odds', 'match_preview', 'squads', 'lineups', 'squad_insights', 'key_player_form', 'deep_stats'];
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

function LeagueMultiSelect({
  leagues,
  value,
  onChange,
  emptyLabel,
}: {
  leagues: Array<{ apiFootballId: number; name: string }>;
  value: number[];
  onChange: (v: number[]) => void;
  emptyLabel: string;
}) {
  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };
  return (
    <div>
      <p className="text-xs text-text-muted/60 font-sans mb-2">
        {value.length === 0 ? emptyLabel : `${value.length} selected`}
      </p>
      <div className="flex flex-wrap gap-2">
        {leagues.map((l) => (
          <button
            key={l.apiFootballId}
            type="button"
            onClick={() => toggle(l.apiFootballId)}
            className={`px-3 py-1 rounded-lg text-xs font-sans font-medium transition-colors ${
              value.includes(l.apiFootballId)
                ? 'bg-primary text-background'
                : 'bg-surface-3 text-text-secondary hover:text-text-primary'
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamBlacklistPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [q, setQ] = useState('');
  const { data: searchResult } = useQuery<{ items: TeamLite[] }>({
    queryKey: ['admin-teams-search', q],
    queryFn: () => api.get(`/admin/teams?search=${encodeURIComponent(q)}&pageSize=20`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
  const { data: selectedTeams } = useQuery<TeamLite[]>({
    queryKey: ['admin-teams-by-ids', value],
    queryFn: async () => {
      if (value.length === 0) return [];
      const all = (await api.get<{ items: TeamLite[] }>(`/admin/teams?pageSize=100`))?.items ?? [];
      const byId = new Map(all.map((t) => [t.id, t]));
      return value.map((id) => byId.get(id)).filter((t): t is TeamLite => !!t);
    },
    enabled: value.length > 0,
  });

  const add = (team: TeamLite) => {
    if (!value.includes(team.id)) onChange([...value, team.id]);
    setQ('');
  };
  const remove = (id: number) => onChange(value.filter((x) => x !== id));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {(selectedTeams ?? []).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-3 text-xs text-text-primary"
          >
            {t.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo} alt="" className="w-4 h-4 rounded-sm" />
            )}
            {t.name}
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-text-muted hover:text-text-primary"
              aria-label={`Remove ${t.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-text-muted/60 font-sans">No teams excluded</span>
        )}
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search team by name..."
        className="h-9 w-full max-w-sm px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
      />
      {q.trim().length >= 2 && (searchResult?.items ?? []).length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface-2">
          {(searchResult?.items ?? [])
            .filter((t) => !value.includes(t.id))
            .slice(0, 10)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-surface-3"
              >
                {t.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo} alt="" className="w-5 h-5 rounded-sm" />
                )}
                <span className="text-text-primary">{t.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ConfigPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: ConfigTabId =
    CONFIG_TABS.some((t) => t.id === tabParam) ? (tabParam as ConfigTabId) : DEFAULT_CONFIG_TAB;
  const [tab, setTab] = useState<ConfigTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_CONFIG_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const { data: cfg } = useQuery<PredictionConfig>({
    queryKey: ['prediction-config'],
    queryFn: () => api.get('/admin/prediction-config'),
  });

  const { data: apiKeys } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/admin/api-keys'),
  });

  const { data: competitions } = useQuery<Array<{ apiFootballId: number; name: string }>>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<PredictionConfig | null>(null);

  const initialForm = useMemo<PredictionConfig | null>(() => {
    if (!cfg) return null;

    return {
      ...cfg,
      matchSyncEnabled: cfg.matchSyncEnabled ?? false,
      matchSyncIntervalHours: cfg.matchSyncIntervalHours ?? 12,
      resultSyncEnabled: cfg.resultSyncEnabled ?? false,
      resultSyncInitialDelayMinutes: cfg.resultSyncInitialDelayMinutes ?? 120,
      resultSyncRetryIntervalMinutes: cfg.resultSyncRetryIntervalMinutes ?? 5,
      resultSyncMaxRetryHours: cfg.resultSyncMaxRetryHours ?? 24,
      enrichmentSyncEnabled: cfg.enrichmentSyncEnabled ?? false,
      enrichmentSyncIntervalMinutes: cfg.enrichmentSyncIntervalMinutes ?? 15,
      llmTimeoutSeconds: cfg.llmTimeoutSeconds ?? 30,
      predictionWindowMinutes: cfg.predictionWindowMinutes ?? 0,
      featuredLeagueIds: cfg.featuredLeagueIds ?? [39, 140, 135],
    };
  }, [cfg]);

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

  // Stats backfill — one-time action
  const [backfillDone, setBackfillDone] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('predicta:stats-backfill-done') === '1';
    return false;
  });
  const [backfillMessage, setBackfillMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const backfillStats = useMutation({
    mutationFn: () => api.post('/admin/results/backfill-stats', {}) as Promise<{ jobId: number }>,
    onSuccess: (data: { jobId: number }) => {
      localStorage.setItem('predicta:stats-backfill-done', '1');
      setBackfillDone(true);
      setBackfillMessage({ type: 'success', text: `Backfill job #${data.jobId} started. Check Jobs page for progress.` });
    },
    onError: (err: Error) => {
      setBackfillMessage({ type: 'error', text: err.message });
    },
  });

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

  const activeForm = form ?? initialForm;

  if (!activeForm) return <p className="text-text-muted text-sm">Loading config...</p>;

  const setField = <K extends keyof PredictionConfig>(key: K, value: PredictionConfig[K]) =>
    setForm((f) => ({ ...(f ?? activeForm), [key]: value }));

  return (
    <div>
      <PageHeader
        title="Config"
        description="Prediction engine settings and API keys"
        action={
          <Button variant="primary" loading={saveConfig.isPending} onClick={() => saveConfig.mutate(activeForm)}>
            Save Config
          </Button>
        }
      />

      <Tabs value={tab} onChange={(v) => setTab(v as ConfigTabId)} items={CONFIG_TABS as unknown as { id: string; label: string }[]} />

      {/* GENERAL TAB */}
      <div hidden={tab !== 'general'} role="tabpanel" id="tabpanel-general" aria-labelledby="tab-general">
      {/* Model & Reasoning */}
      <SectionCard title="Model & Reasoning" subtitle="LLM model configuration for prediction generation">
        <Field label="Active model" subtitle="LLM model used for generating match predictions">
          <select
            value={activeForm.model}
            onChange={(e) => setField('model', e.target.value)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Reasoning effort" subtitle="Depth of reasoning for supported models (DeepSeek R1, GPT Think)">
          <select
            value={activeForm.reasoningEffort ?? ''}
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
            value={activeForm.llmTimeoutSeconds}
            onChange={(e) => setField('llmTimeoutSeconds', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Historical context" subtitle="Include past prediction outcomes to improve accuracy">
          <Toggle value={activeForm.historicalContextEnabled} onChange={(v) => setField('historicalContextEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard title="Output Markets" subtitle="Betting markets included in each generated prediction">
        <MultiCheckbox options={MARKETS} value={activeForm.outputMarkets} onChange={(v) => setField('outputMarkets', v)} />
      </SectionCard>

      <SectionCard title="Input Data Fields" subtitle="Data sources the model receives to generate predictions">
        <MultiCheckbox options={DATA_FIELDS} value={activeForm.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>
      </div>

      {/* AUTOMATIONS TAB */}
      <div hidden={tab !== 'automations'} role="tabpanel" id="tabpanel-automations" aria-labelledby="tab-automations">
      {/* Automations */}
      <SectionCard title="Automations" subtitle="Scheduled tasks for predictions, match syncing, and result syncing">
        <SubHeading>Predictions</SubHeading>

        <Field label="Enabled" subtitle="When off, predictions must be triggered manually">
          <Toggle value={activeForm.automationEnabled} onChange={(v) => setField('automationEnabled', v)} />
        </Field>

        <Field label="Batch size" subtitle="Maximum matches processed per scheduler run">
          <input
            type="number"
            min={1}
            max={100}
            value={activeForm.batchSize}
            onChange={(e) => setField('batchSize', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Prediction window (min)" subtitle="Only predict matches kicking off within this many minutes. 0 = predict up to 72h ahead">
          <input
            type="number"
            min={0}
            max={1440}
            value={activeForm.predictionWindowMinutes}
            onChange={(e) => setField('predictionWindowMinutes', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <SubHeading>Match Sync</SubHeading>

        <Field label="Enabled" subtitle="Automatically sync upcoming matches from API-Football">
          <Toggle value={activeForm.matchSyncEnabled} onChange={(v) => setField('matchSyncEnabled', v)} />
        </Field>

        <Field label="Interval (hours)" subtitle="How often to sync upcoming week matches">
          <select
            value={activeForm.matchSyncIntervalHours}
            onChange={(e) => setField('matchSyncIntervalHours', Number(e.target.value))}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            {[6, 12, 24].map((h) => <option key={h} value={h}>{h}h</option>)}
          </select>
        </Field>

        <SubHeading>Result Queue</SubHeading>

        <Field label="Enabled" subtitle="Create and process result-check jobs for predicted matches">
          <Toggle value={activeForm.resultSyncEnabled} onChange={(v) => setField('resultSyncEnabled', v)} />
        </Field>

        <Field label="Initial delay (minutes)" subtitle="First result check runs this long after kickoff when a prediction creates the queue job">
          <input
            type="number"
            min={30}
            max={600}
            value={activeForm.resultSyncInitialDelayMinutes}
            onChange={(e) => setField('resultSyncInitialDelayMinutes', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Retry interval (minutes)" subtitle="If the match is not finished yet, retry the queue job after this delay">
          <input
            type="number"
            min={1}
            max={30}
            value={activeForm.resultSyncRetryIntervalMinutes}
            onChange={(e) => setField('resultSyncRetryIntervalMinutes', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Max retry window (hours)" subtitle="Stop retrying after this many hours if the match still is not finished">
          <input
            type="number"
            min={1}
            max={72}
            value={activeForm.resultSyncMaxRetryHours}
            onChange={(e) => setField('resultSyncMaxRetryHours', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <SubHeading>Enrichment Queue</SubHeading>

        <Field label="Enabled" subtitle="Enqueue matches for enrichment when approaching kickoff">
          <Toggle value={activeForm.enrichmentSyncEnabled} onChange={(v) => setField('enrichmentSyncEnabled', v)} />
        </Field>

        <Field label="Enrichment mode" subtitle="Early: enrich all today's matches at configured hour. Pre-match: enrich 60 min before kickoff. Both: early + pre-match (V1 + V2 predictions)">
          <select
            value={activeForm.enrichmentMode ?? 'pre_match'}
            onChange={(e) => setField('enrichmentMode', e.target.value)}
            className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            <option value="pre_match">Pre-match only</option>
            <option value="early">Early only</option>
            <option value="both">Both (early + pre-match)</option>
          </select>
        </Field>

        {(activeForm.enrichmentMode === 'early' || activeForm.enrichmentMode === 'both') && (
          <Field label="Early enrichment hour (UTC)" subtitle="When to enrich all today's matches (0-23). Generates V1 predictions without lineups.">
            <input
              type="number"
              min={0}
              max={23}
              value={activeForm.earlyEnrichmentHourUtc ?? 7}
              onChange={(e) => setField('earlyEnrichmentHourUtc', Number(e.target.value))}
              className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
            />
          </Field>
        )}

        <Field label="Minutes before kickoff" subtitle="How early before kickoff to trigger enrichment">
          <input
            type="number"
            min={15}
            max={180}
            value={activeForm.enrichmentQueueMinutesBefore ?? 60}
            onChange={(e) => setField('enrichmentQueueMinutesBefore', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Max retries" subtitle="How many times to retry if enrichment fails">
          <input
            type="number"
            min={1}
            max={10}
            value={activeForm.enrichmentQueueMaxRetries ?? 5}
            onChange={(e) => setField('enrichmentQueueMaxRetries', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>

        <Field label="Retry interval (minutes)" subtitle="Wait time between retry attempts">
          <input
            type="number"
            min={1}
            max={10}
            value={activeForm.enrichmentQueueRetryMinutes ?? 2}
            onChange={(e) => setField('enrichmentQueueRetryMinutes', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
      </SectionCard>
      </div>

      {/* COMBINADAS TAB */}
      <div hidden={tab !== 'combinadas'} role="tabpanel" id="tabpanel-combinadas" aria-labelledby="tab-combinadas">
      <SectionCard title="Combinadas" subtitle="Multi-match parlay predictions generated daily">
        <Field label="Enabled" subtitle="Generate combinadas automatically each morning">
          <Toggle value={activeForm.combinadasEnabled ?? false} onChange={(v) => setField('combinadasEnabled', v)} />
        </Field>
        <Field label="Base prediction hour (UTC)" subtitle="When to run early predictions for all matches (0-23)">
          <input
            type="number"
            min={0}
            max={23}
            value={activeForm.combinadasBasePredictionHourUtc ?? 8}
            onChange={(e) => setField('combinadasBasePredictionHourUtc', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Max legs" subtitle="Maximum matches per combinada (2-5)">
          <input
            type="number"
            min={2}
            max={5}
            value={activeForm.combinadasMaxLegs ?? 5}
            onChange={(e) => setField('combinadasMaxLegs', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Risk mode" subtitle="Precise = conservative picks, Bold = avoids ultra-safe odds (<1.30)">
          <select
            value={activeForm.combinadasRiskMode ?? 'precise'}
            onChange={(e) => setField('combinadasRiskMode', e.target.value)}
            className="h-9 w-32 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            <option value="precise">Precise</option>
            <option value="bold">Bold</option>
          </select>
        </Field>

        <div className="pt-2 pb-1 text-xs font-medium text-text-muted uppercase tracking-wider">Regular combinadas</div>
        <Field label="Count" subtitle="Total regular combinadas to generate (0-10)">
          <input
            type="number"
            min={0}
            max={10}
            value={activeForm.combinadasCountRegular ?? 3}
            onChange={(e) => setField('combinadasCountRegular', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Min confidence (regular)" subtitle="Minimum pick confidence for regular combinadas (1-95)">
          <input
            type="number"
            min={1}
            max={95}
            value={activeForm.combinadasMinConfidenceRegular ?? 55}
            onChange={(e) => setField('combinadasMinConfidenceRegular', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Leagues (regular)" subtitle="Which leagues regular combinadas can cover. Empty = all V1 leagues.">
          <LeagueMultiSelect
            leagues={competitions ?? []}
            value={activeForm.combinadasRegularLeagues ?? []}
            onChange={(v) => setField('combinadasRegularLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (regular)" subtitle="Reject regular combinadas whose product of odds exceeds this (1.5–20)">
          <input
            type="number"
            min={1.5}
            max={20}
            step={0.1}
            value={activeForm.combinadasRegularMaxOdds ?? 6.0}
            onChange={(e) => setField('combinadasRegularMaxOdds', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Excluded teams (regular)" subtitle="Skip any regular combinada involving these teams">
          <TeamBlacklistPicker
            value={activeForm.combinadasRegularExcludedTeams ?? []}
            onChange={(v) => setField('combinadasRegularExcludedTeams', v)}
          />
        </Field>

        <div className="pt-2 pb-1 text-xs font-medium text-text-muted uppercase tracking-wider">Premium combinadas</div>
        <Field label="Count" subtitle="Total premium combinadas to generate (0-10)">
          <input
            type="number"
            min={0}
            max={10}
            value={activeForm.combinadasCountPremium ?? 2}
            onChange={(e) => setField('combinadasCountPremium', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Min confidence (premium)" subtitle="Minimum pick confidence for premium combinadas (1-95)">
          <input
            type="number"
            min={1}
            max={95}
            value={activeForm.combinadasMinConfidencePremium ?? 45}
            onChange={(e) => setField('combinadasMinConfidencePremium', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
        <Field label="Leagues (premium)" subtitle="Which leagues premium combinadas can cover. Empty = all V1 leagues.">
          <LeagueMultiSelect
            leagues={competitions ?? []}
            value={activeForm.combinadasPremiumLeagues ?? []}
            onChange={(v) => setField('combinadasPremiumLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (premium)" subtitle="Reject premium combinadas whose product of odds exceeds this (1.5–20)">
          <input
            type="number"
            min={1.5}
            max={20}
            step={0.1}
            value={activeForm.combinadasPremiumMaxOdds ?? 6.0}
            onChange={(e) => setField('combinadasPremiumMaxOdds', Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </Field>
      </SectionCard>
      </div>

      {/* API KEYS TAB */}
      <div hidden={tab !== 'apiKeys'} role="tabpanel" id="tabpanel-apiKeys" aria-labelledby="tab-apiKeys">
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

      </div>

      {/* SECURITY TAB — moved below; Regenerate modal stays at root */}

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

      <div hidden={tab !== 'security'} role="tabpanel" id="tabpanel-security" aria-labelledby="tab-security">
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
      </div>

      {/* MAINTENANCE TAB */}
      <div hidden={tab !== 'maintenance'} role="tabpanel" id="tabpanel-maintenance" aria-labelledby="tab-maintenance">
      {/* Data Maintenance */}
      <SectionCard title="Data Maintenance" subtitle="One-time actions for data pipeline health">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-text-primary font-sans">Backfill match stats</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5 max-w-md">
              Scrape corners, cards, fouls and penalty data for completed matches from the last 60 days.
              Required for deep stats (new markets). This only needs to run once.
            </p>
          </div>
          <Button
            variant="secondary"
            loading={backfillStats.isPending}
            onClick={() => {
              if (window.confirm('This will scrape match stats for all completed matches from the last 60 days. It may take several minutes. Continue?')) {
                backfillStats.mutate();
              }
            }}
          >
            Run Backfill
          </Button>
        </div>
        {backfillMessage && (
          <p className={`text-xs font-sans mt-1 ${backfillMessage.type === 'success' ? 'text-success' : 'text-danger'}`}>
            {backfillMessage.text}
          </p>
        )}
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
