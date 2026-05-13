'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

interface Competition {
  id: number;
  apiFootballId: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
  logoCustom: string | null;
  type: string | null;
  active: boolean;
  flashscoreSlug: string | null;
  flashscoreSeasonId: string | null;
  currentSeasonYear: string | null;
  supportsQuiniela: boolean;
  quinielaFormat: 'group_then_knockout' | 'league_then_knockout' | 'single_phase' | null;
  historicalContext: string | null;
  isNationalTeamCompetition: boolean;
}

type CompetitionUpdate = Partial<Pick<Competition,
  | 'name'
  | 'country'
  | 'active'
  | 'logoCustom'
  | 'flashscoreSlug'
  | 'flashscoreSeasonId'
  | 'currentSeasonYear'
  | 'supportsQuiniela'
  | 'quinielaFormat'
  | 'historicalContext'
  | 'isNationalTeamCompetition'
>>;

interface PredictionConfig {
  automationEnabled: boolean;
  model: string;
  batchSize: number;
  reasoningEffort: string | null;
  inputDataFields: string[];
  outputMarkets: string[];
  historicalContextEnabled: boolean;
  historicalContextCount: number;
  matchSyncEnabled: boolean;
  matchSyncIntervalHours: number;
  resultSyncEnabled: boolean;
  resultSyncInitialDelayMinutes: number;
  resultSyncRetryIntervalMinutes: number;
  resultSyncMaxRetryHours: number;
  llmTimeoutSeconds: number;
  predictionWindowMinutes: number;
  featuredLeagueIds: number[];
}

function LogoEditor({
  comp,
  onSave,
  onReset,
  onClose,
}: {
  comp: Competition;
  onSave: (url: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(comp.logoCustom ?? '');

  return (
    <div className="mt-3 p-3 rounded-xl" style={{ background: '#0D1220', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-xs text-text-muted font-sans mb-2">Custom logo URL</p>
      <div className="flex gap-2 mb-2">
        {url && (
          <img src={url} alt="preview" className="w-8 h-8 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="flex-1 h-8 px-2 rounded-lg text-xs font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(url)}
          className="px-3 py-1 rounded-lg text-xs font-sans font-medium bg-primary text-background"
        >
          Save
        </button>
        {comp.logoCustom && (
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary"
          >
            Reset to API default
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 rounded-lg text-xs font-sans font-medium text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CompetitionDetailsEditor({
  comp,
  onSave,
  onClose,
}: {
  comp: Competition;
  onSave: (update: CompetitionUpdate) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(comp.name);
  const [country, setCountry] = useState(comp.country ?? '');
  const [flashscoreSlug, setFlashscoreSlug] = useState(comp.flashscoreSlug ?? '');
  const [flashscoreSeasonId, setFlashscoreSeasonId] = useState(comp.flashscoreSeasonId ?? '');
  const [currentSeasonYear, setCurrentSeasonYear] = useState(comp.currentSeasonYear ?? '');
  const [supportsQuiniela, setSupportsQuiniela] = useState(comp.supportsQuiniela);
  const [quinielaFormat, setQuinielaFormat] = useState<Competition['quinielaFormat']>(comp.quinielaFormat);
  const [historicalContext, setHistoricalContext] = useState(comp.historicalContext ?? '');
  const [isNationalTeamCompetition, setIsNationalTeamCompetition] = useState(comp.isNationalTeamCompetition);

  // A tournament-format competition (group-aware standings, like the World
  // Cup) is identified by a non-empty flashscore_season_id. In that case the
  // backend needs current_season_year too — without it Team Sync skips the
  // row entirely with a warn.
  const isTournamentShape = flashscoreSeasonId.trim().length > 0;
  const missingSeasonYear = isTournamentShape && currentSeasonYear.trim().length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <h2 className="text-sm font-semibold text-text-primary font-sans">Edit competition</h2>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Country</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. England, World"
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Flashscore slug</span>
          <input
            value={flashscoreSlug}
            onChange={(e) => setFlashscoreSlug(e.target.value)}
            placeholder="football/world/world-cup"
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-mono text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted font-sans">Flashscore season id</span>
            <input
              value={flashscoreSeasonId}
              onChange={(e) => setFlashscoreSeasonId(e.target.value)}
              placeholder="SbLsX4y7 (tournaments only)"
              className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-mono text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted font-sans">Current season year</span>
            <input
              value={currentSeasonYear}
              onChange={(e) => setCurrentSeasonYear(e.target.value)}
              placeholder="2026"
              className={`mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 outline-none placeholder:text-text-muted ${missingSeasonYear ? 'border border-danger' : 'border border-border'}`}
            />
          </label>
        </div>
        {missingSeasonYear && (
          <p className="text-xs text-danger font-sans -mt-2">Required when Flashscore season id is set — Team Sync will skip otherwise.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 px-3 h-9 rounded-xl bg-surface-3 border border-border">
            <span className="text-xs text-text-muted font-sans">Is national-team comp</span>
            <input
              type="checkbox"
              checked={isNationalTeamCompetition}
              onChange={(e) => setIsNationalTeamCompetition(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between gap-2 px-3 h-9 rounded-xl bg-surface-3 border border-border">
            <span className="text-xs text-text-muted font-sans">Supports quiniela</span>
            <input
              type="checkbox"
              checked={supportsQuiniela}
              onChange={(e) => setSupportsQuiniela(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Quiniela format</span>
          <select
            value={quinielaFormat ?? ''}
            onChange={(e) => setQuinielaFormat((e.target.value || null) as Competition['quinielaFormat'])}
            className="mt-1 w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
          >
            <option value="">(none)</option>
            <option value="group_then_knockout">group_then_knockout</option>
            <option value="league_then_knockout">league_then_knockout</option>
            <option value="single_phase">single_phase</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Historical context (LLM prompt)</span>
          <textarea
            value={historicalContext}
            onChange={(e) => setHistoricalContext(e.target.value)}
            rows={6}
            placeholder="Brief description, recent editions, scoring quirks…"
            className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted resize-y"
          />
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={missingSeasonYear}
            onClick={() => onSave({
              name: name.trim() || undefined,
              country: country.trim() ? country.trim() : null,
              flashscoreSlug: flashscoreSlug.trim() ? flashscoreSlug.trim() : null,
              flashscoreSeasonId: flashscoreSeasonId.trim() ? flashscoreSeasonId.trim() : null,
              currentSeasonYear: currentSeasonYear.trim() ? currentSeasonYear.trim() : null,
              supportsQuiniela,
              quinielaFormat,
              historicalContext: historicalContext.trim() ? historicalContext : null,
              isNationalTeamCompetition,
            })}
            className="px-4 py-2 rounded-xl text-sm font-sans font-medium bg-primary text-background disabled:opacity-40 disabled:cursor-not-allowed"
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

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const [editingLogoId, setEditingLogoId] = useState<number | null>(null);
  const [editingDetails, setEditingDetails] = useState<Competition | null>(null);

  const { data: competitions, isLoading } = useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
  });

  const { data: config } = useQuery<PredictionConfig>({
    queryKey: ['prediction-config'],
    queryFn: () => api.get('/admin/prediction-config'),
  });

  const syncCompetitions = useMutation({
    mutationFn: () => api.post('/admin/competitions/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
  });

  const syncTeams = useMutation({
    mutationFn: () => api.post('/admin/teams/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  const updateCompetition = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & CompetitionUpdate) =>
      api.patch(`/admin/competitions/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ apiFootballId, featured }: { apiFootballId: number; featured: boolean }) => {
      const fullConfig = await api.get<PredictionConfig>('/admin/prediction-config');
      const current: number[] = fullConfig.featuredLeagueIds ?? [];
      const updated = featured
        ? [...current, apiFootballId]
        : current.filter((id: number) => id !== apiFootballId);
      return api.put('/admin/prediction-config', { ...fullConfig, featuredLeagueIds: updated });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prediction-config'] }),
  });

  return (
    <div>
      <PageHeader
        title="Competitions"
        description="Manage supported football leagues and competitions"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" loading={syncTeams.isPending} onClick={() => syncTeams.mutate()}>
              Sync Teams
            </Button>
            <Button variant="primary" loading={syncCompetitions.isPending} onClick={() => syncCompetitions.mutate()}>
              Sync Competitions
            </Button>
          </div>
        }
      />

      {isLoading && <p className="text-text-muted text-sm">Loading competitions...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(competitions ?? []).map((comp) => {
          const isFeatured = config?.featuredLeagueIds?.includes(comp.apiFootballId) ?? false;
          const displayLogo = comp.logoCustom ?? comp.logoUrl;
          const isEditingLogo = editingLogoId === comp.id;

          return (
            <div
              key={comp.id}
              className="relative rounded-2xl p-4 flex flex-col items-center text-center transition-colors"
              style={{
                background: '#121A2B',
                border: `1px solid ${isFeatured ? 'rgba(245,158,11,0.3)' : comp.active ? 'rgba(124,255,91,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {/* Active toggle — top-left corner, small, no label */}
              <div className="absolute top-3 left-3">
                <button
                  type="button"
                  onClick={() => updateCompetition.mutate({ id: comp.id, active: !comp.active })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    comp.active ? 'bg-primary' : 'bg-surface-3'
                  }`}
                  title={comp.active ? 'Active' : 'Inactive'}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${
                      comp.active ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Edit details trigger — top-right corner */}
              <button
                type="button"
                onClick={() => setEditingDetails(comp)}
                className="absolute top-3 right-3 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
                title="Edit competition details"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>

              {/* Quiniela-ready indicator under the name */}
              {comp.supportsQuiniela && (
                <span className="absolute top-3 left-14 text-[9px] font-semibold font-sans text-amber-400 uppercase tracking-wider" title={`Quiniela format: ${comp.quinielaFormat ?? 'unset'}`}>
                  Q
                </span>
              )}
              {comp.isNationalTeamCompetition && (
                <span className="absolute top-3 left-20 text-[9px] font-semibold font-sans text-sky-400 uppercase tracking-wider" title="National-team competition">
                  Nat
                </span>
              )}

              {/* Logo with edit trigger */}
              <div className="relative group mb-3 mt-2">
                {displayLogo ? (
                  <img
                    src={displayLogo}
                    alt={comp.name}
                    className="w-14 h-14 object-contain"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center">
                    <span className="text-lg font-semibold text-text-muted font-sans">
                      {comp.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditingLogoId(isEditingLogo ? null : comp.id)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit logo"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {comp.logoCustom && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400" title="Custom logo" />
                )}
              </div>

              {/* Name */}
              <h3 className="text-sm font-medium text-text-primary font-sans mb-0.5">{comp.name}</h3>

              {/* Country */}
              <p className="text-xs text-text-muted font-sans mb-3">{comp.country ?? 'International'}</p>

              {/* Featured toggle */}
              <div className="flex items-center gap-2 w-full justify-center">
                <button
                  type="button"
                  disabled={!comp.active}
                  onClick={() => toggleFeatured.mutate({ apiFootballId: comp.apiFootballId, featured: !isFeatured })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    isFeatured ? 'bg-amber-500' : 'bg-surface-3'
                  } ${!comp.active ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${
                      isFeatured ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-[10px] text-text-muted font-sans">
                  {isFeatured ? 'Featured' : 'Not featured'}
                </span>
              </div>

              {/* Logo editor */}
              {isEditingLogo && (
                <div className="w-full text-left">
                  <LogoEditor
                    comp={comp}
                    onSave={(url) => {
                      updateCompetition.mutate({ id: comp.id, logoCustom: url || null });
                      setEditingLogoId(null);
                    }}
                    onReset={() => {
                      updateCompetition.mutate({ id: comp.id, logoCustom: null });
                      setEditingLogoId(null);
                    }}
                    onClose={() => setEditingLogoId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isLoading && (competitions ?? []).length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm font-sans">No competitions found. Click &quot;Sync Competitions&quot; to fetch from Flashscore.</p>
        </div>
      )}

      {editingDetails && (
        <CompetitionDetailsEditor
          comp={editingDetails}
          onSave={(update) => {
            updateCompetition.mutate({ id: editingDetails.id, ...update });
            setEditingDetails(null);
          }}
          onClose={() => setEditingDetails(null)}
        />
      )}
    </div>
  );
}
