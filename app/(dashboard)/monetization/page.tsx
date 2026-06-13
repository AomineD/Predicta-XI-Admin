'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { Infinity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const MON_TABS = [
  { id: 'overview', label: 'Resumen' },
  { id: 'proUpsell', label: 'PRO Upsell' },
  { id: 'iap', label: 'IAP & Suscripciones' },
] as const;
type MonTabId = typeof MON_TABS[number]['id'];
const DEFAULT_MON_TAB: MonTabId = 'overview';

/* ── analytics contract ─────────────────────────────────────────────────────── */

interface ByProduct {
  productId: string;
  platform: string;
  count: number;
  creditsAdded: number;
  estUsd: number;
}
interface ByReason {
  reason: string;
  type: string;
  count: number;
  amount: number;
}
interface MonetizationOverview {
  iap: {
    purchases: number;
    distinctBuyers: number;
    creditsGranted: number;
    estUsd: number;
    byProduct: ByProduct[];
    byDay: Array<{ day: string; count: number }>;
  };
  subscriptions: {
    active: number;
    estMrrUsd: number;
    byTierStatus: Array<{ tier: string; status: string; count: number }>;
  };
  credits: { granted: number; consumed: number; byReason: ByReason[] };
  note: string;
}

/* ── config contract (subset of credits-config; edited here, partial PUT) ────── */

interface MonConfig {
  proUpsellModalEnabled: boolean;
  proUpsellFrequency: number;
  proUpsellCooldownDays: number;
  proOfferActive: boolean;
  proOfferBadgeText: string | null;
  proTrialEnabled: boolean;
  proTrialLabel: string | null;
  iapCredits5: number;
  iapCredits10: number;
  iapCredits25: number;
  iapCredits50: number;
}

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function MonetizationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted font-sans">Loading...</div>}>
      <MonetizationInner />
    </Suspense>
  );
}

function MonetizationInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: MonTabId = MON_TABS.some((t) => t.id === tabParam) ? (tabParam as MonTabId) : DEFAULT_MON_TAB;
  const [tab, setTab] = useState<MonTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_MON_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  /* ── analytics (read-only) ── */
  const { data, isLoading } = useQuery<MonetizationOverview>({
    queryKey: ['monetization-overview'],
    queryFn: () => api.get('/admin/monetization/overview'),
  });

  /* ── config (PRO upsell + IAP packs) — partial PUT of credits-config ── */
  const cfgQ = useQuery<MonConfig>({
    queryKey: ['monetization-config'],
    queryFn: () => api.get('/admin/credits-config'),
    enabled: tab !== 'overview',
  });
  const [cfgForm, setCfgForm] = useState<MonConfig | null>(null);
  const cfgInitial = useMemo<MonConfig | null>(
    () =>
      cfgQ.data
        ? {
            proUpsellModalEnabled: cfgQ.data.proUpsellModalEnabled,
            proUpsellFrequency: cfgQ.data.proUpsellFrequency,
            proUpsellCooldownDays: cfgQ.data.proUpsellCooldownDays,
            proOfferActive: cfgQ.data.proOfferActive,
            proOfferBadgeText: cfgQ.data.proOfferBadgeText,
            proTrialEnabled: cfgQ.data.proTrialEnabled,
            proTrialLabel: cfgQ.data.proTrialLabel,
            iapCredits5: cfgQ.data.iapCredits5,
            iapCredits10: cfgQ.data.iapCredits10,
            iapCredits25: cfgQ.data.iapCredits25,
            iapCredits50: cfgQ.data.iapCredits50,
          }
        : null,
    [cfgQ.data],
  );
  const cfg = cfgForm ?? cfgInitial;
  const cfgDirty = !!cfg && !!cfgInitial && JSON.stringify(cfg) !== JSON.stringify(cfgInitial);
  const setCfg = <K extends keyof MonConfig>(key: K, val: MonConfig[K]) =>
    setCfgForm({ ...(cfg as MonConfig), [key]: val });

  const saveCfg = useMutation({
    mutationFn: (body: MonConfig) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setCfgForm(null);
      qc.invalidateQueries({ queryKey: ['monetization-config'] });
      // Keep the Credits page (same credits_config row) coherent after the move.
      qc.invalidateQueries({ queryKey: ['credits-config'] });
    },
  });

  const chartData = (data?.iap.byDay ?? []).map((d) => ({ label: d.day.slice(5), value: d.count }));

  const productCols: Column<ByProduct>[] = [
    { key: 'product', header: 'Producto', render: (r) => <span className="font-mono text-xs">{r.productId}</span> },
    { key: 'platform', header: 'Plataforma', render: (r) => <span className="text-text-secondary">{r.platform}</span> },
    { key: 'count', header: 'Compras', render: (r) => <span>{r.count}</span> },
    { key: 'credits', header: 'Créditos', render: (r) => <span className="font-mono">{r.creditsAdded}</span> },
    { key: 'usd', header: 'USD est.', render: (r) => <span className="font-mono text-success">{fmtUsd(r.estUsd)}</span> },
  ];

  const reasonCols: Column<ByReason>[] = [
    { key: 'reason', header: 'Motivo', render: (r) => <span className="text-text-secondary">{r.reason}</span> },
    {
      key: 'type',
      header: 'Tipo',
      render: (r) => (
        <span className={cn('text-xs font-medium uppercase', r.type === 'add' ? 'text-success' : 'text-danger')}>{r.type}</span>
      ),
    },
    { key: 'count', header: 'Movimientos', render: (r) => <span>{r.count}</span> },
    {
      key: 'amount',
      header: 'Créditos',
      render: (r) => <span className={cn('font-mono', r.amount >= 0 ? 'text-success' : 'text-danger')}>{r.amount}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Monetización"
        description="Ingresos estimados, suscripciones y configuración de venta (PRO upsell e IAP)."
        action={
          tab !== 'overview' ? (
            <Button
              variant="primary"
              size="sm"
              loading={saveCfg.isPending}
              disabled={!cfgDirty}
              onClick={() => cfg && saveCfg.mutate(cfg)}
            >
              Save Config
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onChange={(v) => setTab(v as MonTabId)} items={MON_TABS as unknown as { id: string; label: string }[]} />

      {/* RESUMEN (analítica, solo lectura) */}
      <div hidden={tab !== 'overview'} role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
          <MetricCard label="Ingreso IAP est." value={data ? fmtUsd(data.iap.estUsd) : '—'} sub={`${data?.iap.purchases ?? 0} compras`} accent />
          <MetricCard label="MRR estimado" value={data ? fmtUsd(data.subscriptions.estMrrUsd) : '—'} sub={`${data?.subscriptions.active ?? 0} suscriptores activos`} />
          <MetricCard label="Compradores" value={data?.iap.distinctBuyers ?? '—'} sub="únicos (IAP)" />
          <MetricCard label="Créditos otorgados" value={data?.iap.creditsGranted ?? '—'} sub="vía IAP" />
          <MetricCard label="Créditos otorgados (total)" value={data?.credits.granted ?? '—'} sub="todas las fuentes" />
          <MetricCard label="Créditos consumidos" value={data?.credits.consumed ?? '—'} sub="total" />
        </div>

        {data && <p className="text-xs text-text-muted mb-6">{data.note}</p>}

        <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans mb-4">Compras IAP por día (30d)</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-text-muted">Sin compras aún.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={18}>
                <XAxis dataKey="label" tick={{ fill: '#98A2B3', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#98A2B3', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1F2A40', border: 'none', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#7CFF5B" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mb-2">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans mb-3">IAP por producto</h2>
        </div>
        <div className="mb-6">
          <DataTable<ByProduct>
            columns={productCols}
            data={data?.iap.byProduct ?? []}
            keyExtractor={(r) => `${r.productId}-${r.platform}`}
            loading={isLoading}
            emptyMessage="Sin compras IAP aún"
          />
        </div>

        <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans mb-4">Suscripciones</h2>
          {!data || data.subscriptions.byTierStatus.length === 0 ? (
            <p className="text-sm text-text-muted">Sin suscripciones registradas aún.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.subscriptions.byTierStatus.map((s) => (
                <div
                  key={`${s.tier}-${s.status}`}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-sm text-text-secondary">
                    {s.tier} · {s.status}
                  </span>
                  <span className="font-mono text-text-primary">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-2">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans mb-3">Economía de créditos (por motivo)</h2>
        </div>
        <DataTable<ByReason>
          columns={reasonCols}
          data={data?.credits.byReason ?? []}
          keyExtractor={(r) => `${r.reason}-${r.type}`}
          loading={isLoading}
          emptyMessage="Sin movimientos"
        />
      </div>

      {/* PRO UPSELL */}
      <div hidden={tab !== 'proUpsell'} role="tabpanel" id="tabpanel-proUpsell" aria-labelledby="tab-proUpsell" className="max-w-3xl">
        {!cfg ? (
          <p className="text-sm text-text-muted font-sans py-3">Loading…</p>
        ) : (
          <>
            <SectionCard title="PRO Upsell Modal" subtitle="Non-aggressive modal that invites non-subscribers to PRO/Club. Shown only to users without an active subscription, every N app opens, with a cooldown after dismissal. Subscribers never see it.">
              <Field label="Modal enabled" subtitle="Master switch. When off, the modal never shows.">
                <Toggle value={cfg.proUpsellModalEnabled} onChange={(v) => setCfg('proUpsellModalEnabled', v)} />
              </Field>
              <Field label="Frequency (app opens)" subtitle="Show the modal once every N eligible app opens (minimum 1).">
                <NumInput value={cfg.proUpsellFrequency} onChange={(v) => setCfg('proUpsellFrequency', v)} min={1} max={100} />
              </Field>
              <Field label="Cooldown (days)" subtitle="After it shows or is dismissed, don't show it again for this many days (0 = no cooldown).">
                <NumInput value={cfg.proUpsellCooldownDays} onChange={(v) => setCfg('proUpsellCooldownDays', v)} min={0} max={365} />
              </Field>
            </SectionCard>

            <SectionCard title="Price Offer" subtitle="Surface a Google Play / App Store price promotion. The discount itself is configured in the store; this only controls the in-app badge. The app always shows the real localized store price.">
              <Field label="Offer active" subtitle="Show an offer badge on the modal.">
                <Toggle value={cfg.proOfferActive} onChange={(v) => setCfg('proOfferActive', v)} />
              </Field>
              <Field label="Offer badge text" subtitle='Short label for the badge, e.g. "-40%" or "Summer offer". Leave blank to use a default "Offer" badge.'>
                <input
                  type="text"
                  maxLength={60}
                  value={cfg.proOfferBadgeText ?? ''}
                  onChange={(e) => setCfg('proOfferBadgeText', e.target.value)}
                  placeholder="-40%"
                  className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
                />
              </Field>
            </SectionCard>

            <SectionCard title="Free Trial" subtitle="Message a free-trial offer (e.g. 1 month). The trial is granted by Google Play / App Store on the subscription product — this only controls the in-app messaging.">
              <Field label="Trial enabled" subtitle="Show the trial message on the subscribe CTA.">
                <Toggle value={cfg.proTrialEnabled} onChange={(v) => setCfg('proTrialEnabled', v)} />
              </Field>
              <Field label="Trial label" subtitle='CTA text when the trial is active, e.g. "Try 1 month free".'>
                <input
                  type="text"
                  maxLength={60}
                  value={cfg.proTrialLabel ?? ''}
                  onChange={(e) => setCfg('proTrialLabel', e.target.value)}
                  placeholder="Try 1 month free"
                  className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
                />
              </Field>
            </SectionCard>
          </>
        )}
      </div>

      {/* IAP & SUSCRIPCIONES */}
      <div hidden={tab !== 'iap'} role="tabpanel" id="tabpanel-iap" aria-labelledby="tab-iap" className="max-w-3xl">
        {!cfg ? (
          <p className="text-sm text-text-muted font-sans py-3">Loading…</p>
        ) : (
          <>
            <SectionCard title="IAP Pack Credits" subtitle="Credits granted per in-app purchase pack">
              <Field label="Pack 5">
                <NumInput value={cfg.iapCredits5} onChange={(v) => setCfg('iapCredits5', v)} min={1} />
              </Field>
              <Field label="Pack 10">
                <NumInput value={cfg.iapCredits10} onChange={(v) => setCfg('iapCredits10', v)} min={1} />
              </Field>
              <Field label="Pack 25">
                <NumInput value={cfg.iapCredits25} onChange={(v) => setCfg('iapCredits25', v)} min={1} />
              </Field>
              <Field label="Pack 50">
                <NumInput value={cfg.iapCredits50} onChange={(v) => setCfg('iapCredits50', v)} min={1} />
              </Field>
            </SectionCard>

            <SectionCard title="Subscriptions" subtitle="Subscription plans overview">
              <div className="flex items-center gap-3 py-3">
                <span className="text-sm text-text-primary font-sans flex-1">Monthly Pro</span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary font-sans">
                  <Infinity size={14} /> Unlimited
                </span>
              </div>
              <p className="text-xs text-text-muted/50 font-sans">Monthly subscribers have unlimited prediction access regardless of credits.</p>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
