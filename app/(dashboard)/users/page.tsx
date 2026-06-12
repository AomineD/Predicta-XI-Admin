'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { cn, formatDateTime } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { UserDetailDrawer } from './_components/UserDetailDrawer';

interface UsersKpis {
  totalUsers: number;
  newToday: number;
  new7d: number;
  new30d: number;
  active7d: number;
  active30d: number;
  deleted: number;
  referred: number;
  activeSubscribers: number;
  subscribersByTier: Array<{ tier: string; count: number }>;
  creditBuyers: number;
  newByDay: Array<{ day: string; count: number }>;
}

interface UserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  credits: number;
  createdAt: string | null;
  lastLoginAt: string | null;
  deletedAt: string | null;
  totalPredictions: number;
  successRate: number | null;
}

interface UsersPage {
  total: number;
  page: number;
  pageSize: number;
  rows: UserRow[];
}

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounce the search box and reset to page 1 on a new term.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: kpis } = useQuery<UsersKpis>({
    queryKey: ['users-kpis'],
    queryFn: () => api.get('/admin/users/kpis'),
  });

  const { data, isLoading } = useQuery<UsersPage>({
    queryKey: ['users-list', search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      return api.get(`/admin/users?${params.toString()}`);
    },
  });

  const chartData = (kpis?.newByDay ?? []).map((d) => ({ label: d.day.slice(5), value: d.count }));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'Usuario',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-text-primary font-medium">{r.displayName ?? '—'}</span>
          <span className="text-xs text-text-muted">{r.email ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (r) => (
        <span
          className={cn(
            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide',
            r.plan === 'premium' ? 'bg-success/15 text-success' : 'bg-text-muted/15 text-text-muted',
          )}
        >
          {r.plan}
        </span>
      ),
    },
    { key: 'credits', header: 'Créditos', render: (r) => <span className="font-mono">{r.credits}</span> },
    { key: 'preds', header: 'Predicciones', render: (r) => <span>{r.totalPredictions}</span> },
    {
      key: 'created',
      header: 'Registro',
      render: (r) => <span className="text-text-secondary">{r.createdAt ? formatDateTime(r.createdAt) : '—'}</span>,
    },
    {
      key: 'lastLogin',
      header: 'Último login',
      render: (r) => <span className="text-text-secondary">{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button type="button" onClick={() => setSelectedId(r.id)} className="text-xs text-primary hover:underline">
          Ver
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Usuarios" description="KPIs, búsqueda y detalle por usuario (solo lectura)" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total" value={kpis?.totalUsers ?? '—'} accent />
        <MetricCard label="Nuevos hoy" value={kpis?.newToday ?? '—'} sub={`${kpis?.new7d ?? 0} en 7d · ${kpis?.new30d ?? 0} en 30d`} />
        <MetricCard label="Activos 7d" value={kpis?.active7d ?? '—'} sub={`${kpis?.active30d ?? 0} en 30d`} />
        <MetricCard
          label="Suscriptores"
          value={kpis?.activeSubscribers ?? '—'}
          sub={kpis && kpis.subscribersByTier.length > 0 ? kpis.subscribersByTier.map((t) => `${t.count} ${t.tier}`).join(' · ') : 'sin suscriptores aún'}
        />
        <MetricCard label="Compradores créditos" value={kpis?.creditBuyers ?? '—'} sub="vía IAP" />
        <MetricCard label="Referidos" value={kpis?.referred ?? '—'} sub="atribuidos" />
        <MetricCard label="Borrados" value={kpis?.deleted ?? '—'} sub="cuentas eliminadas" />
      </div>

      <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans mb-4">Nuevos usuarios (30d)</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-text-muted">Sin datos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={18}>
              <XAxis dataKey="label" tick={{ fill: '#98A2B3', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#98A2B3', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1F2A40', border: 'none', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#4DA8FF" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por email o nombre…"
          className="w-full max-w-md rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
          style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        />
      </div>

      <DataTable<UserRow>
        columns={columns}
        data={data?.rows ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="Sin usuarios"
      />

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
          <span>{data.total} usuarios</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-surface-2"
            >
              Anterior
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-surface-2"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {selectedId && <UserDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
