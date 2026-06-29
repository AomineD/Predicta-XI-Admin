'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import { ArrowLeft, Pencil, UserPlus, Trophy, XCircle, AlertTriangle } from 'lucide-react';

/* ── types (mirror of the backend GroupPicksMatrix) ────────────────────────── */

interface Fixture {
  fixtureKey: string;
  home: string | null;
  away: string | null;
  label: string;
  kickoffAt: string | null;
  status: string | null;
  finished: boolean;
  result: { home: number; away: number } | null;
  editable: boolean;
  // ── Knockout-only ──
  matchId?: number;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  roundLabel?: string;
  regResult?: { home: number; away: number } | null;
  penResult?: { home: number; away: number } | null;
  advancerTeamId?: number | null;
  canSetResult?: boolean;
}

interface Pick {
  selection: Record<string, unknown>;
  settlement: string;
  points: number;
}

interface Member {
  userId: string;
  displayName: string | null;
  email: string | null;
  role: string;
  banned: boolean;
  submitted: boolean;
  score: number;
  rank: number | null;
  picks: Record<string, Pick>;
}

interface PicksMatrix {
  groupId: string;
  name: string;
  type: string;
  status: string;
  inviteCode: string;
  editable: boolean;
  fixtures: Fixture[];
  members: Member[];
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

const SETTLEMENT_STYLE: Record<string, string> = {
  won: 'text-success',
  partial: 'text-warning',
  lost: 'text-danger',
  void: 'text-text-muted line-through',
  pending: 'text-text-primary',
};

/** Render a stored selection: weekly scoreline or a competition team/player name. */
function formatSelection(sel: Record<string, unknown> | undefined): string | null {
  if (!sel) return null;
  const h = sel.homeGoals;
  const a = sel.awayGoals;
  if (typeof h === 'number' && typeof a === 'number') return `${h}-${a}`;
  if (typeof sel.name === 'string') return sel.name;
  if (typeof sel.playerName === 'string') return sel.playerName;
  return JSON.stringify(sel);
}

/** Render a knockout "who advances" pick: maps the picked teams.id back to the
 *  tie's home/away name. Falls back to the generic renderer for other shapes. */
function formatKnockoutSelection(sel: Record<string, unknown> | undefined, f: Fixture): string | null {
  if (!sel) return null;
  const id = sel.advancingTeamId;
  if (typeof id === 'number') {
    if (id === f.homeTeamId) return f.home;
    if (id === f.awayTeamId) return f.away;
    return `#${id}`;
  }
  return formatSelection(sel);
}

/** Name of the team that advances from a knockout tie, for the column header. */
function advancerName(f: Fixture): string | null {
  if (f.advancerTeamId == null) return null;
  if (f.advancerTeamId === f.homeTeamId) return f.home;
  if (f.advancerTeamId === f.awayTeamId) return f.away;
  return null;
}

const GROUP_STATUS_STYLES: Record<string, string> = {
  open: 'bg-secondary/15 text-secondary',
  locked: 'bg-warning/15 text-warning',
  settling: 'bg-warning/15 text-warning',
  settled: 'bg-success/15 text-success',
  cancelled: 'bg-text-muted/15 text-text-muted',
};

function StatusPill({ status }: { status: string }) {
  const style = GROUP_STATUS_STYLES[status] ?? 'bg-text-muted/15 text-text-muted';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide ${style}`}>
      {status}
    </span>
  );
}

/* ── page ──────────────────────────────────────────────────────────────────── */

export default function GroupPicksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editor, setEditor] = useState<{ userId?: string; label: string } | null>(null);
  const [koEditor, setKoEditor] = useState<Fixture | null>(null);
  const [koPicksEditor, setKoPicksEditor] = useState<{ userId?: string; label: string } | null>(null);

  const picksQ = useQuery({
    queryKey: ['admin-group-picks', id],
    queryFn: () => api.get<PicksMatrix>(`/admin/groups/${id}/picks`),
    refetchInterval: 30_000,
  });

  const data = picksQ.data;
  const isKnockout = data?.type === 'knockout';
  // Las llaves se pueden forzar mientras el grupo no haya cerrado/liquidado (a
  // diferencia del submit del usuario, el admin ignora el lock por cruce).
  const knockoutEditable = isKnockout && (data?.status === 'open' || data?.status === 'locked');

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/quinielas/social?tab=groups"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary font-sans transition-colors"
        >
          <ArrowLeft size={14} /> Volver a grupos
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary font-sans">{data?.name ?? 'Picks del grupo'}</h1>
          {data && (
            <div className="flex items-center gap-2 mt-2">
              <StatusPill status={data.status} />
              <span className="text-xs text-text-muted uppercase font-sans">{data.type}</span>
              <span className="text-xs text-text-muted font-sans">·</span>
              <span className="text-xs font-mono text-text-secondary">{data.inviteCode}</span>
              <span className="text-xs text-text-muted font-sans">· {data.members.length} miembros</span>
            </div>
          )}
        </div>
        {data && data.editable && (
          <Button variant="primary" size="sm" onClick={() => setEditor({ label: 'Agregar usuario / cargar picks' })}>
            <UserPlus size={15} /> Forzar / agregar usuario
          </Button>
        )}
        {data && knockoutEditable && (
          <Button variant="primary" size="sm" onClick={() => setKoPicksEditor({ label: 'Agregar usuario / cargar picks' })}>
            <UserPlus size={15} /> Forzar / agregar usuario
          </Button>
        )}
      </div>

      {picksQ.isLoading && <div className="text-sm text-text-muted font-sans py-12 text-center">Cargando…</div>}
      {picksQ.error && (
        <div className="text-sm text-danger font-sans py-12 text-center">{(picksQ.error as Error).message}</div>
      )}

      {data && !data.editable && data.type === 'weekly' && (
        <div className="flex items-center gap-2 mb-4 rounded-xl px-4 py-3 bg-warning/10 border border-warning/20">
          <AlertTriangle size={15} className="text-warning flex-none" />
          <span className="text-xs text-warning font-sans">
            Este grupo ya está {data.status}; no se pueden forzar picks (la quiniela se está liquidando o ya cerró).
          </span>
        </div>
      )}
      {isKnockout && (
        <div className="flex items-center gap-2 mb-4 rounded-xl px-4 py-3 bg-primary/10 border border-primary/20">
          <Trophy size={15} className="text-primary flex-none" />
          <span className="text-xs text-text-secondary font-sans">
            Quiniela de eliminatorias. Puedes <strong className="text-text-primary">colocar o corregir el resultado</strong> de
            cada cruce desde su columna (botón <strong className="text-text-primary">Resultado</strong>), y{' '}
            <strong className="text-text-primary">forzar/cargar los picks</strong> de un miembro desde su lápiz —{' '}
            <strong className="text-text-primary">incluso si el cruce ya empezó o terminó</strong> (cuando el update no
            llegó a tiempo a todos). Todo liquida los puntos al instante.
          </span>
        </div>
      )}
      {data && data.type !== 'weekly' && !isKnockout && (
        <div className="flex items-center gap-2 mb-4 rounded-xl px-4 py-3 bg-surface-2 border border-border">
          <AlertTriangle size={15} className="text-text-muted flex-none" />
          <span className="text-xs text-text-muted font-sans">
            Vista de solo lectura. Forzar/editar picks solo está disponible para quinielas semanales (marcadores).
          </span>
        </div>
      )}

      {data && (
        <PicksMatrixTable
          data={data}
          onEditMember={(m) => {
            const t = { userId: m.userId, label: m.displayName ?? m.email ?? m.userId };
            if (isKnockout) setKoPicksEditor(t);
            else setEditor(t);
          }}
          onSetResult={isKnockout ? (f) => setKoEditor(f) : undefined}
        />
      )}

      {editor && data && (
        <ForcePicksModal
          groupId={id}
          target={editor}
          fixtures={data.fixtures}
          existing={data.members.find((m) => m.userId === editor.userId)}
          onClose={() => setEditor(null)}
        />
      )}

      {koPicksEditor && data && (
        <ForceKnockoutPicksModal
          groupId={id}
          target={koPicksEditor}
          fixtures={data.fixtures}
          existing={data.members.find((m) => m.userId === koPicksEditor.userId)}
          onClose={() => setKoPicksEditor(null)}
        />
      )}

      {koEditor && (
        <SetKnockoutResultModal groupId={id} fixture={koEditor} onClose={() => setKoEditor(null)} />
      )}
    </div>
  );
}

/* ── matrix table ──────────────────────────────────────────────────────────── */

function PicksMatrixTable({
  data,
  onEditMember,
  onSetResult,
}: {
  data: PicksMatrix;
  onEditMember: (m: Member) => void;
  onSetResult?: (f: Fixture) => void;
}) {
  if (data.fixtures.length === 0) {
    return <div className="text-sm text-text-muted font-sans py-12 text-center">Este grupo no tiene partidos/categorías.</div>;
  }
  if (data.members.length === 0) {
    return <div className="text-sm text-text-muted font-sans py-12 text-center">Aún no hay miembros.</div>;
  }

  const canEditAny =
    data.editable || (data.type === 'knockout' && (data.status === 'open' || data.status === 'locked'));

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="overflow-x-auto">
        <table className="text-sm font-sans border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th
                className="sticky left-0 z-10 px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider min-w-[200px]"
                style={{ background: '#121A2B' }}
              >
                Miembro
              </th>
              {data.fixtures.map((f) => {
                const adv = onSetResult ? advancerName(f) : null;
                return (
                  <th key={f.fixtureKey} className="px-3 py-2 text-center text-xs font-medium text-text-secondary min-w-[140px] align-bottom">
                    {f.roundLabel && (
                      <div className="text-[9px] uppercase tracking-wider text-text-muted/70 font-semibold mb-0.5">{f.roundLabel}</div>
                    )}
                    <div className="font-semibold text-text-primary leading-tight">{f.home ?? f.label}</div>
                    {f.away != null && <div className="text-text-muted leading-tight">{f.away}</div>}
                    <div className="mt-1 text-[10px] text-text-muted/70 font-normal normal-case">
                      {f.finished && f.result ? (
                        <span className="text-success font-semibold">
                          {f.status === 'PEN' ? 'Pen' : f.status === 'AET' ? 'Pró' : 'FT'} {f.result.home}-{f.result.away}
                        </span>
                      ) : f.kickoffAt ? (
                        formatDateTime(f.kickoffAt)
                      ) : (
                        f.status ?? ''
                      )}
                    </div>
                    {adv && <div className="mt-0.5 text-[10px] text-primary font-semibold normal-case">Avanza: {adv}</div>}
                    {onSetResult && f.canSetResult && (
                      <button
                        type="button"
                        onClick={() => onSetResult(f)}
                        title="Colocar / corregir el resultado de este cruce"
                        className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors normal-case"
                      >
                        <Pencil size={11} /> Resultado
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.userId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: m.banned ? 0.5 : 1 }}>
                <td className="sticky left-0 z-10 px-4 py-3 min-w-[200px]" style={{ background: '#121A2B' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium truncate max-w-[140px]">{m.displayName ?? m.email ?? m.userId}</span>
                    {m.role === 'owner' && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/15 text-primary">OWNER</span>
                    )}
                    {m.banned && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-danger/15 text-danger">BAN</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-text-muted">
                      {m.score} pts{m.rank ? ` · #${m.rank}` : ''}
                    </span>
                    {m.submitted ? (
                      <span className="text-[10px] text-success">jugó</span>
                    ) : (
                      <span className="text-[10px] text-text-muted/70">incompleto</span>
                    )}
                    {canEditAny && (
                      <button
                        type="button"
                        onClick={() => onEditMember(m)}
                        title="Forzar / editar picks de este usuario"
                        className="ml-auto p-1 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                </td>
                {data.fixtures.map((f) => {
                  const pick = m.picks[f.fixtureKey];
                  const text = data.type === 'knockout'
                    ? formatKnockoutSelection(pick?.selection, f)
                    : formatSelection(pick?.selection);
                  const color = pick ? SETTLEMENT_STYLE[pick.settlement] ?? 'text-text-primary' : 'text-text-muted/40';
                  return (
                    <td key={f.fixtureKey} className="px-3 py-3 text-center align-middle">
                      <span className={`font-mono ${color}`}>{text ?? '—'}</span>
                      {pick && pick.points > 0 && (
                        <span className="block text-[10px] text-primary font-semibold">+{pick.points}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── force/edit modal ──────────────────────────────────────────────────────── */

interface ScoreDraft {
  home: string;
  away: string;
}

function ForcePicksModal({
  groupId,
  target,
  fixtures,
  existing,
  onClose,
}: {
  groupId: string;
  target: { userId?: string; label: string };
  fixtures: Fixture[];
  existing: Member | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isAdd = !target.userId;
  const [email, setEmail] = useState('');

  // Only non-finished weekly fixtures can be forced.
  const editable = useMemo(() => fixtures.filter((f) => f.editable), [fixtures]);

  const [draft, setDraft] = useState<Record<string, ScoreDraft>>(() => {
    const init: Record<string, ScoreDraft> = {};
    for (const f of editable) {
      const sel = existing?.picks[f.fixtureKey]?.selection;
      const h = sel?.homeGoals;
      const a = sel?.awayGoals;
      init[f.fixtureKey] = {
        home: typeof h === 'number' ? String(h) : '',
        away: typeof a === 'number' ? String(a) : '',
      };
    }
    return init;
  });

  const setScore = (key: string, side: 'home' | 'away', value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [side]: value.replace(/[^0-9]/g, '').slice(0, 2) } }));

  const picksToSend = useMemo(() => {
    const out: { fixtureKey: string; selection: { homeGoals: number; awayGoals: number } }[] = [];
    for (const f of editable) {
      const d = draft[f.fixtureKey];
      if (d && d.home !== '' && d.away !== '') {
        out.push({ fixtureKey: f.fixtureKey, selection: { homeGoals: Number(d.home), awayGoals: Number(d.away) } });
      }
    }
    return out;
  }, [draft, editable]);

  const mut = useMutation({
    mutationFn: () =>
      api.put<{ memberAdded: boolean; picksSet: number; submitted: boolean }>(`/admin/groups/${groupId}/picks`, {
        ...(target.userId ? { userId: target.userId } : { email: email.trim() }),
        picks: picksToSend,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-group-picks', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-group', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      onClose();
    },
  });

  const canSave = picksToSend.length > 0 && (target.userId || email.trim().length > 3) && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary font-sans">Forzar marcadores</h3>
            <p className="text-xs text-text-muted font-sans mt-0.5">
              {isAdd ? 'Carga los picks de un usuario que no alcanzó a predecir.' : target.label}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3">
            <XCircle size={20} />
          </button>
        </div>

        {isAdd && (
          <div>
            <label className="block text-xs text-text-muted font-sans mb-1">Email del usuario</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amigo@gmail.com"
              className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
            />
            <p className="text-[11px] text-text-muted/60 font-sans mt-1">
              Debe ser una cuenta existente. Si aún no es miembro del grupo, se agrega automáticamente.
            </p>
          </div>
        )}

        {editable.length === 0 ? (
          <p className="text-sm text-text-muted font-sans py-6 text-center">
            No hay partidos editables: todos ya terminaron o el grupo cerró.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted/70 font-sans uppercase tracking-wider">
              Marcadores (deja vacío para no tocar)
            </p>
            {editable.map((f) => {
              const d = draft[f.fixtureKey];
              return (
                <div
                  key={f.fixtureKey}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{f.home} vs {f.away}</div>
                    {f.kickoffAt && <div className="text-[10px] text-text-muted/70 font-sans">{formatDateTime(f.kickoffAt)}</div>}
                  </div>
                  <input
                    inputMode="numeric"
                    value={d?.home ?? ''}
                    onChange={(e) => setScore(f.fixtureKey, 'home', e.target.value)}
                    className="h-9 w-12 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
                  />
                  <span className="text-text-muted">-</span>
                  <input
                    inputMode="numeric"
                    value={d?.away ?? ''}
                    onChange={(e) => setScore(f.fixtureKey, 'away', e.target.value)}
                    className="h-9 w-12 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
                  />
                </div>
              );
            })}
          </div>
        )}

        {mut.error && <p className="text-sm text-danger font-sans">{(mut.error as Error).message}</p>}

        <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[11px] text-text-muted/60 font-sans inline-flex items-center gap-1">
            <Trophy size={12} /> {picksToSend.length} marcador(es) a guardar
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" size="sm" loading={mut.isPending} disabled={!canSave} onClick={() => mut.mutate()}>
              Guardar picks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── knockout result modal ─────────────────────────────────────────────────── */

/** Two number inputs "H - A" for the 90' scoreline. */
function ScoreRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ScoreDraft;
  onChange: (side: 'home' | 'away', v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0 text-sm text-text-primary">{label}</div>
      <input
        inputMode="numeric"
        value={value.home}
        onChange={(e) => onChange('home', e.target.value)}
        className="h-9 w-12 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
      />
      <span className="text-text-muted">-</span>
      <input
        inputMode="numeric"
        value={value.away}
        onChange={(e) => onChange('away', e.target.value)}
        className="h-9 w-12 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
      />
    </div>
  );
}

/**
 * Coloca/corrige el resultado de un cruce KO con el MISMO modelo que la app:
 * marcador de 90′ + quién avanza + si fue a prórroga/penales (switches, no
 * marcadores). Empate a 90′ ⇒ prórroga implícita; los penales la implican.
 */
function SetKnockoutResultModal({
  groupId,
  fixture,
  onClose,
}: {
  groupId: string;
  fixture: Fixture;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const num = (n: number | undefined | null) => (typeof n === 'number' ? String(n) : '');
  const [reg, setReg] = useState<ScoreDraft>(() => ({
    home: num(fixture.regResult?.home ?? (fixture.status === 'FT' ? fixture.result?.home : undefined)),
    away: num(fixture.regResult?.away ?? (fixture.status === 'FT' ? fixture.result?.away : undefined)),
  }));
  // Quién avanza (lo decide la prórroga/penales en un empate). Precarga el actual.
  const [advancingTeamId, setAdvancingTeamId] = useState<number | null>(fixture.advancerTeamId ?? null);
  // ¿Se definió en penales? Solo aplica con empate a 90′.
  const [penalties, setPenalties] = useState<boolean>(fixture.status === 'PEN');
  // Cuando se corrige un grupo YA liquidado: se recalculan los puntos pero NO los
  // premios ya pagados. Mantenemos el modal abierto con un aviso (no cierra en seco).
  const [settledNotice, setSettledNotice] = useState(false);

  const clamp = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 2);
  const setScore = (side: 'home' | 'away', v: string) => setReg((d) => ({ ...d, [side]: clamp(v) }));

  const parse = (v: string) => (v === '' ? NaN : Number(v));
  const rH = parse(reg.home);
  const rA = parse(reg.away);
  const bothFilled = !Number.isNaN(rH) && !Number.isNaN(rA);
  const isDraw = bothFilled && rH === rA;
  const hasWinner = bothFilled && rH !== rA;

  // Con ganador a los 90′ el que avanza ES el ganador (forzado). Con empate, lo
  // decide la prórroga/penales y lo elige el admin con los chips.
  const winnerTeamId: number | null = hasWinner
    ? (rH > rA ? fixture.homeTeamId ?? null : fixture.awayTeamId ?? null)
    : null;
  const effectiveAdvancer = hasWinner ? winnerTeamId : advancingTeamId;

  let error: string | null = null;
  if (!bothFilled) error = 'Ingresa el marcador de los 90′.';
  else if (isDraw && effectiveAdvancer == null) error = 'Elige quién avanza.';

  const stage = hasWinner ? 'en los 90′' : penalties ? 'en los penales' : 'en la prórroga';
  const advancerLabel =
    effectiveAdvancer == null
      ? null
      : effectiveAdvancer === fixture.homeTeamId
        ? fixture.home
        : effectiveAdvancer === fixture.awayTeamId
          ? fixture.away
          : null;

  const mut = useMutation({
    mutationFn: () =>
      api.put<{ matchId: number; status: string; finished: boolean; wasSettled: boolean }>(
        `/admin/groups/${groupId}/knockout-result`,
        {
          matchId: fixture.matchId,
          regHome: rH,
          regAway: rA,
          advancerTeamId: effectiveAdvancer,
          hadExtraTime: isDraw,
          hadPenalties: isDraw && penalties,
        },
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-group-picks', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-group', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      // Si la quiniela ya estaba liquidada, avisamos (premios ya pagados sin ajustar);
      // si no, cerramos directo.
      if (res?.wasSettled) setSettledNotice(true);
      else onClose();
    },
  });

  const canSave = !error && effectiveAdvancer != null && fixture.matchId != null && !mut.isPending;

  // Aviso post-corrección de un grupo ya liquidado: puntos recalculados, premios no.
  if (settledNotice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl p-6 space-y-4"
          style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold text-text-primary font-sans">Resultado actualizado</h3>
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 bg-warning/10 border border-warning/20">
            <AlertTriangle size={16} className="text-warning flex-none mt-0.5" />
            <span className="text-xs text-warning/90 font-sans leading-snug">
              La quiniela <strong>ya estaba liquidada</strong>: se recalcularon los puntos y el ranking de cada
              participante, pero <strong>los premios ya pagados NO se ajustaron</strong>. Si esta corrección cambió al
              ganador, reconcília los créditos a mano.
            </span>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={onClose}>Entendido</Button>
          </div>
        </div>
      </div>
    );
  }

  const teamChip = (teamId: number | null | undefined, label: string | null) => {
    const selected = effectiveAdvancer != null && effectiveAdvancer === teamId;
    return (
      <button
        type="button"
        disabled={hasWinner}
        onClick={() => teamId != null && setAdvancingTeamId(teamId)}
        className={`flex-1 h-11 px-3 rounded-xl text-sm font-semibold font-sans transition-colors truncate ${
          selected ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary border border-border hover:text-text-primary'
        } ${hasWinner ? 'cursor-default' : ''}`}
      >
        {label ?? '—'}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary font-sans">Resultado del cruce</h3>
            <p className="text-xs text-text-muted font-sans mt-0.5">
              {fixture.roundLabel ? `${fixture.roundLabel} · ` : ''}{fixture.home} vs {fixture.away}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3">
            <XCircle size={20} />
          </button>
        </div>

        {/* Marcador a los 90' */}
        <ScoreRow label="Marcador a los 90′" value={reg} onChange={setScore} />

        {/* ¿Quién avanza? (chips, como en la app) */}
        <div>
          <label className="block text-[11px] text-text-muted/70 font-sans uppercase tracking-wider mb-1.5">
            ¿Quién avanza?
          </label>
          <div className="flex gap-2">
            {teamChip(fixture.homeTeamId, fixture.home)}
            {teamChip(fixture.awayTeamId, fixture.away)}
          </div>
          {hasWinner && (
            <p className="text-[10px] text-text-muted/70 font-sans mt-1">Definido en los 90′: avanza el de mayor marcador.</p>
          )}
        </div>

        {/* Prórroga / penales como SWITCH (solo con empate a 90') */}
        {isDraw && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-surface-2 border border-border">
              <Trophy size={14} className="text-text-muted flex-none" />
              <span className="text-[11px] text-text-muted font-sans">
                Empate a los 90′: prórroga incluida. Indica si se definió en los penales.
              </span>
            </div>
            <label
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 cursor-pointer"
              style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-sm text-text-primary font-sans">¿Se definió en los penales?</span>
              <input type="checkbox" checked={penalties} onChange={(e) => setPenalties(e.target.checked)} className="h-5 w-5 accent-primary" />
            </label>
          </div>
        )}

        {/* Lectura de quién avanza */}
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ background: advancerLabel ? 'rgba(34,197,94,0.10)' : '#182235', border: `1px solid ${advancerLabel ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}` }}
        >
          <Trophy size={15} className={advancerLabel ? 'text-success' : 'text-text-muted'} />
          {advancerLabel ? (
            <span className="text-sm font-sans text-text-primary">
              Avanza <strong className="text-success">{advancerLabel}</strong>
              <span className="text-text-muted"> · {stage}</span>
            </span>
          ) : (
            <span className="text-xs text-text-muted font-sans">{error ?? 'Completa el resultado.'}</span>
          )}
        </div>

        {/* Aviso de cascada + recompute */}
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-warning/10 border border-warning/20">
          <AlertTriangle size={14} className="text-warning flex-none mt-0.5" />
          <span className="text-[11px] text-warning/90 font-sans leading-snug">
            Se escribe en el partido: liquida el cruce en <strong>todos</strong> los grupos de esa competición y cuenta
            para el historial de aciertos. Si la quiniela ya terminó, se recalculan los puntos de cada participante
            (los premios ya pagados no se modifican).
          </span>
        </div>

        {mut.error && <p className="text-sm text-danger font-sans">{(mut.error as Error).message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={mut.isPending} disabled={!canSave} onClick={() => mut.mutate()}>
            Guardar resultado
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── force/edit a member's KNOCKOUT picks (bypasses the per-tie lock) ───────── */

interface KoDraft {
  home: string;
  away: string;
  advancingTeamId: number | null;
  penalties: boolean;
}

/** Pick de llave resuelto desde un draft (o null si está incompleto). Mismo modelo
 *  que la app: con ganador a 90′ avanza el ganador y no hay prórroga/penales; con
 *  empate a 90′ la prórroga es implícita y el admin elige quién avanza (+ penales). */
function koSelectionFromDraft(f: Fixture, d: KoDraft):
  | { advancingTeamId: number; homeGoals90: number; awayGoals90: number; extraTime: boolean; penalties: boolean }
  | null {
  if (d.home === '' || d.away === '') return null;
  const rH = Number(d.home);
  const rA = Number(d.away);
  if (Number.isNaN(rH) || Number.isNaN(rA)) return null;
  const isDraw = rH === rA;
  const advancer = isDraw ? d.advancingTeamId : rH > rA ? f.homeTeamId ?? null : f.awayTeamId ?? null;
  if (advancer == null) return null;
  return { advancingTeamId: advancer, homeGoals90: rH, awayGoals90: rA, extraTime: isDraw, penalties: isDraw && d.penalties };
}

/**
 * Carga/forza los picks de eliminatorias de un miembro, cruce por cruce, sin el
 * lock por partido: el admin puede fijar el pick aunque el cruce ya haya empezado o
 * terminado (caso: el update no llegó a tiempo a todos). Si el cruce ya terminó, el
 * backend liquida al instante y los puntos aparecen al recargar.
 */
function ForceKnockoutPicksModal({
  groupId,
  target,
  fixtures,
  existing,
  onClose,
}: {
  groupId: string;
  target: { userId?: string; label: string };
  fixtures: Fixture[];
  existing: Member | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isAdd = !target.userId;
  const [email, setEmail] = useState('');

  // Solo cruces con ambos equipos definidos se pueden predecir.
  const ties = useMemo(
    () => fixtures.filter((f) => f.matchId != null && f.homeTeamId != null && f.awayTeamId != null),
    [fixtures],
  );

  const [drafts, setDrafts] = useState<Record<number, KoDraft>>(() => {
    const init: Record<number, KoDraft> = {};
    for (const f of ties) {
      const sel = existing?.picks[f.fixtureKey]?.selection as Record<string, unknown> | undefined;
      init[f.matchId as number] = {
        home: typeof sel?.homeGoals90 === 'number' ? String(sel.homeGoals90) : '',
        away: typeof sel?.awayGoals90 === 'number' ? String(sel.awayGoals90) : '',
        advancingTeamId: typeof sel?.advancingTeamId === 'number' ? (sel.advancingTeamId as number) : null,
        penalties: sel?.penalties === true,
      };
    }
    return init;
  });

  const clamp = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 2);
  const patch = (matchId: number, p: Partial<KoDraft>) =>
    setDrafts((d) => ({ ...d, [matchId]: { ...d[matchId], ...p } }));

  const picksToSend = useMemo(() => {
    const out: { matchId: number; selection: Record<string, unknown> }[] = [];
    for (const f of ties) {
      const sel = koSelectionFromDraft(f, drafts[f.matchId as number]);
      if (sel) out.push({ matchId: f.matchId as number, selection: sel });
    }
    return out;
  }, [drafts, ties]);

  const mut = useMutation({
    mutationFn: () =>
      api.put<{ memberAdded: boolean; picksSet: number; submitted: boolean; settled: boolean }>(
        `/admin/groups/${groupId}/knockout-picks`,
        {
          ...(target.userId ? { userId: target.userId } : { email: email.trim() }),
          picks: picksToSend,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-group-picks', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-group', groupId] });
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      onClose();
    },
  });

  const canSave = picksToSend.length > 0 && (!!target.userId || email.trim().length > 3) && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary font-sans">Forzar picks de eliminatorias</h3>
            <p className="text-xs text-text-muted font-sans mt-0.5">
              {isAdd ? 'Carga los picks de un usuario que no alcanzó a predecir.' : target.label}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3">
            <XCircle size={20} />
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-warning/10 border border-warning/20">
          <AlertTriangle size={14} className="text-warning flex-none mt-0.5" />
          <span className="text-[11px] text-warning/90 font-sans leading-snug">
            Salta el bloqueo por cruce: puedes fijar el pick <strong>aunque el partido ya empezó o terminó</strong>. Si el
            cruce ya terminó, se liquida al instante. Deja un cruce vacío para no tocarlo.
          </span>
        </div>

        {isAdd && (
          <div>
            <label className="block text-xs text-text-muted font-sans mb-1">Email del usuario</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amigo@gmail.com"
              className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
            />
            <p className="text-[11px] text-text-muted/60 font-sans mt-1">
              Debe ser una cuenta existente. Si aún no es miembro del grupo, se agrega automáticamente.
            </p>
          </div>
        )}

        {ties.length === 0 ? (
          <p className="text-sm text-text-muted font-sans py-6 text-center">
            No hay cruces con ambos equipos definidos todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {ties.map((f) => {
              const d = drafts[f.matchId as number];
              const rH = d.home === '' ? NaN : Number(d.home);
              const rA = d.away === '' ? NaN : Number(d.away);
              const bothFilled = !Number.isNaN(rH) && !Number.isNaN(rA);
              const isDraw = bothFilled && rH === rA;
              const hasWinner = bothFilled && rH !== rA;
              const winnerTeamId = hasWinner ? (rH > rA ? f.homeTeamId ?? null : f.awayTeamId ?? null) : null;
              const effectiveAdvancer = hasWinner ? winnerTeamId : d.advancingTeamId;

              const chip = (teamId: number | null | undefined, label: string | null) => {
                const selected = effectiveAdvancer != null && effectiveAdvancer === teamId;
                return (
                  <button
                    type="button"
                    disabled={hasWinner}
                    onClick={() => teamId != null && patch(f.matchId as number, { advancingTeamId: teamId })}
                    className={`flex-1 h-9 px-2 rounded-lg text-xs font-semibold font-sans transition-colors truncate ${
                      selected ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary border border-border hover:text-text-primary'
                    } ${hasWinner ? 'cursor-default' : ''}`}
                  >
                    {label ?? '—'}
                  </button>
                );
              };

              return (
                <div
                  key={f.fixtureKey}
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      {f.roundLabel && (
                        <div className="text-[9px] uppercase tracking-wider text-text-muted/70 font-semibold">{f.roundLabel}</div>
                      )}
                      <div className="text-sm text-text-primary truncate">{f.home} vs {f.away}</div>
                      <div className="text-[10px] text-text-muted/70 font-sans">
                        {f.finished && f.result ? (
                          <span className="text-success font-semibold">
                            {f.status === 'PEN' ? 'Pen' : f.status === 'AET' ? 'Pró' : 'FT'} {f.result.home}-{f.result.away}
                          </span>
                        ) : f.kickoffAt ? (
                          formatDateTime(f.kickoffAt)
                        ) : (
                          f.status ?? ''
                        )}
                      </div>
                    </div>
                    <input
                      inputMode="numeric"
                      value={d.home}
                      onChange={(e) => patch(f.matchId as number, { home: clamp(e.target.value) })}
                      className="h-9 w-11 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
                    />
                    <span className="text-text-muted">-</span>
                    <input
                      inputMode="numeric"
                      value={d.away}
                      onChange={(e) => patch(f.matchId as number, { away: clamp(e.target.value) })}
                      className="h-9 w-11 text-center rounded-lg text-sm bg-surface-2 border border-border text-text-primary font-mono"
                    />
                  </div>

                  {bothFilled && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted/70 font-sans uppercase tracking-wider w-14 flex-none">Avanza</span>
                        {chip(f.homeTeamId, f.home)}
                        {chip(f.awayTeamId, f.away)}
                      </div>
                      {isDraw && (
                        <label className="flex items-center justify-between gap-3 px-1 cursor-pointer">
                          <span className="text-[11px] text-text-muted font-sans">
                            Empate a 90′: prórroga incluida. ¿Se definió en penales?
                          </span>
                          <input
                            type="checkbox"
                            checked={d.penalties}
                            onChange={(e) => patch(f.matchId as number, { penalties: e.target.checked })}
                            className="h-4 w-4 accent-primary flex-none"
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mut.error && <p className="text-sm text-danger font-sans">{(mut.error as Error).message}</p>}

        <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[11px] text-text-muted/60 font-sans inline-flex items-center gap-1">
            <Trophy size={12} /> {picksToSend.length} pick(s) a guardar
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" size="sm" loading={mut.isPending} disabled={!canSave} onClick={() => mut.mutate()}>
              Guardar picks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
