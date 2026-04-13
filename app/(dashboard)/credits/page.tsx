'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Trash2, Pencil, Plus, Infinity } from 'lucide-react';

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
      <div className="w-52 flex-none">
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

function NumInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-24 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
    />
  );
}

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
  const qc = useQueryClient();

  /* ── credits config query ── */
  const configQ = useQuery({
    queryKey: ['credits-config'],
    queryFn: () => api.get<CreditsConfig>('/admin/credits-config'),
  });

  const [form, setForm] = useState<CreditsConfig | null>(null);
  useEffect(() => {
    if (configQ.data && !form) setForm(configQ.data);
  }, [configQ.data, form]);

  const configMut = useMutation({
    mutationFn: (data: CreditsConfig) => api.put('/admin/credits-config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credits-config'] });
      setForm(null); // reload from server
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
  const set = (key: keyof CreditsConfig, val: number) => setForm({ ...f, [key]: val });
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
      <SectionCard title="Weekly Activity Bonus" subtitle="Reward users for daily engagement — runs every Monday. Set amount to 0 to disable.">
        <Field label="Bonus credits" subtitle="Credits awarded to qualifying users each week">
          <NumInput value={f.weeklyActivityBonus} onChange={(v) => set('weeklyActivityBonus', v)} />
        </Field>
        <Field label="Minimum active days" subtitle="Distinct days per week user must open the app (1–7)">
          <NumInput value={f.weeklyActivityMinDays} onChange={(v) => set('weeklyActivityMinDays', v)} min={1} />
        </Field>
      </SectionCard>

      {/* ── Section A3: Combinada Costs ── */}
      <SectionCard title="Combinada Costs" subtitle="Credit costs for viewing multi-match parlay predictions">
        <Field label="Regular combinada cost" subtitle="Credits deducted for non-premium combinadas">
          <NumInput value={f.combinadaRegularCost} onChange={(v) => set('combinadaRegularCost', v)} />
        </Field>
        <Field label="Premium combinada cost" subtitle="Credits deducted for premium combinadas (0 = free for subscribers)">
          <NumInput value={f.combinadaPremiumCost} onChange={(v) => set('combinadaPremiumCost', v)} />
        </Field>
      </SectionCard>

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
