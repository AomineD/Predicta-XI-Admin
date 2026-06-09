'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/form-controls';

const REF_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'list', label: 'Referrals' },
  { id: 'abuse', label: 'Anti-abuse' },
] as const;
type RefTabId = typeof REF_TABS[number]['id'];
const DEFAULT_TAB: RefTabId = 'overview';

/* ── types ────────────────────────────────────────────────────────────────── */

interface Overview {
  totals: { total: number; pending: number; qualified: number; voided: number };
  creditsPaid: number;
  topReferrers: Array<{
    referrerId: string;
    displayName: string | null;
    email: string | null;
    qualified: number;
    pending: number;
  }>;
}

interface Abuse {
  deviceCollisions: Array<{ device: string | null; count: number }>;
  suspiciousReferrers: Array<{
    referrerId: string;
    displayName: string | null;
    pending: number;
    qualified: number;
  }>;
}

interface ReferralRow {
  id: string;
  status: string;
  source: string;
  deviceSignal: string | null;
  appCheckVerified: boolean;
  attributedAt: string | null;
  qualifiedAt: string | null;
  referrerName: string | null;
  referrerEmail: string | null;
  referredName: string | null;
  referredEmail: string | null;
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-surface-3 text-text-muted',
    qualified: 'bg-primary/15 text-primary',
    voided: 'bg-danger/15 text-danger',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans capitalize ${map[status] ?? 'bg-surface-3 text-text-muted'}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4 flex-1" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-xs text-text-muted font-sans mb-1">{label}</p>
      <p className={`text-2xl font-bold font-sans ${accent ? 'text-primary' : 'text-text-primary'}`}>{value}</p>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function ReferralsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted font-sans">Loading...</div>}>
      <ReferralsInner />
    </Suspense>
  );
}

function ReferralsInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: RefTabId = REF_TABS.some((t) => t.id === tabParam) ? (tabParam as RefTabId) : DEFAULT_TAB;
  const [tab, setTab] = useState<RefTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const overviewQ = useQuery({ queryKey: ['referrals-overview'], queryFn: () => api.get<Overview>('/admin/referrals/overview') });
  const abuseQ = useQuery({ queryKey: ['referrals-abuse'], queryFn: () => api.get<Abuse>('/admin/referrals/abuse'), enabled: tab === 'abuse' });
  const listQ = useQuery({ queryKey: ['referrals-list'], queryFn: () => api.get<ReferralRow[]>('/admin/referrals/list?limit=100'), enabled: tab === 'list' });

  const voidMut = useMutation({
    mutationFn: (id: string) => api.post(`/admin/referrals/${id}/void`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrals-list'] });
      qc.invalidateQueries({ queryKey: ['referrals-overview'] });
      qc.invalidateQueries({ queryKey: ['referrals-abuse'] });
      setVoidTarget(null);
    },
  });

  const [voidTarget, setVoidTarget] = useState<ReferralRow | null>(null);

  const o = overviewQ.data;

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title="Referrals" description="Monitor the referral program and moderate abuse. Configure amounts in Credits → Referrals." />

      <Tabs value={tab} onChange={(v) => setTab(v as RefTabId)} items={REF_TABS as unknown as { id: string; label: string }[]} />

      {/* OVERVIEW */}
      <div hidden={tab !== 'overview'} role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
        {overviewQ.isLoading && <p className="text-sm text-text-muted font-sans">Loading...</p>}
        {o && (
          <>
            <div className="flex gap-3 mb-4">
              <StatCard label="Qualified" value={o.totals.qualified} accent />
              <StatCard label="Pending" value={o.totals.pending} />
              <StatCard label="Voided" value={o.totals.voided} />
              <StatCard label="Credits paid" value={o.creditsPaid} accent />
            </div>
            <SectionCard title="Top referrers" subtitle="By qualified referrals.">
              {o.topReferrers.length === 0 ? (
                <p className="text-sm text-text-muted font-sans py-4 text-center">No referrals yet.</p>
              ) : (
                <div className="space-y-2">
                  {o.topReferrers.map((r) => (
                    <div key={r.referrerId} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-sans truncate">{r.displayName ?? '—'}</p>
                        <p className="text-xs text-text-muted font-sans truncate">{r.email ?? r.referrerId}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary font-sans flex-none">{r.qualified} ok</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-3 text-text-muted font-sans flex-none">{r.pending} pend</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>

      {/* LIST */}
      <div hidden={tab !== 'list'} role="tabpanel" id="tabpanel-list" aria-labelledby="tab-list">
        <SectionCard title="Referrals" subtitle="Newest first. Void flags a referral as abusive (does not claw back already-paid credits).">
          {listQ.isLoading && <p className="text-sm text-text-muted font-sans py-4 text-center">Loading...</p>}
          {listQ.data && listQ.data.length === 0 && <p className="text-sm text-text-muted font-sans py-4 text-center">No referrals.</p>}
          <div className="space-y-2">
            {(listQ.data ?? []).map((row) => (
              <div key={row.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusPill status={row.status} />
                    <span className="text-[10px] text-text-muted font-sans uppercase tracking-wide">{row.source}</span>
                    {row.appCheckVerified && <span className="text-[10px] text-primary font-sans">✓ attested</span>}
                  </div>
                  <p className="text-sm text-text-primary font-sans truncate">
                    {row.referrerName ?? row.referrerEmail ?? '—'} <span className="text-text-muted">→</span> {row.referredName ?? row.referredEmail ?? '—'}
                  </p>
                  <p className="text-xs text-text-muted font-sans truncate">{fmtDate(row.attributedAt)}</p>
                </div>
                {row.status !== 'voided' && (
                  <Button variant="danger" size="sm" onClick={() => setVoidTarget(row)}>Void</Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ABUSE */}
      <div hidden={tab !== 'abuse'} role="tabpanel" id="tabpanel-abuse" aria-labelledby="tab-abuse">
        {abuseQ.isLoading && <p className="text-sm text-text-muted font-sans">Loading...</p>}
        {abuseQ.data && (
          <>
            <SectionCard title="Device collisions" subtitle="Devices tied to more than one referral. Attribution blocks this, so any hit is worth reviewing.">
              {abuseQ.data.deviceCollisions.length === 0 ? (
                <p className="text-sm text-text-muted font-sans py-4 text-center">No collisions.</p>
              ) : (
                <div className="space-y-2">
                  {abuseQ.data.deviceCollisions.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <code className="text-xs text-text-secondary font-mono truncate flex-1">{c.device ?? '—'}</code>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-danger/15 text-danger font-sans flex-none">{c.count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Suspicious referrers" subtitle="Many pending referrals that never activate — a farm whose accounts never open a prediction.">
              {abuseQ.data.suspiciousReferrers.length === 0 ? (
                <p className="text-sm text-text-muted font-sans py-4 text-center">None flagged.</p>
              ) : (
                <div className="space-y-2">
                  {abuseQ.data.suspiciousReferrers.map((r) => (
                    <div key={r.referrerId} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <span className="text-sm text-text-primary font-sans truncate flex-1">{r.displayName ?? r.referrerId}</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-3 text-text-muted font-sans flex-none">{r.pending} pend</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary font-sans flex-none">{r.qualified} ok</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>

      {/* Void confirm */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setVoidTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-primary font-sans">Void referral</h3>
            <p className="text-sm text-text-secondary font-sans">
              Flag this referral as abusive. It stops counting toward milestones. Already-paid credits are NOT clawed back.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setVoidTarget(null)}>Cancel</Button>
              <Button variant="danger" size="sm" loading={voidMut.isPending} onClick={() => voidMut.mutate(voidTarget.id)}>Void</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
