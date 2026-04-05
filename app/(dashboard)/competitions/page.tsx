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
}

interface PredictionConfig {
  automationEnabled: boolean;
  model: string;
  periodMinutes: number;
  batchSize: number;
  reasoningEffort: string | null;
  inputDataFields: string[];
  outputMarkets: string[];
  historicalContextEnabled: boolean;
  historicalContextCount: number;
  matchSyncEnabled: boolean;
  matchSyncIntervalHours: number;
  resultSyncEnabled: boolean;
  resultSyncIntervalHours: number;
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

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const [editingLogoId, setEditingLogoId] = useState<number | null>(null);

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

  const updateCompetition = useMutation({
    mutationFn: ({ id, ...body }: { id: number; active?: boolean; logoCustom?: string | null }) =>
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
          <Button variant="primary" loading={syncCompetitions.isPending} onClick={() => syncCompetitions.mutate()}>
            Sync Competitions
          </Button>
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
    </div>
  );
}
