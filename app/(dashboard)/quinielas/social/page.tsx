'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { QuinielaSubnav } from '@/components/quinielas/QuinielaSubnav';
import { formatDateTime } from '@/lib/utils';
import { Ban, Trophy, Users, XCircle } from 'lucide-react';

/* ── bounds (mirror of quiniela-groups.constants.ts in the backend) ────────── */

const MAX_PRIZE = 500;
const MAX_DAILY_CAP = 2000;
const MAX_CREATE_COST = 100;
const MAX_GROUP_SIZE = 1000;

const TIERS = ['free', 'premium', 'club'] as const;

/* ── inner tabs ────────────────────────────────────────────────────────────── */

const SOCIAL_TABS = [
  { id: 'config', label: 'Configuration' },
  { id: 'groups', label: 'Groups' },
  { id: 'abuse', label: 'Anti-abuse' },
] as const;
type SocialTabId = (typeof SOCIAL_TABS)[number]['id'];
const DEFAULT_TAB: SocialTabId = 'config';

/* ── types (mirror of the backend) ─────────────────────────────────────────── */

interface SocialConfig {
  id: number;
  enabled: boolean;
  createCostCompetition: number;
  createCostWeekly: number;
  prizeWinnerCredits: number;
  prizePodiumCredits: Record<string, number>;
  prizeWeeklyWinnerCredits: number;
  minRealMembersForPrize: number;
  minParticipationPctForPrize: number;
  minWeeklyPicksPctForParticipation: number;
  dailyPrizeCapPerUser: number;
  maxGroupSizeByTier: Record<string, number>;
  maxActiveGroupsByTier: Record<string, number>;
  weeklyMinMatches: number;
  weeklyMaxMatches: number;
  weeklyExactScorePoints: number;
  weeklyExactDrawPoints: number;
  weeklyCorrectOutcomePoints: number;
  maxGroupsPerCompetition: number;
  joinInterstitialEnabled: boolean;
  appCheckEnforcementMode: 'disabled' | 'monitor' | 'enforce';
}

interface GroupRow {
  id: string;
  type: 'competition' | 'weekly';
  name: string;
  status: string;
  maxMembers: number;
  prizeSettled: boolean;
  creditsCharged: number;
  joinClosesAt: string | null;
  settledAt: string | null;
  createdAt: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
}

interface GroupListResponse {
  items: GroupRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface GroupMember {
  userId: string;
  role: string;
  joinedVia: string;
  deviceSignal: string | null;
  score: number;
  rank: number | null;
  submitted: boolean;
  prizeAwarded: number;
  banned: boolean;
  displayName: string | null;
  email: string | null;
}

interface PendingRequest {
  userId: string;
  displayName: string | null;
  email: string | null;
  requestedAt: string;
}

interface GroupDetail extends GroupRow {
  inviteCode: string;
  tierAtCreation: string;
  fixtureCount: number;
  requiresApproval: boolean;
  members: GroupMember[];
  pendingRequests: PendingRequest[];
}

interface AntiAbuse {
  totalGroups: number;
  groupsByStatus: { status: string; count: number }[];
  totalMembers: number;
  prizesLast7d: { total: number; payouts: number };
  deviceCollisions: { deviceSignal: string | null; distinctUsers: number }[];
  topEarnersLast7d: { userId: string; total: number }[];
}

/* ── per-tier map editor (free/premium/club) ───────────────────────────────── */

function TierMap({
  value,
  onChange,
  min = 0,
  max,
  allowUnlimited = false,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  min?: number;
  max?: number;
  allowUnlimited?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {TIERS.map((tier) => (
        <div key={tier} className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-text-muted/70 font-sans">{tier}</span>
          <NumInput
            value={value[tier] ?? 0}
            min={allowUnlimited ? -1 : min}
            max={max}
            onChange={(v) => onChange({ ...value, [tier]: v })}
          />
        </div>
      ))}
      {allowUnlimited && <p className="basis-full text-[11px] text-text-muted/50 font-sans">-1 = unlimited</p>}
    </div>
  );
}

/* ── group status pill (local color map) ───────────────────────────────────── */

const GROUP_STATUS_STYLES: Record<string, string> = {
  open: 'bg-secondary/15 text-secondary',
  locked: 'bg-warning/15 text-warning',
  settling: 'bg-warning/15 text-warning',
  settled: 'bg-success/15 text-success',
  cancelled: 'bg-text-muted/15 text-text-muted',
};

function GroupStatusPill({ status }: { status: string }) {
  const style = GROUP_STATUS_STYLES[status] ?? 'bg-text-muted/15 text-text-muted';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide w-fit ${style}`}>
      {status}
    </span>
  );
}

/* ── page ──────────────────────────────────────────────────────────────────── */

export default function SocialQuinielaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted font-sans">Loading…</div>}>
      <SocialQuinielaInner />
    </Suspense>
  );
}

function SocialQuinielaInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: SocialTabId = SOCIAL_TABS.some((t) => t.id === tabParam) ? (tabParam as SocialTabId) : DEFAULT_TAB;
  const [tab, setTab] = useState<SocialTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const configQ = useQuery({
    queryKey: ['social-config'],
    queryFn: () => api.get<SocialConfig>('/admin/quiniela-social-config'),
  });

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Social Quiniela"
        description="Friends quiniela (groups). Enable the feature, tune costs and prizes, and moderate groups."
        action={
          configQ.data ? (
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold font-sans ${
                configQ.data.enabled ? 'bg-primary/15 text-primary' : 'bg-danger/15 text-danger'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${configQ.data.enabled ? 'bg-primary' : 'bg-danger'}`} />
              {configQ.data.enabled ? 'Enabled' : 'Disabled'}
            </span>
          ) : null
        }
      />

      <QuinielaSubnav />

      <Tabs value={tab} onChange={(v) => setTab(v as SocialTabId)} items={SOCIAL_TABS as unknown as { id: string; label: string }[]} />

      <div hidden={tab !== 'config'} role="tabpanel" id="tabpanel-config" aria-labelledby="tab-config">
        <ConfigTab />
      </div>

      <div hidden={tab !== 'groups'} role="tabpanel" id="tabpanel-groups" aria-labelledby="tab-groups">
        {tab === 'groups' && <GroupsTab />}
      </div>

      <div hidden={tab !== 'abuse'} role="tabpanel" id="tabpanel-abuse" aria-labelledby="tab-abuse">
        {tab === 'abuse' && <AntiAbuseTab />}
      </div>
    </div>
  );
}

/* ── tab: configuration + master flag ──────────────────────────────────────── */

function ConfigTab() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['social-config'],
    queryFn: () => api.get<SocialConfig>('/admin/quiniela-social-config'),
  });
  // `form` holds local edits only; while it is null we render query.data directly
  // (see `f` below). That fallback is why no effect is needed to seed the form.
  const [form, setForm] = useState<SocialConfig | null>(null);

  const mut = useMutation({
    mutationFn: (data: SocialConfig) => api.put('/admin/quiniela-social-config', data),
    onSuccess: (_res, variables) => {
      qc.setQueryData(['social-config'], variables);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['social-config'] });
    },
  });

  if (query.isLoading) return <div className="text-sm text-text-muted font-sans py-8 text-center">Loading…</div>;
  if (query.error) return <div className="text-sm text-danger font-sans py-8 text-center">{(query.error as Error).message}</div>;

  const f = form ?? query.data;
  if (!f) return null;
  const set = <K extends keyof SocialConfig>(key: K, val: SocialConfig[K]) => setForm({ ...f, [key]: val });
  const dirty = JSON.stringify(f) !== JSON.stringify(query.data);

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="primary" size="sm" loading={mut.isPending} disabled={!dirty} onClick={() => mut.mutate(f)}>
          Save configuration
        </Button>
      </div>

      <SectionCard
        title="Master feature"
        subtitle="Enables or disables the social quiniela across the app. When off, the app hides the entry points (button in Predicta) via /app-config."
      >
        <Field label="Social quiniela enabled" subtitle="Master flag (groupsEnabled)">
          <Toggle value={f.enabled} onChange={(v) => set('enabled', v)} />
        </Field>
        <Field label="Join interstitial" subtitle="Show an interstitial ad when a guest joins a group">
          <Toggle value={f.joinInterstitialEnabled} onChange={(v) => set('joinInterstitialEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard title="Creation costs" subtitle="Credits the owner pays to create a group (free for premium+ per entitlement logic)">
        <Field label="Weekly group" subtitle="weekly mode">
          <NumInput value={f.createCostWeekly} onChange={(v) => set('createCostWeekly', v)} max={MAX_CREATE_COST} />
        </Field>
        <Field label="Competition group" subtitle="competition mode">
          <NumInput value={f.createCostCompetition} onChange={(v) => set('createCostCompetition', v)} max={MAX_CREATE_COST} />
        </Field>
      </SectionCard>

      <SectionCard title="Competition prizes (house-funded)" subtitle="Awarded when a competition group settles — full podium. Per-prize cap: 500.">
        <Field label="Winner (1st place)">
          <NumInput value={f.prizeWinnerCredits} onChange={(v) => set('prizeWinnerCredits', v)} max={MAX_PRIZE} />
        </Field>
        <Field label="2nd place">
          <NumInput value={f.prizePodiumCredits['2'] ?? 0} onChange={(v) => set('prizePodiumCredits', { ...f.prizePodiumCredits, '2': v })} max={MAX_PRIZE} />
        </Field>
        <Field label="3rd place">
          <NumInput value={f.prizePodiumCredits['3'] ?? 0} onChange={(v) => set('prizePodiumCredits', { ...f.prizePodiumCredits, '3': v })} max={MAX_PRIZE} />
        </Field>
      </SectionCard>

      <SectionCard title="Weekly prize (house-funded)" subtitle="Awarded when a weekly group settles. Weekly pays the winner only — usually less than a competition run. Per-prize cap: 500.">
        <Field label="Winner (1st place)">
          <NumInput value={f.prizeWeeklyWinnerCredits} onChange={(v) => set('prizeWeeklyWinnerCredits', v)} max={MAX_PRIZE} />
        </Field>
      </SectionCard>

      <SectionCard title="Anti-abuse" subtitle="Defense against prize farming">
        <Field label="Minimum real members" subtitle="Real members required for a group to pay a prize (1–1000)">
          <NumInput value={f.minRealMembersForPrize} onChange={(v) => set('minRealMembersForPrize', v)} min={1} max={MAX_GROUP_SIZE} />
        </Field>
        <Field
          label="Minimum participation %"
          subtitle="Share of the group that must actually play to count toward the prize gate. 0–100; 0 disables. Default 60."
        >
          <NumInput value={f.minParticipationPctForPrize} onChange={(v) => set('minParticipationPctForPrize', v)} min={0} max={100} />
        </Field>
        <Field
          label="Weekly: picks % to count as played"
          subtitle="Weekly groups close one day at a time, so a member counts as having played once they predict this share of the week's matches (“the majority”), not all of them — otherwise missing one day makes the gate unreachable. Floor of 1 pick. Competition still needs every category. 0–100; default 50."
        >
          <NumInput value={f.minWeeklyPicksPctForParticipation} onChange={(v) => set('minWeeklyPicksPctForParticipation', v)} min={0} max={100} />
        </Field>
        <Field label="Daily prize cap per user" subtitle="Max prize credits a user can earn per day (cap: 2000)">
          <NumInput value={f.dailyPrizeCapPerUser} onChange={(v) => set('dailyPrizeCapPerUser', v)} max={MAX_DAILY_CAP} />
        </Field>
        <Field label="Max groups per competition" subtitle="Max competition groups a user can join per tournament. -1 = unlimited">
          <NumInput value={f.maxGroupsPerCompetition} onChange={(v) => set('maxGroupsPerCompetition', v)} min={-1} max={50} />
        </Field>
        <Field
          label="App Check enforcement"
          subtitle="Anti-spoofing for the prize gate. disabled = ignore App Check; monitor = verify & record adoption, gate counts all; enforce = prize gate counts only members who joined from a genuine app (Play Integrity / App Attest). Roll out: release the app → monitor → enforce."
        >
          <select
            value={f.appCheckEnforcementMode}
            onChange={(e) => set('appCheckEnforcementMode', e.target.value as SocialConfig['appCheckEnforcementMode'])}
            className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          >
            <option value="disabled">disabled</option>
            <option value="monitor">monitor</option>
            <option value="enforce">enforce</option>
          </select>
        </Field>
      </SectionCard>

      <SectionCard title="Limits by tier" subtitle="Group size and active-group count by the owner's tier. -1 = unlimited.">
        <Field label="Max group size">
          <TierMap value={f.maxGroupSizeByTier} onChange={(v) => set('maxGroupSizeByTier', v)} min={1} max={MAX_GROUP_SIZE} allowUnlimited />
        </Field>
        <Field label="Max active groups">
          <TierMap value={f.maxActiveGroupsByTier} onChange={(v) => set('maxActiveGroupsByTier', v)} max={MAX_GROUP_SIZE} allowUnlimited />
        </Field>
      </SectionCard>

      <SectionCard title="Weekly quiniela" subtitle="Range of matches the owner can pick when building a weekly group (1–50)">
        <Field label="Minimum matches">
          <NumInput value={f.weeklyMinMatches} onChange={(v) => set('weeklyMinMatches', v)} min={1} max={50} />
        </Field>
        <Field label="Maximum matches">
          <NumInput value={f.weeklyMaxMatches} onChange={(v) => set('weeklyMaxMatches', v)} min={1} max={50} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Weekly scoring (points)"
        subtitle="Layered “marcador por capas” points for weekly groups. A wrong 1X2 is always 0 (not configurable). The app shows these in its “Cómo se puntúa” legend (read from /app-config). Range 0–100."
      >
        <Field label="Exact scoreline (winner)" subtitle="Exact result with a winner, e.g. 2-1">
          <NumInput value={f.weeklyExactScorePoints} onChange={(v) => set('weeklyExactScorePoints', v)} min={0} max={100} />
        </Field>
        <Field label="Exact draw" subtitle="Exact tied scoreline, e.g. 1-1 or 0-0. Set higher than the exact win to reward it as a draw bonus.">
          <NumInput value={f.weeklyExactDrawPoints} onChange={(v) => set('weeklyExactDrawPoints', v)} min={0} max={100} />
        </Field>
        <Field label="Correct outcome (1X2 only)" subtitle="Right 1X2 but wrong scoreline">
          <NumInput value={f.weeklyCorrectOutcomePoints} onChange={(v) => set('weeklyCorrectOutcomePoints', v)} min={0} max={100} />
        </Field>
      </SectionCard>

      {mut.error && <p className="text-sm text-danger font-sans mt-2">{(mut.error as Error).message}</p>}
    </>
  );
}

/* ── tab: group moderation ─────────────────────────────────────────────────── */

const STATUS_FILTERS = ['', 'open', 'locked', 'settling', 'settled', 'cancelled'];
const TYPE_FILTERS = ['', 'weekly', 'competition'];

function GroupsTab() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const pageSize = 20;

  const listQ = useQuery({
    queryKey: ['admin-groups', status, type, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      return api.get<GroupListResponse>(`/admin/groups?${params.toString()}`);
    },
  });

  const data = listQ.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
        >
          {TYPE_FILTERS.map((t) => (
            <option key={t} value={t}>{t || 'All types'}</option>
          ))}
        </select>
        {data && <span className="text-xs text-text-muted font-sans ml-auto">{data.total} groups</span>}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table className="w-full text-sm font-sans">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Group', 'Type', 'Status', 'Members', 'Credits', 'Created', ''].map((h, i) => (
                <th key={h || `col-${i}`} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">Loading…</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No groups match these filters.</td></tr>
            ) : (
              data.items.map((g) => (
                <tr
                  key={g.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  onClick={() => setDetailId(g.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1F2A40')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3 text-text-primary">
                    <span className="font-medium">{g.name}</span>
                    <div className="text-xs text-text-muted mt-0.5">{g.ownerName ?? g.ownerEmail ?? g.ownerId}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs uppercase">{g.type}</td>
                  <td className="px-4 py-3"><GroupStatusPill status={g.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{g.memberCount}/{g.maxMembers}</td>
                  <td className="px-4 py-3 font-mono text-xs">{g.creditsCharged}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{formatDateTime(g.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-xs text-primary">View</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-text-muted font-sans">Page {page} / {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {detailId && <GroupDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function GroupDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirmVoid, setConfirmVoid] = useState(false);

  const detailQ = useQuery({
    queryKey: ['admin-group', id],
    queryFn: () => api.get<GroupDetail>(`/admin/groups/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-group', id] });
    qc.invalidateQueries({ queryKey: ['admin-groups'] });
  };

  const voidMut = useMutation({
    mutationFn: () => api.post<{ voided: boolean; refunded: number }>(`/admin/groups/${id}/void`),
    onSuccess: () => { setConfirmVoid(false); invalidate(); },
  });

  const banMut = useMutation({
    mutationFn: (userId: string) => api.post<{ banned: boolean }>(`/admin/groups/${id}/members/${userId}/ban`),
    onSuccess: invalidate,
  });

  const rejectMut = useMutation({
    mutationFn: (userId: string) => api.post<{ rejected: boolean }>(`/admin/groups/${id}/requests/${userId}/reject`),
    onSuccess: invalidate,
  });

  const g = detailQ.data;
  const canVoid = g && g.status !== 'settled' && g.status !== 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6 space-y-5"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {detailQ.isLoading || !g ? (
          <div className="text-sm text-text-muted font-sans py-8 text-center">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-text-primary font-sans">{g.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <GroupStatusPill status={g.status} />
                  <span className="text-xs text-text-muted uppercase font-sans">{g.type}</span>
                  {g.prizeSettled && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-sans">
                      <Trophy size={12} /> prizes paid
                    </span>
                  )}
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3">
                <XCircle size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Meta label="Owner" value={g.ownerName ?? g.ownerEmail ?? g.ownerId} />
              <Meta label="Invite code" value={g.inviteCode} mono />
              <Meta label="Tier at creation" value={g.tierAtCreation} />
              <Meta label="Credits charged" value={String(g.creditsCharged)} mono />
              <Meta label="Matches / categories" value={String(g.fixtureCount)} mono />
              <Meta label="Approval gate" value={g.requiresApproval ? 'On (owner approves)' : 'Off (instant join)'} />
              <Meta label="Join closes" value={formatDateTime(g.joinClosesAt)} />
              <Meta label="Created" value={formatDateTime(g.createdAt)} />
              <Meta label="Settled" value={formatDateTime(g.settledAt)} />
            </div>

            {g.pendingRequests.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-warning" />
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
                    Pending requests ({g.pendingRequests.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {g.pendingRequests.map((r) => (
                    <div
                      key={r.userId}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-text-primary font-medium truncate">{r.displayName ?? r.email ?? r.userId}</span>
                        <div className="text-[11px] text-text-muted font-sans mt-0.5">requested {formatDateTime(r.requestedAt)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => rejectMut.mutate(r.userId)}
                        disabled={rejectMut.isPending}
                        title="Reject request"
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                      >
                        <XCircle size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-text-muted" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
                  Members ({g.members.length})
                </span>
              </div>
              <div className="space-y-2">
                {g.members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center gap-3 rounded-xl p-3"
                    style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)', opacity: m.banned ? 0.5 : 1 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary font-medium truncate">{m.displayName ?? m.email ?? m.userId}</span>
                        {m.role === 'owner' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary font-sans">OWNER</span>
                        )}
                        {m.banned && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-danger/15 text-danger font-sans">BANNED</span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-muted font-sans mt-0.5">
                        via {m.joinedVia} · {m.submitted ? 'submitted' : 'no picks'}
                        {m.deviceSignal ? ` · dev ${m.deviceSignal.slice(0, 8)}…` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="font-mono text-xs text-text-primary">{m.score} pts{m.rank ? ` · #${m.rank}` : ''}</div>
                      {m.prizeAwarded > 0 && <div className="font-mono text-[11px] text-primary">+{m.prizeAwarded} cr</div>}
                    </div>
                    {m.role !== 'owner' && !m.banned && (
                      <button
                        type="button"
                        onClick={() => banMut.mutate(m.userId)}
                        disabled={banMut.isPending}
                        title="Ban member"
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                      >
                        <Ban size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {(voidMut.error || banMut.error || rejectMut.error) && (
              <p className="text-sm text-danger font-sans">{((voidMut.error ?? banMut.error ?? rejectMut.error) as Error).message}</p>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-[11px] text-text-muted/60 font-sans">
                Voiding cancels the group and refunds the owner the credits charged.
              </p>
              {canVoid && !confirmVoid && (
                <Button variant="danger" size="sm" onClick={() => setConfirmVoid(true)}>Void group</Button>
              )}
              {canVoid && confirmVoid && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmVoid(false)}>Cancel</Button>
                  <Button variant="danger" size="sm" loading={voidMut.isPending} onClick={() => voidMut.mutate()}>
                    Confirm void
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wider text-text-muted/70 font-sans mb-0.5">{label}</span>
      <span className={`text-sm text-text-primary ${mono ? 'font-mono text-xs' : 'font-sans'}`}>{value}</span>
    </div>
  );
}

/* ── tab: anti-abuse ───────────────────────────────────────────────────────── */

function AntiAbuseTab() {
  const q = useQuery({
    queryKey: ['admin-groups-anti-abuse'],
    queryFn: () => api.get<AntiAbuse>('/admin/groups/anti-abuse'),
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <div className="text-sm text-text-muted font-sans py-8 text-center">Loading…</div>;
  if (q.error) return <div className="text-sm text-danger font-sans py-8 text-center">{(q.error as Error).message}</div>;
  const d = q.data;
  if (!d) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Total groups" value={d.totalGroups} />
        <Stat label="Total members" value={d.totalMembers} />
        <Stat label="Prizes 7d (cr)" value={d.prizesLast7d.total} accent />
        <Stat label="Payouts 7d" value={d.prizesLast7d.payouts} />
      </div>

      <SectionCard title="Groups by status">
        <div className="flex flex-wrap gap-2">
          {d.groupsByStatus.length === 0 && <span className="text-sm text-text-muted font-sans">No data.</span>}
          {d.groupsByStatus.map((s) => (
            <span key={s.status} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2 border border-border">
              <GroupStatusPill status={s.status} />
              <span className="font-mono text-xs text-text-primary">{s.count}</span>
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Device collisions"
        subtitle="Same device used by more than one distinct user: possible collusion / sockpuppets."
      >
        {d.deviceCollisions.length === 0 ? (
          <p className="text-sm text-text-muted font-sans">No collisions detected.</p>
        ) : (
          <div className="space-y-2">
            {d.deviceCollisions.map((c) => (
              <div key={c.deviceSignal ?? 'null'} className="flex items-center justify-between rounded-xl p-3 bg-surface-2 border border-border">
                <span className="font-mono text-xs text-text-secondary truncate">{c.deviceSignal ?? '—'}</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning font-sans">
                  {c.distinctUsers} users
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Top earners (7 days)"
        subtitle="Users with the most prize credits earned in the last week: possible farmers."
      >
        {d.topEarnersLast7d.length === 0 ? (
          <p className="text-sm text-text-muted font-sans">No prizes paid in the last 7 days.</p>
        ) : (
          <div className="space-y-2">
            {d.topEarnersLast7d.map((e, i) => (
              <div key={e.userId} className="flex items-center justify-between rounded-xl p-3 bg-surface-2 border border-border">
                <span className="font-mono text-xs text-text-secondary truncate">
                  <span className="text-text-muted mr-2">#{i + 1}</span>{e.userId}
                </span>
                <span className="font-mono text-xs font-semibold text-primary">+{e.total} cr</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="block text-[11px] uppercase tracking-wider text-text-muted/70 font-sans mb-1">{label}</span>
      <span className={`text-2xl font-bold font-sans ${accent ? 'text-primary' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}
