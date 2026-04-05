'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';

interface Match {
  id: number;
  homeTeam: { name: string; logo?: string } | null;
  awayTeam: { name: string; logo?: string } | null;
  kickoff: string | null;
  status: string;
  score: { home: number; away: number } | null;
  predicted: boolean;
  enriched: boolean;
  competitionName?: string;
}

interface Competition {
  id: number;
  name: string;
  active: boolean;
}

interface MatchesResponse {
  items: Match[];
  total: number;
  page: number;
  pageSize: number;
}

type ViewMode = 'by_date_competition' | 'by_competition' | 'by_date' | 'all';
type DateRange = 'this_week' | 'today' | 'tomorrow' | 'next_week' | 'last_week' | 'all';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'NS', label: 'Upcoming' },
  { value: 'FT', label: 'Finished' },
];

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next_week', label: 'Next week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'all', label: 'All dates' },
];

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'by_date_competition', label: 'Date & League' },
  { value: 'by_competition', label: 'League' },
  { value: 'by_date', label: 'Date' },
  { value: 'all', label: 'All' },
];

function getDateRange(range: DateRange): { from: string; to: string } | null {
  if (range === 'all') return null;

  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  };
  const endOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
  };
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };

  switch (range) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'tomorrow':
      return { from: startOfDay(addDays(now, 1)).toISOString(), to: endOfDay(addDays(now, 1)).toISOString() };
    case 'this_week': {
      const monday = startOfDay(addDays(now, diffToMonday));
      const sunday = endOfDay(addDays(monday, 6));
      return { from: monday.toISOString(), to: sunday.toISOString() };
    }
    case 'next_week': {
      const nextMonday = startOfDay(addDays(now, diffToMonday + 7));
      const nextSunday = endOfDay(addDays(nextMonday, 6));
      return { from: nextMonday.toISOString(), to: nextSunday.toISOString() };
    }
    case 'last_week': {
      const lastMonday = startOfDay(addDays(now, diffToMonday - 7));
      const lastSunday = endOfDay(addDays(lastMonday, 6));
      return { from: lastMonday.toISOString(), to: lastSunday.toISOString() };
    }
  }
}

function formatGroupDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function getMatchDateKey(kickoff: string | null): string {
  if (!kickoff) return 'Unknown';
  return new Date(kickoff).toISOString().split('T')[0];
}

// ── Chevron Icon ──────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Team Logo ──────────────────────────────────────────────

function TeamLogo({ url, name }: { url?: string; name?: string }) {
  const [error, setError] = useState(false);
  const src = (!error && url) ? url : '/team-placeholder.svg';
  return (
    <img
      src={src}
      alt={name ?? 'Team'}
      className="w-5 h-5 object-contain flex-none"
      onError={() => setError(true)}
    />
  );
}

// ── Enrichment Modal ───────────────────────────────────────

function EnrichmentModal({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['enrichment', matchId],
    queryFn: () => api.get(`/admin/matches/${matchId}/enrichment`),
  });

  const handleCopy = () => {
    if (data) navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary font-sans">Enrichment Data — Match #{matchId}</h3>
          <div className="flex gap-2">
            {!!data && (
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
              >
                Copy
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded-xl bg-surface-3 p-4">
          {isLoading && <p className="text-text-muted text-xs font-sans">Loading enrichment data...</p>}
          {error && <p className="text-danger text-xs font-sans">Failed to load enrichment data</p>}
          {!!data && (
            <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function MatchesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('this_week');
  const [viewMode, setViewMode] = useState<ViewMode>('by_date_competition');
  const [enrichmentMatchId, setEnrichmentMatchId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Reset collapsed state when view mode changes
  useEffect(() => { setCollapsedGroups(new Set()); }, [viewMode]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const { data: competitions } = useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
  });

  const syncMatches = useMutation({
    mutationFn: () => api.post('/admin/matches/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });

  const syncResults = useMutation({
    mutationFn: () => api.post('/admin/results/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });

  const fullSync = useMutation({
    mutationFn: () => api.post('/admin/flashscore/full-sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });

  const { data, isLoading } = useQuery<MatchesResponse>({
    queryKey: ['matches', page, status, competitionId, dateRange],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (status) params.set('status', status);
      if (competitionId) params.set('competitionId', competitionId);
      const range = getDateRange(dateRange);
      if (range) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      return api.get(`/admin/matches?${params}`);
    },
  });

  const items = data?.items ?? [];

  const matchCounts = useMemo(() => {
    let upcoming = 0, finished = 0;
    for (const m of items) {
      if (m.status === 'NS') upcoming++;
      else if (['FT', 'AET', 'PEN'].includes(m.status)) finished++;
    }
    return { upcoming, finished, total: data?.total ?? 0 };
  }, [items, data?.total]);

  const grouped = useMemo(() => {
    if (viewMode === 'all') return null;

    if (viewMode === 'by_competition') {
      const groups: Record<string, Match[]> = {};
      for (const m of items) {
        const key = m.competitionName ?? 'Unknown';
        (groups[key] ??= []).push(m);
      }
      return Object.entries(groups);
    }

    if (viewMode === 'by_date') {
      const groups: Record<string, Match[]> = {};
      for (const m of items) {
        const key = getMatchDateKey(m.kickoff);
        (groups[key] ??= []).push(m);
      }
      return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }

    // by_date_competition
    const dateGroups: Record<string, Record<string, Match[]>> = {};
    for (const m of items) {
      const dateKey = getMatchDateKey(m.kickoff);
      const compKey = m.competitionName ?? 'Unknown';
      ((dateGroups[dateKey] ??= {})[compKey] ??= []).push(m);
    }
    return Object.entries(dateGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, comps]) => ({
        date,
        competitions: Object.entries(comps),
      }));
  }, [items, viewMode]);

  const columns: Column<Match>[] = [
    {
      key: 'match',
      header: 'Match',
      render: (row) => (
        <span className="flex items-center gap-1.5 flex-wrap">
          <TeamLogo url={row.homeTeam?.logo} name={row.homeTeam?.name} />
          <span className="font-medium text-text-primary text-sm">{row.homeTeam?.name ?? '?'}</span>
          <span className="text-text-muted text-xs">vs</span>
          <TeamLogo url={row.awayTeam?.logo} name={row.awayTeam?.name} />
          <span className="font-medium text-text-primary text-sm">{row.awayTeam?.name ?? '?'}</span>
        </span>
      ),
    },
    ...(viewMode === 'all' || viewMode === 'by_date'
      ? [{
          key: 'competition' as const,
          header: 'Competition',
          render: (row: Match) => <span className="text-text-muted text-xs">{row.competitionName ?? '--'}</span>,
        }]
      : []),
    {
      key: 'kickoff',
      header: 'Kickoff',
      render: (row) => <span className="text-text-secondary text-xs">{formatDateTime(row.kickoff)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'score',
      header: 'Score',
      render: (row) =>
        row.score != null ? (
          <span className="font-semibold text-text-primary">{row.score.home} -- {row.score.away}</span>
        ) : (
          <span className="text-text-muted">--</span>
        ),
    },
    {
      key: 'predicted',
      header: 'Predicted',
      render: (row) => (
        <span className={row.predicted ? 'text-success text-xs' : 'text-text-muted text-xs'}>
          {row.predicted ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'enriched',
      header: 'Enriched',
      render: (row) => {
        if (!row.enriched) return <span className="text-text-muted text-xs">No</span>;
        return (
          <button
            onClick={() => setEnrichmentMatchId(row.id)}
            className="px-2 py-0.5 rounded-md text-xs font-medium font-sans bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
          >
            VIEW
          </button>
        );
      },
    },
  ];

  const resetFilters = () => {
    setStatus('');
    setCompetitionId('');
    setDateRange('this_week');
    setPage(1);
  };

  const renderMatchTable = (matchList: Match[]) => (
    <DataTable
      columns={columns}
      data={matchList}
      keyExtractor={(r) => r.id}
      loading={false}
      emptyMessage="No matches"
    />
  );

  return (
    <div>
      <PageHeader
        title="Matches"
        description="All matches in the database"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" loading={syncResults.isPending} onClick={() => syncResults.mutate()}>
              Sync Results
            </Button>
            <Button variant="secondary" loading={syncMatches.isPending} onClick={() => syncMatches.mutate()}>
              Sync Matches
            </Button>
            <Button variant="primary" loading={fullSync.isPending} onClick={() => fullSync.mutate()}>
              Full Sync
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={competitionId}
          onChange={(e) => { setCompetitionId(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none"
        >
          <option value="">All competitions</option>
          {(competitions ?? []).filter(c => c.active).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={dateRange}
          onChange={(e) => { setDateRange(e.target.value as DateRange); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none"
        >
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={resetFilters}
          className="text-xs text-text-muted hover:text-text-primary font-sans transition-colors"
        >
          Reset filters
        </button>

        {/* Match counts */}
        <div className="flex gap-2 text-xs font-sans">
          <span className="px-2 py-1 rounded-md bg-success/15 text-success">{matchCounts.upcoming} upcoming</span>
          <span className="px-2 py-1 rounded-md bg-text-muted/15 text-text-muted">{matchCounts.finished} finished</span>
          <span className="px-2 py-1 rounded-md bg-primary/15 text-primary">{matchCounts.total} total</span>
        </div>

        {/* View mode */}
        <div className="ml-auto flex gap-1">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setViewMode(v.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
                viewMode === v.value
                  ? 'bg-primary text-background'
                  : 'bg-surface-3 text-text-secondary hover:text-text-primary'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && <p className="text-text-muted text-sm">Loading matches...</p>}

      {!isLoading && viewMode === 'all' && renderMatchTable(items)}

      {!isLoading && viewMode === 'by_competition' && grouped && (grouped as [string, Match[]][]).map(([comp, matchList]) => {
        const key = `comp:${comp}`;
        const expanded = !collapsedGroups.has(key);
        return (
          <div key={comp} className="mb-6">
            <button type="button" onClick={() => toggleGroup(key)} className="flex items-center gap-1.5 mb-2 px-1 cursor-pointer select-none">
              <ChevronIcon expanded={expanded} />
              <h3 className="text-sm font-semibold text-text-primary font-sans">{comp}</h3>
              <span className="text-xs text-text-muted font-sans">({matchList.length})</span>
            </button>
            {expanded && renderMatchTable(matchList)}
          </div>
        );
      })}

      {!isLoading && viewMode === 'by_date' && grouped && (grouped as [string, Match[]][]).map(([date, matchList]) => {
        const key = `date:${date}`;
        const expanded = !collapsedGroups.has(key);
        return (
          <div key={date} className="mb-6">
            <button type="button" onClick={() => toggleGroup(key)} className="flex items-center gap-1.5 mb-2 px-1 cursor-pointer select-none">
              <ChevronIcon expanded={expanded} />
              <h3 className="text-sm font-semibold text-text-primary font-sans">{formatGroupDate(date)}</h3>
              <span className="text-xs text-text-muted font-sans">({matchList.length})</span>
            </button>
            {expanded && renderMatchTable(matchList)}
          </div>
        );
      })}

      {!isLoading && viewMode === 'by_date_competition' && grouped && (grouped as { date: string; competitions: [string, Match[]][] }[]).map(({ date, competitions: comps }) => {
        const dateKey = `date:${date}`;
        const dateExpanded = !collapsedGroups.has(dateKey);
        const totalMatches = comps.reduce((sum, [, ml]) => sum + ml.length, 0);
        return (
          <div key={date} className="mb-6">
            <button
              type="button"
              onClick={() => toggleGroup(dateKey)}
              className="flex items-center gap-1.5 mb-3 px-1 border-b pb-2 w-full cursor-pointer select-none"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <ChevronIcon expanded={dateExpanded} />
              <h3 className="text-sm font-semibold text-text-primary font-sans">{formatGroupDate(date)}</h3>
              <span className="text-xs text-text-muted font-sans">({totalMatches})</span>
            </button>
            {dateExpanded && comps.map(([comp, matchList]) => {
              const compKey = `dc:${date}::${comp}`;
              const compExpanded = !collapsedGroups.has(compKey);
              return (
                <div key={comp} className="mb-4 ml-2">
                  <button type="button" onClick={() => toggleGroup(compKey)} className="flex items-center gap-1 mb-1.5 px-1 cursor-pointer select-none">
                    <ChevronIcon expanded={compExpanded} />
                    <h4 className="text-xs font-medium text-text-secondary font-sans">{comp}</h4>
                    <span className="text-[10px] text-text-muted font-sans">({matchList.length})</span>
                  </button>
                  {compExpanded && renderMatchTable(matchList)}
                </div>
              );
            })}
          </div>
        );
      })}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm font-sans">No matches found for the selected filters.</p>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-text-muted text-sm font-sans">Page {page} · {data.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= data.total}>Next</Button>
          </div>
        </div>
      )}

      {enrichmentMatchId && (
        <EnrichmentModal matchId={enrichmentMatchId} onClose={() => setEnrichmentMatchId(null)} />
      )}
    </div>
  );
}
