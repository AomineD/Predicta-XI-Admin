'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { Trash2, Pencil, Plus, Infinity } from 'lucide-react';

const CREDITS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'combinadas', label: 'Combinadas' },
  { id: 'quiniela', label: 'Quiniela' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'iap', label: 'IAP Packs' },
  { id: 'proUpsell', label: 'PRO Upsell' },
  { id: 'tiers', label: 'Market Tiers' },
] as const;
type CreditsTabId = typeof CREDITS_TABS[number]['id'];
const DEFAULT_CREDITS_TAB: CreditsTabId = 'general';

/* ── types ────────────────────────────────────────────────────────────────── */

interface CreditsConfig {
  predictionCost: number;
  signupBonus: number;
  adRewardCredits: number;
  iapCredits5: number;
  iapCredits10: number;
  iapCredits25: number;
  iapCredits50: number;
  weeklyActivityBonus: number;
  weeklyActivityMinDays: number;
  combinadaRegularCost: number;
  combinadaPremiumCost: number;
  quinielaAccessCost: number;
  quinielaPhase2RegenerateAllowed: boolean;
  proUpsellModalEnabled: boolean;
  proUpsellFrequency: number;
  proUpsellCooldownDays: number;
  proOfferActive: boolean;
  proOfferBadgeText: string | null;
  proTrialEnabled: boolean;
  proTrialLabel: string | null;
  referralEnabled: boolean;
  referralCreditsPerReferral: number;
  referralMilestoneSize: number;
  referralMilestoneBonus: number;
  referralWelcomeCredits: number;
  referralMaxRewardedReferrals: number;
  referralRequireAppCheck: string;
  referralQualifyOnFirstPrediction: boolean;
  referralAttributionWindowHours: number;
}

const APP_CHECK_MODES = ['disabled', 'monitor', 'enforce'] as const;

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

const MARKETS = ['match_result', 'over_under_2_5', 'over_under_1_5', 'btts', 'double_chance', 'asian_handicap', 'correct_score', 'first_goal', 'corners', 'handicap', 'cards_over_under', 'penalty', 'red_card'];
const MARKET_LABELS: Record<string, string> = {
  match_result: '1X2',
  over_under_2_5: 'O/U 2.5',
  over_under_1_5: 'O/U 1.5',
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
    mutationFn: (data: CreditsConfig) => api.put('/admin/credits-config', data),
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

      {/* REFERRALS TAB */}
      <div hidden={tab !== 'referrals'} role="tabpanel" id="tabpanel-referrals" aria-labelledby="tab-referrals">
      <SectionCard title="Referral Program" subtitle="Reward users with credits for inviting new, real users. A referral 'qualifies' the referrer only when the invited user signs up on a unique device (App Check) and opens their first prediction. Credits are an engagement currency — the anti-abuse gates below are what matter.">
        <Field label="Enabled" subtitle="Master switch. When off, no codes are attributed and no credits are paid.">
          <Toggle value={f.referralEnabled} onChange={(v) => set('referralEnabled', v)} />
        </Field>
        <Field label="Credits per referral" subtitle="Paid to the referrer for each qualified referral.">
          <NumInput value={f.referralCreditsPerReferral} onChange={(v) => set('referralCreditsPerReferral', v)} min={0} max={1000} />
        </Field>
        <Field label="Welcome credits" subtitle="Bonus to the NEW (referred) user on attribution. 0 = single-sided (only the referrer earns).">
          <NumInput value={f.referralWelcomeCredits} onChange={(v) => set('referralWelcomeCredits', v)} min={0} max={1000} />
        </Field>
      </SectionCard>

      <SectionCard title="Milestone Bonus" subtitle="An extra bonus every N qualified referrals (e.g. every 5). Set size or bonus to 0 to disable.">
        <Field label="Milestone size" subtitle="Grant the bonus on every multiple of this many qualified referrals.">
          <NumInput value={f.referralMilestoneSize} onChange={(v) => set('referralMilestoneSize', v)} min={0} max={1000} />
        </Field>
        <Field label="Milestone bonus" subtitle="Extra credits granted to the referrer at each milestone.">
          <NumInput value={f.referralMilestoneBonus} onChange={(v) => set('referralMilestoneBonus', v)} min={0} max={1000} />
        </Field>
      </SectionCard>

      <SectionCard title="Anti-abuse" subtitle="Guardrails that protect ad/IAP revenue from credit farming. Device dedupe and the activation gate always apply; App Check enforcement is staged below.">
        <Field label="App Check enforcement" subtitle="disabled = ignore; monitor = record only (recommended for rollout); enforce = unverified installs never reward the referrer.">
          <div className="flex flex-wrap gap-2">
            {APP_CHECK_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => set('referralRequireAppCheck', mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors font-sans capitalize ${
                  f.referralRequireAppCheck === mode
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-surface-2 border-border text-text-muted hover:border-text-muted'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Qualify on first prediction" subtitle="On = referrer is paid only when the referred user opens their first prediction (recommended). Off = qualifies at signup.">
          <Toggle value={f.referralQualifyOnFirstPrediction} onChange={(v) => set('referralQualifyOnFirstPrediction', v)} />
        </Field>
        <Field label="Lifetime cap" subtitle="Max qualified referrals that earn the referrer credits (0 = unlimited).">
          <NumInput value={f.referralMaxRewardedReferrals} onChange={(v) => set('referralMaxRewardedReferrals', v)} min={0} max={100000} />
        </Field>
        <Field label="Attribution window (hours)" subtitle="A code can only be attributed within this many hours after the referred user signs up.">
          <NumInput value={f.referralAttributionWindowHours} onChange={(v) => set('referralAttributionWindowHours', v)} min={1} max={8760} />
        </Field>
      </SectionCard>
      </div>

      {/* IAP PACKS TAB */}
      <div hidden={tab !== 'iap'} role="tabpanel" id="tabpanel-iap" aria-labelledby="tab-iap">
      {/* ── Section B: IAP Pack Credits ── */}
      <SectionCard title="IAP Pack Credits" subtitle="Credits granted per in-app purchase pack">
        <Field label="Pack 5">
          <NumInput value={f.iapCredits5} onChange={(v) => set('iapCredits5', v)} min={1} />
        </Field>
        <Field label="Pack 10">
          <NumInput value={f.iapCredits10} onChange={(v) => set('iapCredits10', v)} min={1} />
        </Field>
        <Field label="Pack 25">
          <NumInput value={f.iapCredits25} onChange={(v) => set('iapCredits25', v)} min={1} />
        </Field>
        <Field label="Pack 50">
          <NumInput value={f.iapCredits50} onChange={(v) => set('iapCredits50', v)} min={1} />
        </Field>
      </SectionCard>

      {/* ── Section C: Subscriptions ── */}
      <SectionCard title="Subscriptions" subtitle="Subscription plans overview">
        <div className="flex items-center gap-3 py-3">
          <span className="text-sm text-text-primary font-sans flex-1">Monthly Pro</span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary font-sans">
            <Infinity size={14} /> Unlimited
          </span>
        </div>
        <p className="text-xs text-text-muted/50 font-sans">Monthly subscribers have unlimited prediction access regardless of credits.</p>
      </SectionCard>
      </div>

      {/* PRO UPSELL TAB */}
      <div hidden={tab !== 'proUpsell'} role="tabpanel" id="tabpanel-proUpsell" aria-labelledby="tab-proUpsell">
      {/* ── Modal toggle + cadence ── */}
      <SectionCard title="PRO Upsell Modal" subtitle="Non-aggressive modal that invites non-subscribers to PRO/Club. Shown only to users without an active subscription, every N app opens, with a cooldown after dismissal. Subscribers never see it.">
        <Field label="Modal enabled" subtitle="Master switch. When off, the modal never shows.">
          <Toggle value={f.proUpsellModalEnabled} onChange={(v) => set('proUpsellModalEnabled', v)} />
        </Field>
        <Field label="Frequency (app opens)" subtitle="Show the modal once every N eligible app opens (minimum 1).">
          <NumInput value={f.proUpsellFrequency} onChange={(v) => set('proUpsellFrequency', v)} min={1} max={100} />
        </Field>
        <Field label="Cooldown (days)" subtitle="After it shows or is dismissed, don't show it again for this many days (0 = no cooldown).">
          <NumInput value={f.proUpsellCooldownDays} onChange={(v) => set('proUpsellCooldownDays', v)} min={0} max={365} />
        </Field>
      </SectionCard>

      {/* ── Price offer ── */}
      <SectionCard title="Price Offer" subtitle="Surface a Google Play / App Store price promotion. The discount itself is configured in the store; this only controls the in-app badge. The app always shows the real localized store price.">
        <Field label="Offer active" subtitle="Show an offer badge on the modal.">
          <Toggle value={f.proOfferActive} onChange={(v) => set('proOfferActive', v)} />
        </Field>
        <Field label="Offer badge text" subtitle='Short label for the badge, e.g. "-40%" or "Summer offer". Leave blank to use a default "Offer" badge.'>
          <input
            type="text"
            maxLength={60}
            value={f.proOfferBadgeText ?? ''}
            onChange={(e) => set('proOfferBadgeText', e.target.value)}
            placeholder="-40%"
            className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          />
        </Field>
      </SectionCard>

      {/* ── Free trial ── */}
      <SectionCard title="Free Trial" subtitle="Message a free-trial offer (e.g. 1 month). The trial is granted by Google Play / App Store on the subscription product — this only controls the in-app messaging.">
        <Field label="Trial enabled" subtitle="Show the trial message on the subscribe CTA.">
          <Toggle value={f.proTrialEnabled} onChange={(v) => set('proTrialEnabled', v)} />
        </Field>
        <Field label="Trial label" subtitle='CTA text when the trial is active, e.g. "Try 1 month free".'>
          <input
            type="text"
            maxLength={60}
            value={f.proTrialLabel ?? ''}
            onChange={(e) => set('proTrialLabel', e.target.value)}
            placeholder="Try 1 month free"
            className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          />
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
