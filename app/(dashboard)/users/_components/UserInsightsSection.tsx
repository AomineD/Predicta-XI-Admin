'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/ui/MetricCard';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { formatDateTime } from '@/lib/utils';

// Forma de `GET /admin/users/:id/insights` (`users-admin-insights.service.ts`).
interface WinLoss {
  won: number;
  lost: number;
  winRate: number | null;
}

interface CountCredits {
  count: number;
  credits: number;
  lastAt: string | null;
}

interface CreditFlowRow {
  reason: string;
  count: number;
  credits: number;
  lastAt: string | null;
}

interface UserInsights {
  predictions: {
    byTier: Array<{ tierId: string | null; tierName: string; unlocks: number; creditsSpent: number; lastAccessAt: string | null }>;
    unlockedPicks: WinLoss & { settled: number };
  };
  aiCombinadas: {
    byType: Array<WinLoss & { type: string; unlocked: number; creditsSpent: number; lastAccessAt: string | null }>;
    totals: WinLoss & { unlocked: number; creditsSpent: number };
  };
  userCombinadas: WinLoss & {
    created: number;
    pending: number;
    creditsSpent: number;
    lastCreatedAt: string | null;
    points: number;
    bestOdds: number | null;
  };
  rewardedAds: { verified: CountCredits; legacyUnverified: CountCredits };
  credits: { earned: CreditFlowRow[]; spent: CreditFlowRow[]; totalEarned: number; totalSpent: number };
  activity: {
    activeDays7: number;
    activeDays30: number;
    activeDaysTotal: number;
    lastActiveDate: string | null;
    currentActiveStreak: number;
    bestActiveStreak: number;
    lastLoginAt: string | null;
    resultStreak: { current: number; best: number; type: string | null };
  };
  quinielas: {
    groupsJoined: number;
    groupsPlayed: number;
    groupsWon: number;
    podiums: number;
    bestRank: number | null;
    totalPicks: number;
    correctPicks: number;
    pickWinRate: number | null;
  };
  engagement: {
    favoriteTeams: number;
    favoriteLeagues: number;
    referralsMade: number;
    referralsQualified: number;
    activeBadges: number;
    activeDevices: number;
    platforms: string[];
  };
  feedback: { total: number; open: number; byKind: Array<{ kind: string; count: number }>; lastAt: string | null } | null;
}

const REASON_LABELS: Record<string, string> = {
  iap_purchase: 'Compra IAP',
  iap_revocation: 'Revocación IAP',
  prediction_viewed: 'Predicciones',
  combinada_viewed: 'Combinadas de IA',
  signup_bonus: 'Bono de registro',
  admin_adjustment: 'Ajuste del admin',
  subscription_grant: 'Suscripción',
  ad_reward: 'Anuncios',
  weekly_activity_bonus: 'Bono semanal',
  user_combinada_created: 'Combinadas armadas',
  combinada_opinion_requested: 'Opinión de combinada',
  prediction_void_refund: 'Reembolso predicción anulada',
  combinada_view_void_refund: 'Reembolso combinada anulada',
  user_combinada_void_refund: 'Reembolso combinada armada',
  opinion_llm_failed_refund: 'Reembolso opinión fallida',
  quiniela_viewed: 'Quiniela de IA',
  quiniela_void_refund: 'Reembolso quiniela',
  group_created: 'Crear quiniela',
  group_prize: 'Premio de quiniela',
  group_void_refund: 'Reembolso de quiniela',
  referral_reward: 'Referido',
  referral_milestone_bonus: 'Hito de referidos',
  referral_welcome_bonus: 'Bienvenida por referido',
  daily_login_reward: 'Entrada diaria',
  action_reward: 'Acción única',
  combinada_share_join: 'Unirse a combinada compartida',
  squad_created: 'Crear escuadra',
  erroneous_charge_refund: 'Reembolso de cobro erróneo',
};

const FEEDBACK_KIND_LABELS: Record<string, string> = {
  prediction_report: 'Predicción',
  combinada_report: 'Combinada',
  general: 'General',
};

const pct = (v: number | null): string => (v == null ? '—' : `${v}%`);
const when = (v: string | null): string => (v ? formatDateTime(v) : '—');
const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function InsightBlock({ title, info, children }: { title: string; info: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">{title}</h3>
        <InfoPopover label={`Qué mide "${title}"`}>{info}</InfoPopover>
      </div>
      {children}
    </div>
  );
}

function Metrics({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Metric(props: { label: string; value: string | number | null; sub?: string }) {
  return <MetricCard label={props.label} value={props.value} sub={props.sub} className="p-3" />;
}

function Rows({ rows }: { rows: Array<{ key: string; left: string; right: string }> }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted mt-2">Sin movimientos.</p>;
  return (
    <ul className="space-y-1.5 mt-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary truncate">{r.left}</span>
          <span className="text-text-muted text-xs font-mono flex-none">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * KPIs del usuario. Carga con su propia query para no frenar el detalle básico:
 * el drawer ya se ve mientras estas consultas (más pesadas) terminan.
 */
export function UserInsightsSection({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery<UserInsights>({
    queryKey: ['user-insights', userId],
    queryFn: () => api.get(`/admin/users/${userId}/insights`),
  });

  if (isLoading) return <p className="text-sm text-text-muted">Cargando KPIs…</p>;
  if (error) return <p className="text-sm text-danger">No se pudieron cargar los KPIs: {(error as Error).message}</p>;
  if (!data) return null;

  const { predictions, aiCombinadas, userCombinadas, rewardedAds, credits, activity, quinielas, engagement, feedback } = data;

  return (
    <div className="space-y-6">
      <InsightBlock
        title="Predicciones por tier"
        info={
          <>
            <p className="mb-2">
              Desbloqueos por tier y créditos cobrados por ese tier (brutos: no restan reembolsos, que aparecen en
              &quot;Créditos por origen&quot;).
            </p>
            <p>
              El acierto cuenta los picks ganados sobre ganados + perdidos de lo que desbloqueó, solo dentro de los
              mercados de cada tier y medidos con el catálogo ACTUAL del tier. Un pick visto en dos tiers cuenta una
              vez.
            </p>
          </>
        }
      >
        <Metrics>
          <Metric
            label="Acierto desbloqueado"
            value={pct(predictions.unlockedPicks.winRate)}
            sub={`${predictions.unlockedPicks.won} de ${predictions.unlockedPicks.settled} picks`}
          />
          <Metric
            label="Desbloqueos"
            value={predictions.byTier.reduce((s, t) => s + t.unlocks, 0)}
            sub={`${predictions.byTier.reduce((s, t) => s + t.creditsSpent, 0)} cr`}
          />
        </Metrics>
        <Rows
          rows={predictions.byTier.map((t) => ({
            key: t.tierId ?? t.tierName,
            left: t.tierName,
            right: `${t.unlocks} · ${t.creditsSpent} cr · ${when(t.lastAccessAt)}`,
          }))}
        />
      </InsightBlock>

      <InsightBlock
        title="Combinadas de IA"
        info={
          <p>
            Combinadas de Predicta que desbloqueó. El winrate es ganadas sobre ganadas + perdidas (las anuladas,
            parciales y pendientes no cuentan); sin ninguna liquidada se muestra &quot;—&quot;. Créditos: lo cobrado
            por verlas.
          </p>
        }
      >
        <Metrics>
          <Metric
            label="Desbloqueadas"
            value={aiCombinadas.totals.unlocked}
            sub={`${aiCombinadas.totals.creditsSpent} cr`}
          />
          <Metric
            label="Winrate"
            value={pct(aiCombinadas.totals.winRate)}
            sub={`${aiCombinadas.totals.won} G · ${aiCombinadas.totals.lost} P`}
          />
        </Metrics>
        <Rows
          rows={aiCombinadas.byType.map((t) => ({
            key: t.type,
            left: capitalize(t.type),
            right: `${t.unlocked} · ${pct(t.winRate)} · ${t.creditsSpent} cr`,
          }))}
        />
      </InsightBlock>

      <InsightBlock
        title="Combinadas armadas"
        info={
          <p>
            Combinadas que el usuario armó él mismo. Créditos: lo cobrado al crearlas. Puntos y mejor cuota salen
            del ranking de combinadas.
          </p>
        }
      >
        <Metrics>
          <Metric label="Creadas" value={userCombinadas.created} sub={`${userCombinadas.pending} pendientes`} />
          <Metric
            label="Winrate"
            value={pct(userCombinadas.winRate)}
            sub={`${userCombinadas.won} G · ${userCombinadas.lost} P`}
          />
          <Metric label="Créditos" value={userCombinadas.creditsSpent} sub={`Última: ${when(userCombinadas.lastCreatedAt)}`} />
          <Metric
            label="Puntos"
            value={userCombinadas.points}
            sub={userCombinadas.bestOdds != null ? `Mejor cuota ${userCombinadas.bestOdds.toFixed(2)}` : undefined}
          />
        </Metrics>
      </InsightBlock>

      <InsightBlock
        title="Anuncios recompensados"
        info={
          <>
            <p className="mb-2">
              Verificados: los abonó el callback firmado de Google (AdMob SSV). Históricos sin verificar: la ruta
              antigua en la que la app se autodeclaraba, anulada el 2026-09-08.
            </p>
            <p>Solo cuenta anuncios que dan créditos: los banners y los intersticiales no se registran.</p>
          </>
        }
      >
        <Metrics>
          <Metric
            label="Verificados"
            value={rewardedAds.verified.count}
            sub={`${rewardedAds.verified.credits} cr · ${when(rewardedAds.verified.lastAt)}`}
          />
          <Metric
            label="Sin verificar"
            value={rewardedAds.legacyUnverified.count}
            sub={`${rewardedAds.legacyUnverified.credits} cr · ${when(rewardedAds.legacyUnverified.lastAt)}`}
          />
        </Metrics>
      </InsightBlock>

      <InsightBlock
        title="Créditos por origen"
        info={<p>Todo el historial de movimientos agrupado por motivo: lo ganado por origen y lo gastado por producto.</p>}
      >
        <Metrics>
          <Metric label="Ganados" value={credits.totalEarned} />
          <Metric label="Gastados" value={credits.totalSpent} />
        </Metrics>
        <p className="text-xs text-text-muted mt-3">Ganados</p>
        <Rows
          rows={credits.earned.map((r) => ({
            key: `add-${r.reason}`,
            left: REASON_LABELS[r.reason] ?? r.reason,
            right: `+${r.credits} · ${r.count}×`,
          }))}
        />
        <p className="text-xs text-text-muted mt-3">Gastados</p>
        <Rows
          rows={credits.spent.map((r) => ({
            key: `consume-${r.reason}`,
            left: REASON_LABELS[r.reason] ?? r.reason,
            right: `-${r.credits} · ${r.count}×`,
          }))}
        />
      </InsightBlock>

      <InsightBlock
        title="Actividad"
        info={
          <>
            <p className="mb-2">
              Días en los que abrió la app (últimos 7 y 30 días). La racha de actividad son días seguidos; la actual
              sigue viva si el último día fue hoy o ayer.
            </p>
            <p>La racha de resultados es otra cosa: aciertos o fallos seguidos de sus predicciones.</p>
          </>
        }
      >
        <Metrics>
          <Metric label="Activo 7 días" value={activity.activeDays7} sub={`30 días: ${activity.activeDays30}`} />
          <Metric
            label="Racha actividad"
            value={activity.currentActiveStreak}
            sub={`Mejor: ${activity.bestActiveStreak} · total ${activity.activeDaysTotal} días`}
          />
          <Metric
            label="Racha resultados"
            value={activity.resultStreak.current}
            sub={`${activity.resultStreak.type ?? '—'} · mejor ${activity.resultStreak.best}`}
          />
          <Metric
            label="Último día activo"
            value={activity.lastActiveDate ?? '—'}
            sub={`Login: ${when(activity.lastLoginAt)}`}
          />
        </Metrics>
      </InsightBlock>

      <InsightBlock
        title="Quinielas"
        info={
          <p>
            Grupos a los que se unió y, de los ya liquidados, cuántos jugó, ganó y en cuántos quedó en el podio. El
            acierto de picks sale de sus estadísticas acumuladas.
          </p>
        }
      >
        <Metrics>
          <Metric
            label="Grupos"
            value={quinielas.groupsJoined}
            sub={`Jugados ${quinielas.groupsPlayed} · ganados ${quinielas.groupsWon}`}
          />
          <Metric
            label="Podios"
            value={quinielas.podiums}
            sub={quinielas.bestRank != null ? `Mejor puesto: ${quinielas.bestRank}` : undefined}
          />
          <Metric
            label="Acierto picks"
            value={pct(quinielas.pickWinRate)}
            sub={`${quinielas.correctPicks} de ${quinielas.totalPicks}`}
          />
        </Metrics>
      </InsightBlock>

      <InsightBlock
        title="Engagement"
        info={
          <p>
            Favoritos (equipos y ligas), referidos que trajo (cualificados: los que completaron el requisito),
            insignias activas y dispositivos con push activo.
          </p>
        }
      >
        <Metrics>
          <Metric label="Favoritos" value={engagement.favoriteTeams} sub={`${engagement.favoriteLeagues} ligas`} />
          <Metric
            label="Referidos"
            value={engagement.referralsMade}
            sub={`${engagement.referralsQualified} cualificados`}
          />
          <Metric label="Insignias" value={engagement.activeBadges} />
          <Metric
            label="Dispositivos"
            value={engagement.activeDevices}
            sub={engagement.platforms.length > 0 ? engagement.platforms.join(', ') : undefined}
          />
        </Metrics>
      </InsightBlock>

      <InsightBlock
        title="Reportes enviados"
        info={<p>Reportes y comentarios que mandó desde la app. Abiertos: sin revisar o en revisión.</p>}
      >
        {feedback == null ? (
          <p className="text-sm text-text-muted">Aún no disponible en esta base.</p>
        ) : (
          <>
            <Metrics>
              <Metric label="Enviados" value={feedback.total} sub={`Último: ${when(feedback.lastAt)}`} />
              <Metric label="Abiertos" value={feedback.open} />
            </Metrics>
            {feedback.byKind.length > 0 && (
              <Rows
                rows={feedback.byKind.map((k) => ({
                  key: k.kind,
                  left: FEEDBACK_KIND_LABELS[k.kind] ?? k.kind,
                  right: String(k.count),
                }))}
              />
            )}
          </>
        )}
      </InsightBlock>
    </div>
  );
}
