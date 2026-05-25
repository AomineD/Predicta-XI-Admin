import {
  Trophy, Medal, TrendingDown, Goal, Shield, Target, Handshake, Star,
  Sparkles, Hand, Zap, ListOrdered, Swords, Hash, Award, type LucideIcon,
} from 'lucide-react';

/**
 * Human-readable rendering for quiniela picks. The backend stores each pick's
 * `value` as category-specific JSON (see quiniela-validator.ts
 * CATEGORY_VALUE_SCHEMAS); showing that raw JSON in the admin UI is unreadable,
 * so we map each category to a plain-language primary line (+ optional detail)
 * and an icon.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  champion: 'Champion',
  runner_up: 'Runner-up',
  first_eliminated: 'First eliminated',
  team_with_most_goals: 'Most goals (team)',
  best_defense: 'Best defense',
  top_scorer: 'Top scorer',
  top_assister: 'Top assister',
  mvp: 'MVP',
  best_young_player: 'Best young player',
  best_goalkeeper: 'Best goalkeeper',
  dark_horse: 'Dark horse',
  group_standings: 'Group standings',
  knockout_winner: 'Knockout winner',
  final_score: 'Final score',
};

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  champion: Trophy,
  runner_up: Medal,
  first_eliminated: TrendingDown,
  team_with_most_goals: Goal,
  best_defense: Shield,
  top_scorer: Target,
  top_assister: Handshake,
  mvp: Star,
  best_young_player: Sparkles,
  best_goalkeeper: Hand,
  dark_horse: Zap,
  group_standings: ListOrdered,
  knockout_winner: Swords,
  final_score: Hash,
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? Award;
}

/** Categories with no structured data source — resolved manually by an admin. */
export const MANUAL_ONLY_CATEGORIES = new Set(['mvp', 'best_young_player', 'best_goalkeeper']);

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface PickDisplay {
  primary: string;
  secondary?: string;
}

export function formatPickValue(
  category: string,
  value: Record<string, unknown> | null | undefined,
  subjectKey?: string | null,
): PickDisplay {
  const v = (value ?? {}) as Record<string, unknown>;

  switch (category) {
    case 'champion':
    case 'runner_up':
    case 'first_eliminated':
    case 'dark_horse':
      return { primary: asStr(v.name) ?? teamFallback(v.teamId) };

    case 'team_with_most_goals':
    case 'best_defense': {
      const est = asNum(v.estimate);
      return {
        primary: asStr(v.name) ?? teamFallback(v.teamId),
        secondary: est != null ? `est. ${est}` : undefined,
      };
    }

    case 'top_scorer':
    case 'top_assister':
    case 'mvp':
    case 'best_young_player':
    case 'best_goalkeeper':
      return { primary: asStr(v.playerName) ?? '—' };

    case 'group_standings': {
      const order = Array.isArray(v.order) ? (v.order as Array<Record<string, unknown>>) : [];
      const names = order.map((o, i) => `${i + 1}. ${asStr(o.name) ?? teamFallback(o.teamId)}`);
      return {
        primary: subjectKey ? subjectKey.replace(/_/g, ' ') : 'Group order',
        secondary: names.length > 0 ? names.join('  ·  ') : undefined,
      };
    }

    case 'knockout_winner': {
      const winner = asStr(v.winnerName) ?? teamFallback(v.winnerTeamId);
      const loser = asStr(v.losingName) ?? teamFallback(v.losingTeamId);
      return { primary: `${winner} beat ${loser}` };
    }

    case 'final_score': {
      const hs = asNum(v.homeScore);
      const as = asNum(v.awayScore);
      const winner = asStr(v.winner);
      const wlabel =
        winner === 'home' ? 'home win' : winner === 'away' ? 'away win' : winner === 'draw' ? 'draw' : undefined;
      return { primary: hs != null && as != null ? `${hs}–${as}` : '—', secondary: wlabel };
    }

    default:
      return { primary: JSON.stringify(value) };
  }
}

function teamFallback(teamId: unknown): string {
  const n = asNum(teamId);
  return n != null ? `Team #${n}` : '—';
}

/** Tone for the confidence chip — mirrors the app's >=65 / 45-64 / <45 bands. */
export function confidenceTone(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 65) return 'high';
  if (confidence >= 45) return 'medium';
  return 'low';
}
