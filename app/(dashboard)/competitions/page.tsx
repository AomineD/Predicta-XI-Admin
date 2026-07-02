'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toggle } from '@/components/ui/form-controls';
import { Input, Select, Textarea } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';

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
  // Formato de llave para la quiniela de eliminatorias: a un partido o ida/vuelta.
  // Null = la competición NO se ofrece para la quiniela de llaves.
  knockoutLegFormat: 'single_match' | 'two_legged' | null;
  historicalContext: string | null;
  isNationalTeamCompetition: boolean;
  // 3.er puesto: si la competición tiene partido por el 3.er puesto e incluirlo en
  // la quiniela de llaves (como una llave más; no cuenta para el campeón).
  thirdPlaceEnabled: boolean;
}

type CompetitionUpdate = Partial<
  Pick<
    Competition,
    | 'name'
    | 'country'
    | 'active'
    | 'logoCustom'
    | 'flashscoreSlug'
    | 'flashscoreSeasonId'
    | 'currentSeasonYear'
    | 'supportsQuiniela'
    | 'quinielaFormat'
    | 'knockoutLegFormat'
    | 'historicalContext'
    | 'isNationalTeamCompetition'
    | 'thirdPlaceEnabled'
  >
>;

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

/** Fila de "toggle con etiqueta" (pill) — reemplaza los checkboxes nativos. */
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-3 border border-border">
      <span className="text-xs text-text-muted font-sans">{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
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
    <div className="mt-3 p-3 rounded-xl border border-border bg-background">
      <p className="text-xs text-text-muted font-sans mb-2">Custom logo URL</p>
      <div className="flex gap-2 mb-2">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="preview" className="w-8 h-8 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <Input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => onSave(url)}>
          Save
        </Button>
        {comp.logoCustom && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            Reset to API default
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
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
  const [knockoutLegFormat, setKnockoutLegFormat] = useState<Competition['knockoutLegFormat']>(comp.knockoutLegFormat);
  const [historicalContext, setHistoricalContext] = useState(comp.historicalContext ?? '');
  const [isNationalTeamCompetition, setIsNationalTeamCompetition] = useState(comp.isNationalTeamCompetition);
  const [thirdPlaceEnabled, setThirdPlaceEnabled] = useState(comp.thirdPlaceEnabled);

  // A tournament-format competition (group-aware standings, like the World
  // Cup) is identified by a non-empty flashscore_season_id. In that case the
  // backend needs current_season_year too — without it Team Sync skips the
  // row entirely with a warn.
  const isTournamentShape = flashscoreSeasonId.trim().length > 0;
  const missingSeasonYear = isTournamentShape && currentSeasonYear.trim().length === 0;
  const contextTooLong = historicalContext.length > 12000;

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit competition"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={missingSeasonYear || contextTooLong}
            onClick={() =>
              onSave({
                name: name.trim() || undefined,
                country: country.trim() ? country.trim() : null,
                flashscoreSlug: flashscoreSlug.trim() ? flashscoreSlug.trim() : null,
                flashscoreSeasonId: flashscoreSeasonId.trim() ? flashscoreSeasonId.trim() : null,
                currentSeasonYear: currentSeasonYear.trim() ? currentSeasonYear.trim() : null,
                supportsQuiniela,
                quinielaFormat,
                knockoutLegFormat,
                historicalContext: historicalContext.trim() ? historicalContext : null,
                isNationalTeamCompetition,
                thirdPlaceEnabled,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs text-text-muted font-sans">Name</span>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Country</span>
          <Input className="mt-1" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. England, World" />
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Flashscore slug</span>
          <Input className="mt-1 font-mono" value={flashscoreSlug} onChange={(e) => setFlashscoreSlug(e.target.value)} placeholder="football/world/world-cup" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted font-sans">Flashscore season id</span>
            <Input className="mt-1 font-mono" value={flashscoreSeasonId} onChange={(e) => setFlashscoreSeasonId(e.target.value)} placeholder="SbLsX4y7 (tournaments only)" />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted font-sans">Current season year</span>
            <Input
              className={cn('mt-1', missingSeasonYear && 'border-danger')}
              value={currentSeasonYear}
              onChange={(e) => setCurrentSeasonYear(e.target.value)}
              placeholder="2026"
            />
          </label>
        </div>
        {missingSeasonYear && (
          <p className="text-xs text-danger font-sans -mt-2">Required when Flashscore season id is set — Team Sync will skip otherwise.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <ToggleRow label="Is national-team comp" value={isNationalTeamCompetition} onChange={setIsNationalTeamCompetition} />
          <ToggleRow label="Supports quiniela" value={supportsQuiniela} onChange={setSupportsQuiniela} />
        </div>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Quiniela format</span>
          <Select className="mt-1" value={quinielaFormat ?? ''} onChange={(e) => setQuinielaFormat((e.target.value || null) as Competition['quinielaFormat'])}>
            <option value="">(none)</option>
            <option value="group_then_knockout">group_then_knockout</option>
            <option value="league_then_knockout">league_then_knockout</option>
            <option value="single_phase">single_phase</option>
          </Select>
        </label>

        <label className="block">
          <span className="text-xs text-text-muted font-sans">Knockout leg format (quiniela de llaves)</span>
          <Select className="mt-1" value={knockoutLegFormat ?? ''} onChange={(e) => setKnockoutLegFormat((e.target.value || null) as Competition['knockoutLegFormat'])}>
            <option value="">(none — no se ofrece quiniela de llaves)</option>
            <option value="single_match">single_match (eliminación directa, 1 partido)</option>
            <option value="two_legged">two_legged (ida y vuelta)</option>
          </Select>
        </label>

        <ToggleRow label="3.er puesto (incluir en quiniela de llaves)" value={thirdPlaceEnabled} onChange={setThirdPlaceEnabled} />

        <label className="block">
          <span className="text-xs text-text-muted font-sans flex justify-between">
            <span>Historical context (LLM prompt)</span>
            <span className={contextTooLong ? 'text-danger' : 'text-text-muted'}>{historicalContext.length} / 12000</span>
          </span>
          <Textarea
            className={cn('mt-1 font-mono text-xs min-h-[9rem]', contextTooLong && 'border-danger')}
            value={historicalContext}
            onChange={(e) => setHistoricalContext(e.target.value)}
            rows={6}
            placeholder="Brief description, recent editions, scoring quirks…"
          />
        </label>
      </div>
    </Modal>
  );
}

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] });
      toast.success('Competitions sync started.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncTeams = useMutation({
    mutationFn: () => api.post('/admin/teams/sync', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Teams sync started.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateCompetition = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & CompetitionUpdate) => api.patch(`/admin/competitions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] });
      toast.success('Competition updated.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ apiFootballId, featured }: { apiFootballId: number; featured: boolean }) => {
      const fullConfig = await api.get<PredictionConfig>('/admin/prediction-config');
      const current: number[] = fullConfig.featuredLeagueIds ?? [];
      const updated = featured ? [...current, apiFootballId] : current.filter((id: number) => id !== apiFootballId);
      return api.put('/admin/prediction-config', { ...fullConfig, featuredLeagueIds: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prediction-config'] });
      toast.success('Featured leagues updated.');
    },
    onError: (err: Error) => toast.error(err.message),
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
              className={cn(
                'relative rounded-2xl p-4 flex flex-col items-center text-center transition-colors bg-surface border',
                isFeatured ? 'border-warning/30' : comp.active ? 'border-success/20' : 'border-border',
              )}
            >
              {/* Active toggle — top-left corner, small, no label */}
              <div className="absolute top-3 left-3">
                <button
                  type="button"
                  onClick={() => updateCompetition.mutate({ id: comp.id, active: !comp.active })}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                    comp.active ? 'bg-primary' : 'bg-surface-3',
                  )}
                  title={comp.active ? 'Active' : 'Inactive'}
                >
                  <span className={cn('inline-block h-3 w-3 transform rounded-full bg-background transition-transform', comp.active ? 'translate-x-5' : 'translate-x-1')} />
                </button>
              </div>

              {/* Edit details trigger — top-right corner */}
              <button
                type="button"
                onClick={() => setEditingDetails(comp)}
                className="absolute top-3 right-3 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors cursor-pointer"
                title="Edit competition details"
              >
                <Pencil size={16} />
              </button>

              {/* Quiniela-ready indicator under the name */}
              {comp.supportsQuiniela && (
                <span className="absolute top-3 left-14 text-[9px] font-semibold font-sans text-warning uppercase tracking-wider" title={`Quiniela format: ${comp.quinielaFormat ?? 'unset'}`}>
                  Q
                </span>
              )}
              {comp.isNationalTeamCompetition && (
                <span className="absolute top-3 left-20 text-[9px] font-semibold font-sans text-secondary uppercase tracking-wider" title="National-team competition">
                  Nat
                </span>
              )}

              {/* Logo with edit trigger */}
              <div className="relative group mb-3 mt-2">
                {displayLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayLogo} alt={comp.name} className="w-14 h-14 object-contain" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center">
                    <span className="text-lg font-semibold text-text-muted font-sans">{comp.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditingLogoId(isEditingLogo ? null : comp.id)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Edit logo"
                >
                  <Pencil size={16} className="text-white" />
                </button>
                {comp.logoCustom && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning" title="Custom logo" />}
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
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                    isFeatured ? 'bg-warning' : 'bg-surface-3',
                    !comp.active && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <span className={cn('inline-block h-3 w-3 transform rounded-full bg-background transition-transform', isFeatured ? 'translate-x-5' : 'translate-x-1')} />
                </button>
                <span className="text-[10px] text-text-muted font-sans">{isFeatured ? 'Featured' : 'Not featured'}</span>
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
