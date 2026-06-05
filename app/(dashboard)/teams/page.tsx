'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TeamNewsManager } from '@/components/team-news/TeamNewsManager';

interface Team {
  id: number;
  name: string;
  shortName: string;
  logo: string | null;
  flashscoreSlug: string | null;
  country: string | null;
  teamType: 'club' | 'national';
  createdAt: string;
}

// Sentinel value for the country dropdown that activates the teamType filter
// instead of the country filter. Picked unlikely to ever collide with a real
// country name returned from the backend.
const FILTER_SELECCIONES = '__selecciones__';

interface TeamsResponse {
  items: Team[];
  page: number;
  pageSize: number;
  total: number;
}

function TeamEditor({
  team,
  onSave,
  onClose,
  onManageNews,
}: {
  team: Team;
  onSave: (updates: Partial<Team>) => void;
  onClose: () => void;
  onManageNews: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [logo, setLogo] = useState(team.logo ?? '');
  const [country, setCountry] = useState(team.country ?? '');
  const [flashscoreSlug, setFlashscoreSlug] = useState(team.flashscoreSlug ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <h2 className="text-sm font-semibold text-text-primary font-sans">Edit Team</h2>

        <div className="flex items-center gap-3 mb-2">
          {logo ? (
            <img src={logo} alt={name} className="w-12 h-12 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
              <span className="text-base font-semibold text-text-muted font-sans">{name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-text-primary font-sans">{team.name}</p>
            <p className="text-xs text-text-muted font-sans">{team.country ?? 'Unknown'}</p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Short name</span>
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Logo URL</span>
          <input
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Country</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Flashscore slug</span>
          <input
            value={flashscoreSlug}
            onChange={(e) => setFlashscoreSlug(e.target.value)}
            placeholder="team-name/CODE"
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </label>

        <div className="flex gap-2 pt-2 items-center">
          <button
            type="button"
            onClick={() => onSave({ name, shortName, logo: logo || undefined, country: country || undefined, flashscoreSlug: flashscoreSlug || undefined })}
            className="px-4 py-2 rounded-xl text-sm font-sans font-medium bg-primary text-background"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-sans font-medium text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onManageNews}
            title="Manage team news (injuries, suspensions, etc.) — injected manually into the quiniela payload"
            className="ml-auto px-4 py-2 rounded-xl text-sm font-sans font-medium border border-border text-text-secondary hover:text-text-primary hover:bg-surface-2"
          >
            📰 Manage news
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [managingNewsTeam, setManagingNewsTeam] = useState<Team | null>(null);
  const pageSize = 24;

  const queryParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) queryParams.set('search', search);
  if (countryFilter === FILTER_SELECCIONES) {
    // Pseudo-country option: switches the filter from `country=` to
    // `teamType=national`. The backend whitelist accepts only 'national' |
    // 'club', so smuggling the sentinel through is harmless.
    queryParams.set('teamType', 'national');
  } else if (countryFilter) {
    queryParams.set('country', countryFilter);
  }

  const { data, isLoading } = useQuery<TeamsResponse>({
    queryKey: ['teams', page, search, countryFilter],
    queryFn: () => api.get(`/admin/teams?${queryParams.toString()}`),
  });

  const updateTeam = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Team>) =>
      api.patch(`/admin/teams/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setEditingTeam(null);
    },
  });

  // Re-sincronización completa (historial + plantillas) de TODOS los equipos.
  // Distinto del botón "Sync Teams" de Competitions, que solo corrige slugs y
  // logos desde standings. Este endpoint es fire-and-forget (responde 202) y el
  // worker drena la cola en segundo plano; el rate-limit del backend lo limita
  // a 1 cada 5 min.
  const syncAllTeams = useMutation<{ status: string }, Error, void>({
    mutationFn: () => api.post('/admin/teams/sync-all', {}),
  });

  // Sync masivo de fichajes (clubes). Job aparte del sync principal: encola un
  // scrape de la pestaña Transfers de Flashscore por cada club con slug. La app
  // lee los fichajes desde DB (solo lectura). Fire-and-forget (202), máx. 1/5min.
  const syncTransfers = useMutation<{ status: string }, Error, void>({
    mutationFn: () => api.post('/admin/teams/sync-transfers-all', {}),
  });

  // Sync único de las tablas de liga de clubes a competition_standings (antes
  // solo había torneos). Corre inline en la instancia con Flashscore; útil para
  // capturar la tabla final cuando termina la temporada. Máx. 1/5min.
  const syncStandings = useMutation<{ status: string; leagues: number }, Error, void>({
    mutationFn: () => api.post('/admin/standings/sync-all', {}),
  });

  // Extract unique countries from current page for filter. Excludes the
  // pseudo-"World" countries used as the home country of national teams so the
  // dropdown stays focused on club leagues; the "Selecciones" option is the
  // proper way to surface national teams.
  const countries = [
    ...new Set(
      (data?.items ?? [])
        .filter((t) => t.teamType !== 'national')
        .map((t) => t.country)
        .filter(Boolean),
    ),
  ] as string[];

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div>
      <PageHeader
        title="Teams"
        description={`${data?.total ?? 0} teams in database`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              loading={syncAllTeams.isPending}
              onClick={() => syncAllTeams.mutate()}
              title="Encola un re-sync completo (historial + plantillas + FIFA/estadio) de todos los equipos con slug de Flashscore. Fire-and-forget: el worker lo procesa en segundo plano (~1h). Máx. 1 cada 5 min."
            >
              Sync All Teams
            </Button>
            <Button
              variant="secondary"
              loading={syncTransfers.isPending}
              onClick={() => syncTransfers.mutate()}
              title="Encola un scrape de fichajes (llegadas/salidas) de Flashscore para todos los clubes. Job aparte del sync principal; el worker lo drena en segundo plano (~1h). Máx. 1 cada 5 min."
            >
              Sync Transfers
            </Button>
            <Button
              variant="secondary"
              loading={syncStandings.isPending}
              onClick={() => syncStandings.mutate()}
              title="Sincroniza las tablas de liga de clubes (competition_standings). Corre inline (~varios min). Útil para capturar la tabla final de la temporada. Máx. 1 cada 5 min."
            >
              Sync Table
            </Button>
          </div>
        }
      />

      {syncAllTeams.isSuccess && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-primary/10 border border-primary/30">
          <span className="text-primary font-medium">Full team sync enqueued.</span>{' '}
          <span className="text-text-muted">The worker drains the queue in the background (~1h). Track progress in the Jobs tab.</span>
        </div>
      )}
      {syncAllTeams.error && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-danger/15 border border-danger/30">
          <span className="text-danger font-medium">Sync failed:</span>{' '}
          <span className="text-text-muted">{syncAllTeams.error.message}</span>
        </div>
      )}

      {syncTransfers.isSuccess && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-primary/10 border border-primary/30">
          <span className="text-primary font-medium">Transfers sync enqueued.</span>{' '}
          <span className="text-text-muted">The worker scrapes each club&apos;s transfers in the background (~1h).</span>
        </div>
      )}
      {syncTransfers.error && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-danger/15 border border-danger/30">
          <span className="text-danger font-medium">Transfers sync failed:</span>{' '}
          <span className="text-text-muted">{syncTransfers.error.message}</span>
        </div>
      )}

      {syncStandings.isSuccess && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-primary/10 border border-primary/30">
          <span className="text-primary font-medium">
            Table sync started{syncStandings.data ? ` (${syncStandings.data.leagues} leagues)` : ''}.
          </span>{' '}
          <span className="text-text-muted">Standings refresh inline; check back in a few minutes.</span>
        </div>
      )}
      {syncStandings.error && (
        <div className="mb-4 rounded-xl px-4 py-2 text-sm font-sans bg-danger/15 border border-danger/30">
          <span className="text-danger font-medium">Table sync failed:</span>{' '}
          <span className="text-text-muted">{syncStandings.error.message}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search teams..."
          className="h-9 w-64 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
        />
        <select
          value={countryFilter}
          onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
        >
          <option value="">All countries</option>
          <option value={FILTER_SELECCIONES}>🌐 Selecciones</option>
          <option value="" disabled>──────────</option>
          {countries.sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-text-muted text-sm font-sans">Loading teams...</p>}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {(data?.items ?? []).map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => setEditingTeam(team)}
            className="rounded-2xl p-4 flex flex-col items-center text-center transition-colors hover:border-primary/40 cursor-pointer"
            style={{
              background: '#121A2B',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {team.logo ? (
              <img
                src={team.logo}
                alt={team.name}
                className="w-12 h-12 object-contain mb-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center mb-2">
                <span className="text-base font-semibold text-text-muted font-sans">
                  {team.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <h3 className="text-xs font-medium text-text-primary font-sans leading-tight mb-0.5">{team.name}</h3>
            <p className="text-[10px] text-text-muted font-sans">{team.shortName}</p>
            <p className="text-[10px] text-text-muted/60 font-sans mt-0.5">{team.country ?? ''}</p>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-xs text-text-muted font-sans">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {!isLoading && (data?.items ?? []).length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm font-sans">No teams found. Teams are synced automatically during match sync.</p>
        </div>
      )}

      {/* Edit popup */}
      {editingTeam && (
        <TeamEditor
          team={editingTeam}
          onSave={(updates) => updateTeam.mutate({ id: editingTeam.id, ...updates })}
          onClose={() => setEditingTeam(null)}
          onManageNews={() => {
            // Swap edit popup → news popup. Keep the team reference so the
            // user can pop back into edit if needed via the team card click.
            setManagingNewsTeam(editingTeam);
            setEditingTeam(null);
          }}
        />
      )}

      {/* News popup */}
      {managingNewsTeam && (
        <TeamNewsManager
          teamId={managingNewsTeam.id}
          teamName={managingNewsTeam.name}
          onClose={() => setManagingNewsTeam(null)}
        />
      )}
    </div>
  );
}
