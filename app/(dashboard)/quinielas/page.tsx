'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';

interface QuinielaSummary {
  id: string;
  competitionId: number;
  competitionName: string;
  seasonYear: string;
  name: string;
  status: string;
  tournamentStartsAt: string;
  tournamentEndsAt: string | null;
  phase1GeneratedAt: string | null;
  phase2GeneratedAt: string | null;
  settledAt: string | null;
  creditsCharged: number;
  totalPicks: number;
  settledPicks: number;
  paidUsers: number;
  createdAt: string | null;
}

interface CompetitionOption {
  id: number;
  name: string;
  country: string | null;
  supportsQuiniela: boolean;
}

export default function QuinielasPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: quinielas, isLoading } = useQuery({
    queryKey: ['quinielas'],
    queryFn: () => api.get<QuinielaSummary[]>('/admin/quinielas'),
    refetchInterval: 30_000,
  });

  const columns: Column<QuinielaSummary>[] = [
    {
      key: 'name',
      header: 'Quiniela',
      render: (row) => (
        <Link href={`/quinielas/${row.id}`} className="text-text-primary hover:text-primary font-medium">
          {row.name}
          <div className="text-xs text-text-muted mt-0.5">
            {row.competitionName} · {row.seasonYear}
          </div>
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'tournamentStartsAt',
      header: 'Starts',
      render: (row) => <span className="text-text-secondary text-xs">{formatDateTime(row.tournamentStartsAt)}</span>,
    },
    {
      key: 'picks',
      header: 'Picks',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.settledPicks}/{row.totalPicks}
        </span>
      ),
    },
    {
      key: 'paidUsers',
      header: 'Paid users',
      render: (row) => <span className="font-mono text-xs">{row.paidUsers}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => <span className="text-text-secondary text-xs">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quinielas"
        description="Tournament-level predictions (World Cup, Champions, etc.). Generate Phase 1 before kickoff and Phase 2 after the group stage."
        action={<Button variant="primary" onClick={() => setShowCreate(true)}>New quiniela</Button>}
      />

      <DataTable
        columns={columns}
        data={quinielas ?? []}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        emptyMessage="No quinielas yet. Enable supportsQuiniela on a competition and create one."
      />

      {showCreate && (
        <CreateQuinielaModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['quinielas'] });
          }}
        />
      )}
    </>
  );
}

interface CreateQuinielaModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateQuinielaModal({ onClose, onCreated }: CreateQuinielaModalProps) {
  const [competitionId, setCompetitionId] = useState<number | ''>('');
  const [seasonYear, setSeasonYear] = useState('');
  const [name, setName] = useState('');
  const [tournamentStartsAt, setTournamentStartsAt] = useState('');
  const [tournamentEndsAt, setTournamentEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: competitions } = useQuery({
    queryKey: ['competitions-for-quiniela'],
    queryFn: () => api.get<CompetitionOption[]>('/admin/competitions'),
  });

  const supported = (competitions ?? []).filter((c) => c.supportsQuiniela);

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/admin/quinielas', {
        competitionId: Number(competitionId),
        seasonYear,
        name,
        tournamentStartsAt: new Date(tournamentStartsAt).toISOString(),
        tournamentEndsAt: tournamentEndsAt ? new Date(tournamentEndsAt).toISOString() : null,
      }),
    onSuccess: onCreated,
    onError: (err: Error) => setError(err.message),
  });

  const canSubmit = competitionId !== '' && seasonYear.length > 0 && name.length > 0 && tournamentStartsAt.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary font-sans">New quiniela</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Competition</label>
            <select
              value={competitionId}
              onChange={(e) => setCompetitionId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select…</option>
              {supported.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.country ? `(${c.country})` : ''}
                </option>
              ))}
            </select>
            {supported.length === 0 && (
              <p className="text-xs text-warning mt-1">No competitions have supportsQuiniela enabled.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Season year</label>
            <input
              value={seasonYear}
              onChange={(e) => setSeasonYear(e.target.value)}
              placeholder="2026"
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="World Cup 2026"
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Tournament starts</label>
            <input
              type="datetime-local"
              value={tournamentStartsAt}
              onChange={(e) => setTournamentStartsAt(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Tournament ends (optional)</label>
            <input
              type="datetime-local"
              value={tournamentEndsAt}
              onChange={(e) => setTournamentEndsAt(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            variant="primary"
            disabled={!canSubmit}
            loading={createMut.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
