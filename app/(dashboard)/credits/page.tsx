'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { Trash2, Pencil, Plus } from 'lucide-react';

const CREDITS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'combinadas', label: 'Combinadas' },
  { id: 'quiniela', label: 'Quiniela' },
  { id: 'tiers', label: 'Market Tiers' },
] as const;
type CreditsTabId = typeof CREDITS_TABS[number]['id'];
const DEFAULT_CREDITS_TAB: CreditsTabId = 'general';

/* ── types ────────────────────────────────────────────────────────────────── */

interface CreditsConfig {
  predictionCost: number;
  signupBonus: number;
  adRewardCredits: number;
  weeklyActivityBonus: number;
  weeklyActivityMinDays: number;
  combinadaRegularCost: number;
  combinadaPremiumCost: number;
  // User-built combinadas: fixed create cost (free users only; subscribers free)
  // + the flexible always-charged opinion formula.
  userCombinadaCreationCost: number;
  combinadaOpinionBaseCost: number;
  combinadaOpinionPerLegCost: number;
  combinadaOpinionPerExtraMarketCost: number;
  combinadaOpinionMaxCost: number;
  quinielaAccessCost: number;
  quinielaPhase2RegenerateAllowed: boolean;
  // Daily login reward (escalating by daily streak; non-subscribers; UTC reset).
  dailyLoginRewardEnabled: boolean;
  dailyLoginRewardCredits: number;
  dailyLoginRewardMaxCredits: number;
  dailyLoginStreakDays: number;
  // Earn-credits hints (link in gates + "Cómo ganar créditos" hub).
  earnCreditsHintsEnabled: boolean;
  // One-time action rewards.
  actionRewardNotificationsEnabled: boolean;
  actionRewardNotificationsCredits: number;
  actionRewardShareEnabled: boolean;
  actionRewardShareCredits: number;
  actionRewardProfileEnabled: boolean;
  actionRewardProfileCredits: number;
}

// Fields that live on the GET /admin/credits-config row but are EDITED on other
// admin pages, not here. They still come back on the GET (same row), so we strip
// them from this page's PUT to avoid clobbering a value edited elsewhere with a
// stale copy. Homes:
//   · push master switch + weekly promo  → Notifications (Configuración)
//   · force-update + maintenance gate     → Config → Maintenance
//   · referral program + invite modal     → Referrals (Configuración)
//   · PRO upsell + IAP packs              → Monetization (PRO Upsell / IAP & Suscripciones)
//   · social feature flags (friends, combinada shares) → Config → Social
const FIELDS_OWNED_ELSEWHERE = [
  'notificationsEnabled',
  'weeklyQuinielaPromoEnabled',
  'weeklyQuinielaPromoHourUtc',
  'minSupportedBuild',
  'minSupportedVersion',
  'maintenanceMode',
  'maintenanceMessage',
  // Referral program + invite modal (Referrals page → Configuración)
  'referralEnabled',
  'referralCreditsPerReferral',
  'referralWelcomeCredits',
  'referralMilestoneSize',
  'referralMilestoneBonus',
  'referralMaxRewardedReferrals',
  'referralRequireAppCheck',
  'referralQualifyOnFirstPrediction',
  'referralAttributionWindowHours',
  'referralModalEnabled',
  'referralModalFreqLow',
  'referralModalFreqHigh',
  'referralModalLowCreditThreshold',
  'referralModalCooldownDays',
  // PRO upsell + IAP packs (Monetization page)
  'proUpsellModalEnabled',
  'proUpsellFrequency',
  'proUpsellCooldownDays',
  'proOfferActive',
  'proOfferBadgeText',
  'proTrialEnabled',
  'proTrialLabel',
  'iapCredits5',
  'iapCredits10',
  'iapCredits25',
  'iapCredits50',
  // Social feature flags (Config → Social)
  'socialEnabled',
  'combinadaSharesEnabled',
] as const;

function stripForeignFields(cfg: CreditsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cfg };
  for (const k of FIELDS_OWNED_ELSEWHERE) delete out[k];
  return out;
}

interface Tier {
  id: string;
  name: string;
  description: string | null;
  markets: string[];
  creditCost: number;
  subscriberOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TierInput {
  name: string;
  description: string;
  markets: string[];
  creditCost: number;
  subscriberOnly: boolean;
  sortOrder: number;
  isActive: boolean;
}

const MARKETS = ['match_result', 'over_under_2_5', 'over_under_1_5', 'total_goals', 'btts', 'double_chance', 'asian_handicap', 'correct_score', 'first_goal', 'corners', 'handicap', 'cards_over_under', 'penalty', 'red_card'];
const MARKET_LABELS: Record<string, string> = {
  match_result: '1X2',
  over_under_2_5: 'O/U 2.5',
  over_under_1_5: 'O/U 1.5',
  total_goals: 'Total Goals',
  btts: 'BTTS',
  double_chance: 'DC',
  asian_handicap: 'AH',
  correct_score: 'CS',
  first_goal: '1st Goal',
  corners: 'Corners',
  handicap: 'Handicap',
  cards_over_under: 'Cards O/U',
  penalty: 'Penalty',
  red_card: 'Red Card',
};

const EMPTY_TIER: TierInput = {
  name: '',
  description: '',
  markets: [],
  creditCost: 1,
  subscriberOnly: false,
  sortOrder: 0,
  isActive: true,
};

/* ── sub-components ───────────────────────────────────────────────────────── */

function MultiCheckbox({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
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
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors font-sans ${
            value.includes(opt)
              ? 'bg-primary/15 border-primary text-primary'
              : 'bg-surface-2 border-border text-text-muted hover:border-text-muted'
          }`}
        >
          {MARKET_LABELS[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

/* ── tier modal ───────────────────────────────────────────────────────────── */

function TierModal({
  tier,
  onSave,
  onClose,
  saving,
}: {
  tier: TierInput;
  onSave: (t: TierInput) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TierInput>(tier);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-text-primary font-sans">
          {tier.name ? 'Edit Tier' : 'Create Tier'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted font-sans mb-1 block">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
              placeholder="e.g. Essential"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted font-sans mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans resize-none"
              placeholder="Optional description shown in app"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted font-sans mb-1 block">Markets *</label>
            <MultiCheckbox options={MARKETS} value={form.markets} onChange={(v) => setForm({ ...form, markets: v })} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-text-muted font-sans mb-1 block">Credit Cost</label>
              <NumInput value={form.creditCost} onChange={(v) => setForm({ ...form, creditCost: v })} min={1} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-muted font-sans mb-1 block">Sort Order</label>
              <NumInput value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Toggle value={form.subscriberOnly} onChange={(v) => setForm({ ...form, subscriberOnly: v })} />
            <span className="text-sm text-text-secondary font-sans">Subscriber only</span>
          </div>

          <div className="flex items-center gap-3">
            <Toggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            <span className="text-sm text-text-secondary font-sans">Active</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => onSave(form)}
            disabled={!form.name || form.markets.length === 0}
          >
            Save Tier
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── confirm modal ────────────────────────────────────────────────────────── */

function ConfirmModal({ title, description, onConfirm, onCancel, loading }: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-text-primary font-sans">{title}</h3>
        <p className="text-sm text-text-secondary font-sans">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */

export default function CreditsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted font-sans">Loading...</div>}>
      <CreditsPageInner />
    </Suspense>
  );
}

function CreditsPageInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: CreditsTabId =
    CREDITS_TABS.some((t) => t.id === tabParam) ? (tabParam as CreditsTabId) : DEFAULT_CREDITS_TAB;
  const [tab, setTab] = useState<CreditsTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_CREDITS_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  /* ── credits config query ── */
  const configQ = useQuery({
    queryKey: ['credits-config'],
    queryFn: () => api.get<CreditsConfig>('/admin/credits-config'),
  });

  // `form` holds local edits only; while it is null we render configQ.data
  // directly (see `f` below), so no effect is needed to seed the form.
  const [form, setForm] = useState<CreditsConfig | null>(null);

  const configMut = useMutation({
    mutationFn: (data: CreditsConfig) => api.put('/admin/credits-config', stripForeignFields(data)),
    onSuccess: (_res, variables) => {
      qc.setQueryData(['credits-config'], variables);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['credits-config'] });
    },
  });

  /* ── tiers query ── */
  const tiersQ = useQuery({
    queryKey: ['tiers'],
    queryFn: () => api.get<Tier[]>('/admin/tiers'),
  });

  const createTierMut = useMutation({
    mutationFn: (data: TierInput) => api.post('/admin/tiers', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tiers'] }); setTierModal(null); },
  });

  const updateTierMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TierInput> }) => api.put(`/admin/tiers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tiers'] }); setTierModal(null); },
  });

  const deleteTierMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/tiers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tiers'] }); setDeleteTarget(null); },
  });

  const [tierModal, setTierModal] = useState<{ mode: 'create' | 'edit'; id?: string; initial: TierInput } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  if (configQ.isLoading) {
    return (
      <div className="p-8">
        <PageHeader title="Credits" description="Manage credit system configuration and market tiers" />
        <div className="text-sm text-text-muted font-sans mt-8 text-center">Loading...</div>
      </div>
    );
  }

  const f = form ?? configQ.data;
  if (!f) return null;
  const set = <K extends keyof CreditsConfig>(key: K, val: CreditsConfig[K]) => setForm({ ...f, [key]: val });
  const tiers = tiersQ.data ?? [];
  const dirty = JSON.stringify(f) !== JSON.stringify(configQ.data);

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Credits"
        description="Manage credit system configuration and market tiers"
        action={
          <Button
            variant="primary"
            size="sm"
            loading={configMut.isPending}
            disabled={!dirty}
            onClick={() => configMut.mutate(f)}
          >
            Save Config
          </Button>
        }
      />

      <Tabs value={tab} onChange={(v) => setTab(v as CreditsTabId)} items={CREDITS_TABS as unknown as { id: string; label: string }[]} />

      {/* GENERAL TAB */}
      <div hidden={tab !== 'general'} role="tabpanel" id="tabpanel-general" aria-labelledby="tab-general">
      {/* ── Section A: Prediction Credits ── */}
      <SectionCard title="Prediction Credits" subtitle="Base credit configuration for the app">
        <Field label="Flat prediction cost" subtitle="Credits per prediction when no tiers are configured">
          <NumInput value={f.predictionCost} onChange={(v) => set('predictionCost', v)} min={1} />
        </Field>
        <Field label="Signup bonus" subtitle="Credits given to new users on registration">
          <NumInput value={f.signupBonus} onChange={(v) => set('signupBonus', v)} />
        </Field>
        <Field label="Ad reward" subtitle="Credits earned per rewarded ad view">
          <NumInput value={f.adRewardCredits} onChange={(v) => set('adRewardCredits', v)} />
        </Field>
      </SectionCard>

      {/* ── Section A2: Weekly Activity Bonus ── */}
      <SectionCard title="Weekly Activity Bonus" subtitle="Auto-granted (no manual claim) when the user completes a consecutive-day streak, once every 7 days. Doubles to ×2 after a streak longer than 14 consecutive days — lost when the streak breaks. Set amount to 0 to disable.">
        <Field label="Bonus credits" subtitle="Base credits per cycle. Loyal users (15+ day streak) earn ×2 this amount.">
          <NumInput value={f.weeklyActivityBonus} onChange={(v) => set('weeklyActivityBonus', v)} />
        </Field>
        <Field label="Minimum active days" subtitle="Consecutive days the user must open the app to qualify (1–7)">
          <NumInput value={f.weeklyActivityMinDays} onChange={(v) => set('weeklyActivityMinDays', v)} min={1} />
        </Field>
      </SectionCard>
      </div>

      {/* REWARDS TAB */}
      <div hidden={tab !== 'rewards'} role="tabpanel" id="tabpanel-rewards" aria-labelledby="tab-rewards">
      {/* ── Daily login reward ── */}
      <SectionCard title="Daily Login Reward" subtitle="A small credit once per UTC day just for opening the app — non-subscribers only (server-gated). SEPARATE from the weekly bonus; both coexist. The amount escalates with a daily streak: day d grants min(base + (d-1), max), resetting to day 1 after a missed day. Off by default.">
        <Field label="Enabled" subtitle="Master switch. When off, no daily reward is granted and the welcome-back modal never shows.">
          <Toggle value={f.dailyLoginRewardEnabled} onChange={(v) => set('dailyLoginRewardEnabled', v)} />
        </Field>
        <Field label="Base credits (day 1)" subtitle="Credits granted on the first day of a streak.">
          <NumInput value={f.dailyLoginRewardCredits} onChange={(v) => set('dailyLoginRewardCredits', v)} min={0} max={50} />
        </Field>
        <Field label="Max credits (streak cap)" subtitle="Ceiling the escalating amount tops out at on long streaks.">
          <NumInput value={f.dailyLoginRewardMaxCredits} onChange={(v) => set('dailyLoginRewardMaxCredits', v)} min={0} max={50} />
        </Field>
        <Field label="Streak length (days)" subtitle="How many days the streak counter climbs before holding at the cap.">
          <NumInput value={f.dailyLoginStreakDays} onChange={(v) => set('dailyLoginStreakDays', v)} min={1} max={60} />
        </Field>
      </SectionCard>

      {/* ── Earn-credits hints ── */}
      <SectionCard title="Earn-credits Hints" subtitle='Shows a "more ways to earn free credits" link at the friction points (insufficient-credits gate + credits sheet) that opens the "Cómo ganar créditos" hub listing every active way to earn. On by default (purely informational).'>
        <Field label="Enabled" subtitle="When on, the app surfaces the earn-credits link + hub.">
          <Toggle value={f.earnCreditsHintsEnabled} onChange={(v) => set('earnCreditsHintsEnabled', v)} />
        </Field>
      </SectionCard>

      {/* ── One-time action rewards ── */}
      <SectionCard title="Action Rewards (one-time)" subtitle="Credits granted ONCE per action (enforced server-side). Eligibility is verified on claim: notifications need a registered push token; profile needs at least one favourite team or league; share has no precondition. Each off by default.">
        <Field label="Enable notifications — enabled" subtitle="Reward for turning on push notifications.">
          <Toggle value={f.actionRewardNotificationsEnabled} onChange={(v) => set('actionRewardNotificationsEnabled', v)} />
        </Field>
        <Field label="Enable notifications — credits" subtitle="Credits granted once when push is enabled.">
          <NumInput value={f.actionRewardNotificationsCredits} onChange={(v) => set('actionRewardNotificationsCredits', v)} min={0} max={50} />
        </Field>
        <Field label="Share the app — enabled" subtitle="Reward for sharing the app.">
          <Toggle value={f.actionRewardShareEnabled} onChange={(v) => set('actionRewardShareEnabled', v)} />
        </Field>
        <Field label="Share the app — credits" subtitle="Credits granted once for sharing.">
          <NumInput value={f.actionRewardShareCredits} onChange={(v) => set('actionRewardShareCredits', v)} min={0} max={50} />
        </Field>
        <Field label="Complete profile — enabled" subtitle="Reward for setting favourite teams/leagues.">
          <Toggle value={f.actionRewardProfileEnabled} onChange={(v) => set('actionRewardProfileEnabled', v)} />
        </Field>
        <Field label="Complete profile — credits" subtitle="Credits granted once when the profile has a favourite.">
          <NumInput value={f.actionRewardProfileCredits} onChange={(v) => set('actionRewardProfileCredits', v)} min={0} max={50} />
        </Field>
      </SectionCard>
      </div>

      {/* COMBINADAS TAB */}
      <div hidden={tab !== 'combinadas'} role="tabpanel" id="tabpanel-combinadas" aria-labelledby="tab-combinadas">
      {/* ── Section A3: Combinada Costs ── */}
      <SectionCard title="Combinada Costs" subtitle="Credit costs for viewing multi-match parlay predictions">
        <Field label="Regular combinada cost" subtitle="Credits deducted for non-premium combinadas">
          <NumInput value={f.combinadaRegularCost} onChange={(v) => set('combinadaRegularCost', v)} />
        </Field>
        <Field label="Premium combinada cost" subtitle="Credits deducted for premium combinadas (0 = free for subscribers)">
          <NumInput value={f.combinadaPremiumCost} onChange={(v) => set('combinadaPremiumCost', v)} />
        </Field>
      </SectionCard>

      {/* ── User-built combinadas (open model) ── */}
      <SectionCard title="User Combinadas" subtitle="Parlays the user builds themselves from any week match + their own picks.">
        <Field label="Create cost (free users)" subtitle="Credits to save a combinada. Subscribers (any tier) create free + unlimited.">
          <NumInput value={f.userCombinadaCreationCost} onChange={(v) => set('userCombinadaCreationCost', v)} min={0} />
        </Field>
      </SectionCard>

      {/* ── Predicta opinion — flexible, always charged (even subscribers) ── */}
      <SectionCard
        title="Predicta opinion cost"
        subtitle="Each opinion is a real LLM call, so it's ALWAYS charged (even PRO/Club). Cost = min(max, base + perLeg×matches + perExtraMarket×extra markets)."
      >
        <Field label="Base cost" subtitle="Flat credits added to every opinion">
          <NumInput value={f.combinadaOpinionBaseCost} onChange={(v) => set('combinadaOpinionBaseCost', v)} min={0} />
        </Field>
        <Field label="Per match (leg)" subtitle="Credits per distinct match in the combinada">
          <NumInput value={f.combinadaOpinionPerLegCost} onChange={(v) => set('combinadaOpinionPerLegCost', v)} min={0} />
        </Field>
        <Field label="Per extra market" subtitle="Credits for each 2nd+ market stacked on the same match">
          <NumInput value={f.combinadaOpinionPerExtraMarketCost} onChange={(v) => set('combinadaOpinionPerExtraMarketCost', v)} min={0} />
        </Field>
        <Field label="Max cost (cap)" subtitle="Hard ceiling for a single opinion">
          <NumInput value={f.combinadaOpinionMaxCost} onChange={(v) => set('combinadaOpinionMaxCost', v)} min={1} />
        </Field>
      </SectionCard>
      </div>

      {/* QUINIELA TAB */}
      <div hidden={tab !== 'quiniela'} role="tabpanel" id="tabpanel-quiniela" aria-labelledby="tab-quiniela">
      <SectionCard title="Tournament Quiniela" subtitle="Credit cost to unlock the AI-generated tournament quiniela. Premium / unlimited subscribers always access it for free.">
        <Field label="Quiniela access cost" subtitle="Credits deducted the first time a user opens a quiniela (0 = free for everyone)">
          <NumInput value={f.quinielaAccessCost} onChange={(v) => set('quinielaAccessCost', v)} min={0} />
        </Field>
        <Field label="Allow phase 2 regeneration" subtitle="Let users regenerate their picks when the second phase opens, without paying again">
          <Toggle value={f.quinielaPhase2RegenerateAllowed} onChange={(v) => set('quinielaPhase2RegenerateAllowed', v)} />
        </Field>
      </SectionCard>
      </div>

      {/* TIERS TAB */}
      <div hidden={tab !== 'tiers'} role="tabpanel" id="tabpanel-tiers" aria-labelledby="tab-tiers">
      {/* ── Section D: Market Tiers ── */}
      <SectionCard title="Market Tiers" subtitle="Configure prediction access tiers with different markets and costs">
        <div className="flex justify-end mb-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTierModal({ mode: 'create', initial: EMPTY_TIER })}
          >
            <Plus size={14} className="mr-1" /> Add Tier
          </Button>
        </div>

        {tiers.length === 0 && (
          <p className="text-sm text-text-muted font-sans text-center py-6">
            No tiers configured. Flat prediction cost will be used.
          </p>
        )}

        <div className="space-y-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="rounded-xl p-4 flex items-start gap-4"
              style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)', opacity: tier.isActive ? 1 : 0.5 }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-text-primary font-sans">{tier.name}</span>
                  {tier.subscriberOnly && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 font-sans">SUB ONLY</span>
                  )}
                  {!tier.isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-3 text-text-muted font-sans">INACTIVE</span>
                  )}
                </div>
                {tier.description && <p className="text-xs text-text-muted font-sans mb-2">{tier.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {tier.markets.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-3 text-text-secondary font-sans">
                      {MARKET_LABELS[m] ?? m}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-none">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary font-sans">
                  {tier.creditCost} cr
                </span>
                <button
                  type="button"
                  onClick={() => setTierModal({
                    mode: 'edit',
                    id: tier.id,
                    initial: {
                      name: tier.name,
                      description: tier.description ?? '',
                      markets: tier.markets,
                      creditCost: tier.creditCost,
                      subscriberOnly: tier.subscriberOnly,
                      sortOrder: tier.sortOrder,
                      isActive: tier.isActive,
                    },
                  })}
                  className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ id: tier.id, name: tier.name })}
                  className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      </div>

      {/* ── Tier Modal ── */}
      {tierModal && (
        <TierModal
          tier={tierModal.initial}
          saving={createTierMut.isPending || updateTierMut.isPending}
          onClose={() => setTierModal(null)}
          onSave={(data) => {
            if (tierModal.mode === 'create') {
              createTierMut.mutate(data);
            } else {
              updateTierMut.mutate({ id: tierModal.id!, data });
            }
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Tier"
          description={`Are you sure you want to delete "${deleteTarget.name}"? Users who purchased this tier will retain their access.`}
          loading={deleteTierMut.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteTierMut.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}
