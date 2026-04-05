'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';

interface Team {
  id: number;
  name: string;
  shortName: string;
  logo: string | null;
  flashscoreSlug: string | null;
  country: string | null;
  createdAt: string;
}

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
}: {
  team: Team;
  onSave: (updates: Partial<Team>) => void;
  onClose: () => void;
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

        <div className="flex gap-2 pt-2">
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
  const pageSize = 24;

  const queryParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) queryParams.set('search', search);
  if (countryFilter) queryParams.set('country', countryFilter);

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

  // Extract unique countries from current page for filter
  const countries = [...new Set((data?.items ?? []).map((t) => t.country).filter(Boolean))] as string[];

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div>
      <PageHeader
        title="Teams"
        description={`${data?.total ?? 0} teams in database`}
      />

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
        />
      )}
    </div>
  );
}
