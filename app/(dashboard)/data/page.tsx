'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface CompetitionLite { id: number; name: string }
interface TeamLite { id: number; name: string; logo?: string | null }

interface StandingRow {
  groupKey: string | null;
  rank: number;
  teamId: number;
  teamName: string | null;
  logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}
interface TopPerformerRow { metric: string; rank: number; playerName: string; teamName: string | null; value: number }
interface CompetitionOverview { seasonYear: string | null; standings: StandingRow[]; topPerformers: TopPerformerRow[] }

interface SquadPlayer {
  name: string;
  playerSlug: string | null;
  avatarUrl: string | null;
  number: number | null;
  position: string | null;
  nationality: string | null;
  age: number | null;
  goals: number | null;
  assists: number | null;
  injury: { type?: string; returnDate?: string } | null;
}
interface TeamSquad { teamId: number; teamName: string | null; logo: string | null; players: SquadPlayer[] }

function asArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x && typeof x === 'object' && Array.isArray((x as { rows?: unknown }).rows)) return (x as { rows: T[] }).rows;
  return [];
}

const SELECT_STYLE = { background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' } as const;
const TABS = [
  { id: 'competitions', label: 'Campeonatos' },
  { id: 'teams', label: 'Equipos & Jugadores' },
];

export default function DataPage() {
  const [tab, setTab] = useState('competitions');
  return (
    <div>
      <PageHeader title="Datos deportivos" description="Posiciones, goleadores y plantillas (solo lectura)" />
      <Tabs value={tab} onChange={setTab} items={TABS} />
      {tab === 'competitions' ? <CompetitionsTab /> : <TeamsTab />}
    </div>
  );
}

function CompetitionsTab() {
  const [id, setId] = useState<number | null>(null);
  const { data: comps } = useQuery({ queryKey: ['competitions-list'], queryFn: () => api.get('/admin/competitions') });
  const list = asArray<CompetitionLite>(comps);

  const { data, isLoading } = useQuery<CompetitionOverview>({
    queryKey: ['competition-overview', id],
    queryFn: () => api.get(`/admin/competitions/${id}/standings-overview`),
    enabled: id != null,
  });

  const cols: Column<StandingRow>[] = [
    { key: 'rank', header: '#', render: (r) => <span className="text-text-muted">{r.rank}</span> },
    {
      key: 'team',
      header: 'Equipo',
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.logo && <img src={r.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
          <span>{r.teamName ?? '—'}</span>
        </div>
      ),
    },
    { key: 'p', header: 'PJ', render: (r) => <span>{r.played}</span> },
    { key: 'w', header: 'G', render: (r) => <span>{r.won}</span> },
    { key: 'd', header: 'E', render: (r) => <span>{r.drawn}</span> },
    { key: 'l', header: 'P', render: (r) => <span>{r.lost}</span> },
    { key: 'gd', header: 'DG', render: (r) => <span>{r.goalDiff}</span> },
    { key: 'pts', header: 'Pts', render: (r) => <span className="font-semibold text-text-primary">{r.points}</span> },
  ];

  const byMetric = new Map<string, TopPerformerRow[]>();
  for (const p of data?.topPerformers ?? []) {
    const arr = byMetric.get(p.metric) ?? [];
    arr.push(p);
    byMetric.set(p.metric, arr);
  }

  return (
    <div>
      <select
        aria-label="Competición"
        value={id ?? ''}
        onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}
        className="mb-4 w-full max-w-md rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
        style={SELECT_STYLE}
      >
        <option value="">Selecciona una competición…</option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {id == null ? (
        <p className="text-sm text-text-muted">Elige una competición para ver su tabla y goleadores.</p>
      ) : (
        <>
          {data?.seasonYear && <p className="text-xs text-text-muted mb-3">Temporada {data.seasonYear}</p>}
          <div className="mb-6">
            <DataTable<StandingRow>
              columns={cols}
              data={data?.standings ?? []}
              keyExtractor={(r) => `${r.groupKey ?? ''}-${r.teamId}`}
              loading={isLoading}
              emptyMessage="Sin posiciones (torneo sin sortear o sin sincronizar)"
            />
          </div>
          {byMetric.size > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...byMetric.entries()].map(([metric, rows]) => (
                <div key={metric} className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{metric}</h3>
                  <ul className="space-y-1.5">
                    {rows.map((p) => (
                      <li key={`${metric}-${p.rank}-${p.playerName}`} className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">
                          {p.rank}. {p.playerName} <span className="text-text-muted">{p.teamName ?? ''}</span>
                        </span>
                        <span className="font-mono text-text-primary">{p.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeamsTab() {
  const [id, setId] = useState<number | null>(null);
  const { data: teams } = useQuery({ queryKey: ['teams-list'], queryFn: () => api.get('/admin/teams') });
  const list = asArray<TeamLite>(teams);

  const { data, isLoading } = useQuery<TeamSquad>({
    queryKey: ['team-squad', id],
    queryFn: () => api.get(`/admin/teams/${id}/squad`),
    enabled: id != null,
  });

  return (
    <div>
      <select
        aria-label="Equipo"
        value={id ?? ''}
        onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}
        className="mb-4 w-full max-w-md rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
        style={SELECT_STYLE}
      >
        <option value="">Selecciona un equipo…</option>
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {id == null ? (
        <p className="text-sm text-text-muted">Elige un equipo para ver su plantilla.</p>
      ) : isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : data && data.players.length === 0 ? (
        <p className="text-sm text-text-muted">Sin plantilla sincronizada para este equipo.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.players ?? []).map((p) => (
            <div
              key={`${p.playerSlug ?? ''}-${p.name}-${p.number ?? ''}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2"
              style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" />
              ) : (
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs text-text-muted" style={{ background: '#1F2A40' }}>
                  {p.name.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  {p.number ? `${p.number}. ` : ''}
                  {p.name}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {p.position ?? '—'}
                  {p.age != null ? ` · ${p.age}a` : ''}
                  {p.goals != null ? ` · ${p.goals}G` : ''}
                  {p.assists != null ? `/${p.assists}A` : ''}
                </p>
              </div>
              {p.injury && <span className="text-xs px-2 py-0.5 rounded-full bg-danger/15 text-danger shrink-0">Lesión</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
