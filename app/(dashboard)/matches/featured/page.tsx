'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/form-controls';
import { MatchesSubnav } from '@/components/matches/MatchesSubnav';
import { formatDateTime } from '@/lib/utils';

interface FeaturedMatch {
  id: number; // apiFootballId
  home: string;
  away: string;
  kickoff: string | null;
  status: string;
  league: string | null;
  viewCount: number;
  featuredPriority: number | null;
}

interface FeaturedResponse {
  leagueIds: number[];
  matches: FeaturedMatch[];
}

interface Competition {
  apiFootballId: number;
  name: string;
  country?: string | null;
  active?: boolean;
}

export default function FeaturedMatchesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<FeaturedResponse>({
    queryKey: ['admin-featured-matches'],
    queryFn: () => api.get('/admin/featured-matches'),
  });

  const { data: competitions } = useQuery<Competition[]>({
    queryKey: ['admin-competitions'],
    queryFn: () => api.get('/admin/competitions'),
  });

  // Local state is null while "pristine" (mirrors the server); once the admin
  // edits, it holds the working copy. We derive the effective value as
  // `state ?? serverValue` so there's no setState-in-effect to seed it.
  // After a successful save we reset to null to re-sync with the refetch.

  // ── Featured leagues editor ────────────────────────────────────────────────
  const [selectedLeagues, setSelectedLeagues] = useState<number[] | null>(null);
  const initialLeagues = useMemo(() => data?.leagueIds ?? [], [data]);
  const effectiveLeagues = selectedLeagues ?? initialLeagues;

  const saveLeagues = useMutation({
    mutationFn: (leagueIds: number[]) => api.put('/admin/featured-leagues', { leagueIds }),
    onSuccess: () => {
      setSelectedLeagues(null);
      qc.invalidateQueries({ queryKey: ['admin-featured-matches'] });
    },
  });

  // ── Manual order (pinned) ──────────────────────────────────────────────────
  // `pinned` is the ordered list of apiFootballIds the admin forces to the top
  // (priority 1). Everything else falls back to view-count order (priority 2).
  const [pinned, setPinned] = useState<number[] | null>(null);
  const initialPinned = useMemo(
    () =>
      (data?.matches ?? [])
        .filter((m) => m.featuredPriority != null)
        .sort((a, b) => (a.featuredPriority ?? 0) - (b.featuredPriority ?? 0))
        .map((m) => m.id),
    [data],
  );
  const pinnedList = pinned ?? initialPinned;

  const matchById = useMemo(() => {
    const map = new Map<number, FeaturedMatch>();
    for (const m of data?.matches ?? []) map.set(m.id, m);
    return map;
  }, [data]);

  const saveOrder = useMutation({
    mutationFn: (orderedMatchIds: number[]) =>
      api.put('/admin/featured-matches/order', { orderedMatchIds }),
    onSuccess: () => {
      setPinned(null);
      qc.invalidateQueries({ queryKey: ['admin-featured-matches'] });
    },
  });

  const available = (data?.matches ?? []).filter((m) => !pinnedList.includes(m.id));

  const move = (idx: number, dir: -1 | 1) => {
    setPinned((prev) => {
      const cur = prev ?? initialPinned;
      const next = [...cur];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const unpin = (id: number) => setPinned((prev) => (prev ?? initialPinned).filter((x) => x !== id));
  const pin = (id: number) => setPinned((prev) => [...(prev ?? initialPinned), id]);

  const toggleLeague = (apiId: number) =>
    setSelectedLeagues((prev) => {
      const cur = prev ?? initialLeagues;
      return cur.includes(apiId) ? cur.filter((x) => x !== apiId) : [...cur, apiId];
    });

  const leaguesDirty =
    selectedLeagues != null &&
    JSON.stringify([...effectiveLeagues].sort()) !== JSON.stringify([...initialLeagues].sort());

  // Solo competiciones que son ligas destacadas hoy + el resto para poder
  // agregarlas. Ordenadas: activas primero, luego por nombre.
  const sortedCompetitions = useMemo(
    () =>
      [...(competitions ?? [])].sort((a, b) => {
        if (!!a.active !== !!b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [competitions],
  );

  return (
    <div>
      <MatchesSubnav />
      <PageHeader
        title="Featured matches"
        description="Controls the Home featured carousel. Order = (1) manual pin below, (2) most-viewed, (3) soonest kickoff. Only matches in featured leagues appear here."
      />

      <div className="space-y-6">
        {/* Featured leagues */}
        <SectionCard
          title="Featured leagues"
          subtitle="Which competitions feed the Home featured carousel (1–15)."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            {sortedCompetitions.map((c) => {
              const checked = effectiveLeagues.includes(c.apiFootballId);
              return (
                <label
                  key={c.apiFootballId}
                  className="flex items-center gap-2 px-3 h-10 rounded-xl bg-surface-3 cursor-pointer text-sm font-sans text-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLeague(c.apiFootballId)}
                    className="accent-primary"
                  />
                  <span className="truncate">{c.name}</span>
                  {!c.active && <span className="text-[10px] text-text-muted">(inactive)</span>}
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!leaguesDirty || effectiveLeagues.length < 1}
              loading={saveLeagues.isPending}
              onClick={() => saveLeagues.mutate(effectiveLeagues)}
            >
              Save leagues
            </Button>
            {effectiveLeagues.length < 1 && (
              <span className="text-[11px] text-danger font-sans">Select at least one league.</span>
            )}
            {saveLeagues.isError && (
              <span className="text-[11px] text-danger font-sans">{(saveLeagues.error as Error).message}</span>
            )}
          </div>
        </SectionCard>

        {/* Manual order */}
        <SectionCard
          title="Manual order (forced)"
          subtitle="Pinned matches show first, in this order. Unpinned matches fall back to view-count order automatically."
        >
          {isLoading ? (
            <p className="text-sm text-text-muted font-sans">Loading…</p>
          ) : (data?.matches.length ?? 0) === 0 ? (
            <p className="text-sm text-text-muted font-sans">
              No upcoming matches in featured leagues right now.
            </p>
          ) : (
            <div className="space-y-5">
              {/* Pinned */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-sans font-semibold uppercase tracking-wide text-text-muted">
                    Pinned ({pinnedList.length})
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={pinnedList.length === 0}
                      onClick={() => setPinned([])}
                    >
                      Clear all
                    </Button>
                    <Button
                      variant="primary"
                      loading={saveOrder.isPending}
                      onClick={() => saveOrder.mutate(pinnedList)}
                    >
                      Save order
                    </Button>
                  </div>
                </div>
                {pinnedList.length === 0 ? (
                  <p className="text-[12px] text-text-muted font-sans">
                    Nothing pinned — featured order is fully automatic (by views).
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pinnedList.map((id, idx) => {
                      const m = matchById.get(id);
                      if (!m) return null;
                      return (
                        <li
                          key={id}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-3"
                        >
                          <span className="w-6 text-center text-xs font-mono text-primary">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-sans text-text-primary truncate">
                              {m.home} <span className="text-text-muted">vs</span> {m.away}
                            </p>
                            <p className="text-[11px] font-sans text-text-muted truncate">
                              {m.league ?? '—'} · {formatDateTime(m.kickoff)} · {m.viewCount} views
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" disabled={idx === 0} onClick={() => move(idx, -1)}>
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={idx === pinnedList.length - 1}
                              onClick={() => move(idx, 1)}
                            >
                              ↓
                            </Button>
                            <Button variant="ghost" onClick={() => unpin(id)}>
                              Unpin
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Available (auto by views) */}
              <div>
                <h4 className="text-xs font-sans font-semibold uppercase tracking-wide text-text-muted mb-2">
                  Auto by views ({available.length})
                </h4>
                <ul className="space-y-2">
                  {available.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-sans text-text-primary truncate">
                          {m.home} <span className="text-text-muted">vs</span> {m.away}
                        </p>
                        <p className="text-[11px] font-sans text-text-muted truncate">
                          {m.league ?? '—'} · {formatDateTime(m.kickoff)} · {m.viewCount} views
                        </p>
                      </div>
                      <Button variant="secondary" onClick={() => pin(m.id)}>
                        Pin
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              {saveOrder.isError && (
                <span className="text-[11px] text-danger font-sans">{(saveOrder.error as Error).message}</span>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
