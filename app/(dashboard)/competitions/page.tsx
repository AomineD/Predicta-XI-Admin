'use client';

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
  type: string | null;
  active: boolean;
}

export default function CompetitionsPage() {
  const qc = useQueryClient();

  const { data: competitions, isLoading } = useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
  });

  const syncCompetitions = useMutation({
    mutationFn: () => api.post('/admin/competitions/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
  });

  const toggleCompetition = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/admin/competitions/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
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
        {(competitions ?? []).map((comp) => (
          <div
            key={comp.id}
            className="rounded-2xl p-4 flex flex-col items-center text-center transition-colors"
            style={{
              background: '#121A2B',
              border: `1px solid ${comp.active ? 'rgba(124,255,91,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {/* Logo */}
            {comp.logoUrl ? (
              <img
                src={comp.logoUrl}
                alt={comp.name}
                className="w-14 h-14 object-contain mb-3"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center mb-3">
                <span className="text-lg font-semibold text-text-muted font-sans">
                  {comp.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}

            {/* Name */}
            <h3 className="text-sm font-medium text-text-primary font-sans mb-0.5">{comp.name}</h3>

            {/* Country */}
            <p className="text-xs text-text-muted font-sans mb-3">{comp.country ?? 'International'}</p>

            {/* Active toggle */}
            <button
              type="button"
              onClick={() => toggleCompetition.mutate({ id: comp.id, active: !comp.active })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                comp.active ? 'bg-primary' : 'bg-surface-3'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  comp.active ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs text-text-muted font-sans mt-1">
              {comp.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>

      {!isLoading && (competitions ?? []).length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm font-sans">No competitions found. Click &quot;Sync Competitions&quot; to fetch from API-Football.</p>
        </div>
      )}
    </div>
  );
}
