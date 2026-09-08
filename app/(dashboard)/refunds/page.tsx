'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/form-controls';
import { useToast } from '@/components/ui/ToastProvider';

type RefundStatus = 'pending' | 'approved' | 'rejected';

interface RefundCandidate {
  id: string;
  matchId: number;
  userId: string;
  userEmail: string | null;
  source: 'prediction_view' | 'combinada_view' | 'user_combinada';
  sourceRefId: string;
  originalDebitTxId: string | null;
  amount: number;
  status: RefundStatus;
  createdAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  approvedTxId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
}

interface RefundPage {
  items: RefundCandidate[];
  total: number;
  page: number;
  pageSize: number;
}

interface RefundStats {
  pendingCount: number;
  pendingCreditsSum: number;
  approvedCount: number;
  approvedCreditsSum: number;
  rejectedCount: number;
}

const statusClass: Record<RefundStatus, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-primary/15 text-primary',
  rejected: 'bg-danger/15 text-danger',
};

function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : 'unbound';
}

export default function RefundsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<RefundStatus | 'all'>('pending');
  const query = useMemo(
    () => `/admin/refunds?page=1&pageSize=100${status === 'all' ? '' : `&status=${status}`}`,
    [status],
  );

  const list = useQuery<RefundPage>({
    queryKey: ['refunds', status],
    queryFn: () => api.get(query),
  });
  const stats = useQuery<RefundStats>({
    queryKey: ['refund-stats'],
    queryFn: () => api.get('/admin/refunds/stats'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['refunds'] });
    qc.invalidateQueries({ queryKey: ['refund-stats'] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/refunds/${id}/approve`, {}),
    onSuccess: () => { toast.success('Refund approved from the original debit.'); refresh(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/refunds/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Refund candidate rejected.'); refresh(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const askReject = (row: RefundCandidate) => {
    const reason = window.prompt('Rejection reason (required):')?.trim();
    if (reason) reject.mutate({ id: row.id, reason });
  };

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Refunds"
        description="Review match-void refunds bound to their original credit debit."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Metric label="Pending" value={stats.data?.pendingCount} detail={`${stats.data?.pendingCreditsSum ?? 0} credits`} />
        <Metric label="Approved" value={stats.data?.approvedCount} detail={`${stats.data?.approvedCreditsSum ?? 0} credits`} />
        <Metric label="Rejected" value={stats.data?.rejectedCount} />
      </div>

      <SectionCard
        title="Refund candidates"
        subtitle="Approvals cannot exceed the unallocated amount of the original debit."
        info="Candidates without an original debit are legacy/unreconciled rows and stay fail-closed: reject them or regenerate after reconciliation; do not approve them as refunds."
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-full border text-xs font-sans capitalize ${status === value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-2 border-border text-text-muted'}`}
            >
              {value}
            </button>
          ))}
        </div>

        {list.isLoading ? (
          <p className="py-6 text-center text-sm text-text-muted">Loading…</p>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">No candidates in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="py-2 pr-4">Match / user</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Original debit</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data!.items.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-3 pr-4 min-w-52">
                      <p className="text-text-primary">{row.homeTeam ?? 'Match'} vs {row.awayTeam ?? `#${row.matchId}`}</p>
                      <p className="text-xs text-text-muted">{row.userEmail ?? row.userId}</p>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{row.source.replaceAll('_', ' ')}</td>
                    <td className={`py-3 pr-4 font-mono text-xs ${row.originalDebitTxId ? 'text-text-secondary' : 'text-danger'}`} title={row.originalDebitTxId ?? undefined}>
                      {shortId(row.originalDebitTxId)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-text-primary">{row.amount}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase ${statusClass[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {row.status === 'pending' && (
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            loading={approve.isPending && approve.variables === row.id}
                            disabled={!row.originalDebitTxId || reject.isPending}
                            onClick={() => approve.mutate(row.id)}
                          >
                            Approve
                          </Button>
                          <Button size="sm" variant="danger" disabled={approve.isPending || reject.isPending} onClick={() => askReject(row)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value?: number; detail?: string }) {
  return (
    <div className="rounded-2xl p-4 bg-surface-1 border border-border">
      <p className="text-xs text-text-muted font-sans">{label}</p>
      <p className="text-2xl font-bold text-text-primary font-sans">{value ?? '—'}</p>
      {detail && <p className="text-xs text-text-muted font-sans">{detail}</p>}
    </div>
  );
}
