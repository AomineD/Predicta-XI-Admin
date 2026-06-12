'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MonetizationPage() {
  const { data, isLoading } = useQuery<MonetizationOverview>({
    queryKey: ['monetization-overview'],
    queryFn: () => api.get('/admin/monetization/overview'),
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
      <PageHeader title="Monetización" description="Ingresos estimados, suscripciones y economía de créditos (solo lectura)" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <MetricCard label="Ingreso IAP est." value={data ? fmtUsd(data.iap.estUsd) : '—'} sub={`${data?.iap.purchases ?? 0} compras`} accent />
        <MetricCard label="MRR estimado" value={data ? fmtUsd(data.subscriptions.estMrrUsd) : '—'} sub={`${data?.subscriptions.active ?? 0} suscriptores activos`} />
        <MetricCard label="Compradores" value={data?.iap.distinctBuyers ?? '—'} sub="únicos (IAP)" />
        <MetricCard label="Créditos otorgados" value={data?.iap.creditsGranted ?? '—'} sub="vía IAP" />
        <MetricCard label="Créditos otorgados (total)" value={data?.credits.granted ?? '—'} sub="todas las fuentes" />
        <MetricCard label="Créditos consumidos" value={data?.credits.consumed ?? '—'} sub="total" />
      </div>

      {data && (
        <p className="text-xs text-text-muted mb-6">{data.note}</p>
      )}

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
  );
}
