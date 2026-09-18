// Contrato del estudio del motor (plan "motor que aprende", 2026-09-12).
// Lo comparten el bloque de Config → General → "Motor Predicta calibrado" y la
// página /engine-study, para que los dos lean y disparen lo mismo.

import { api } from '@/lib/api';

export type EngineStudyVerdict = 'applied' | 'rejected' | 'insufficient_sample';
export type EngineStudyTrigger = 'scheduled' | 'manual';
export type EngineStudyStatus = 'running' | 'completed' | 'failed';

export interface EngineStudyRun {
  id: number;
  weekKey: string;
  trigger: EngineStudyTrigger;
  status: EngineStudyStatus;
  verdict: EngineStudyVerdict | null;
  verdictReason: string | null;
  observations: number;
  recoveredObservations: number;
  trainObservations: number;
  holdoutObservations: number;
  incumbentLogLoss: number | null;
  candidateLogLoss: number | null;
  noMapLogLoss: number | null;
  incumbentBrier: number | null;
  candidateBrier: number | null;
  noMapBrier: number | null;
  vetoedSelections: number;
  model: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface EngineSelectionStat {
  bucketKey: string;
  market: string;
  pick: string;
  picks: number;
  won: number;
  expectedWins: number;
  shrunkAe: number;
  vetoed: boolean;
}

/** `meanPct` positivo = la cuota se ACORTÓ a favor del pick. */
export interface ClvAggregate {
  n: number;
  meanPct: number;
  shortened: number;
  lengthened: number;
  unchanged: number;
  winRatePct: number | null;
}

export interface ClvReport {
  overall: ClvAggregate;
  /** Picks sin foto de cierre: se cuentan aparte, nunca como 0. */
  unmatched: number;
  byMarket: Record<string, ClvAggregate>;
  bySelection: Record<string, ClvAggregate>;
}

export interface WeeklyAeRow {
  weekKey: string;
  picks: number;
  won: number;
  expected: number;
  ae: number;
}

export interface EngineStudyOverview {
  latest: EngineStudyRun | null;
  history: EngineStudyRun[];
  selections: EngineSelectionStat[];
  clv: ClvReport | null;
  weeklyAe: WeeklyAeRow[];
  map: {
    observations: number;
    updatedAt: string | null;
    hasSelectionBins: boolean;
    models: string[];
    missingMarkets: string[];
  };
  config: {
    enabled: boolean;
    dayOfWeek: number;
    hourCaracas: number;
    holdoutDays: number;
    activeModel: string;
    weakSelectionFilter: boolean;
    selectionMinAe: number;
    selectionMinSample: number;
  };
}

export const ENGINE_STUDY_QUERY_KEY = ['engine-study'] as const;

export function fetchEngineStudy(): Promise<EngineStudyOverview> {
  return api.get<EngineStudyOverview>('/admin/engine-study');
}

/** Corrida manual, síncrona: puede tardar unos segundos. Rate limit 2 por 5 min. */
export function runEngineStudy(): Promise<EngineStudyRun> {
  return api.post<EngineStudyRun>('/admin/engine-study/run', {});
}

/** `lib/api.ts` solo rethrow el mensaje del backend; el 429 llega como
 *  "Too many requests. Try again in …". Se reconoce por el texto para mostrarlo
 *  como aviso y no como error genérico. */
export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /too many requests|rate limit|429/i.test(message);
}

export const RATE_LIMIT_NOTICE = 'Límite de 2 corridas cada 5 minutos: espera un momento antes de volver a pulsar.';

export const VERDICT_LABELS: Record<EngineStudyVerdict, string> = {
  applied: 'Aplicado',
  rejected: 'Rechazado',
  insufficient_sample: 'Muestra insuficiente',
};

/** Etiqueta corta del pill. Todo lo que llega del backend se pasa por un
 *  `switch` con `default`: un `status` o `verdict` fuera del enum nunca puede
 *  indexar un objeto y colar algo que no sea texto como hijo de React. */
export function verdictLabel(run: EngineStudyRun): string {
  switch (run.status) {
    case 'failed':
      return 'Fallida';
    case 'running':
      return 'En curso';
    case 'completed':
      break;
    default:
      return 'Sin veredicto';
  }
  switch (run.verdict) {
    case 'applied':
      return VERDICT_LABELS.applied;
    case 'rejected':
      return VERDICT_LABELS.rejected;
    case 'insufficient_sample':
      return VERDICT_LABELS.insufficient_sample;
    default:
      return 'Sin veredicto';
  }
}

/** Origen de la corrida, con texto genérico para un valor desconocido. */
export function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'manual':
      return 'manual';
    case 'scheduled':
      return 'programada';
    default:
      return 'desconocido';
  }
}

/** Frase completa del veredicto, con lo que le pasó al mapa vigente. */
export function describeVerdict(run: EngineStudyRun | null): string {
  if (!run) return 'Todavía no hay ninguna corrida.';
  if (run.status === 'running') return 'Corrida en curso.';
  if (run.status === 'failed') return `Corrida fallida${run.error ? `: ${run.error}` : '.'}`;
  switch (run.verdict) {
    case 'applied':
      return 'Aplicado: el candidato no empeoró en validación y sustituyó al mapa vigente.';
    case 'rejected':
      return `Rechazado: el mapa vigente se conserva${run.verdictReason ? ` (${run.verdictReason})` : '.'}`;
    case 'insufficient_sample':
      return 'Muestra insuficiente: el mapa vigente se conserva intacto.';
    default:
      return 'Corrida completada sin veredicto.';
  }
}

export function verdictTone(verdict: EngineStudyVerdict | null, status?: EngineStudyStatus): string {
  if (status === 'failed') return 'bg-danger/15 text-danger';
  if (status === 'running') return 'bg-warning/15 text-warning';
  switch (verdict) {
    case 'applied':
      return 'bg-success/15 text-success';
    case 'rejected':
      return 'bg-warning/15 text-warning';
    case 'insufficient_sample':
      return 'bg-text-muted/15 text-text-muted';
    default:
      return 'bg-text-muted/15 text-text-muted';
  }
}

export const WEEKDAY_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Número con decimales fijos o «—» cuando falta. */
export function fmtNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** Número con signo explícito (ROI, diferencia de confianza) o «—». */
export function fmtSigned(value: number | null | undefined, digits = 1, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
}

/** Color del A/E: a precio justo ronda 0.95; bajo 0.90 es la zona que se veta. */
export function aeTone(ae: number | null | undefined): string {
  if (ae == null) return 'text-text-muted';
  if (ae >= 1) return 'text-emerald-400';
  if (ae >= 0.9) return 'text-text-primary';
  return 'text-rose-400';
}

// ── Indicadores del motor (plan "motor sin sesgos", fase 4) ──────────────────

export const PERFORMANCE_WINDOWS = [30, 60, 90, 120] as const;

export type PerformanceDimension =
  | 'market'
  | 'selection'
  | 'axis'
  | 'odds_bucket'
  | 'risk_group'
  | 'month'
  | 'odds_source';

export const PERFORMANCE_DIMENSION_OPTIONS: ReadonlyArray<{ value: PerformanceDimension; label: string }> = [
  { value: 'risk_group', label: 'Grupo' },
  { value: 'market', label: 'Mercado' },
  { value: 'selection', label: 'Selección' },
  { value: 'axis', label: 'Eje' },
  { value: 'odds_bucket', label: 'Tramo de cuota' },
  { value: 'month', label: 'Mes' },
  { value: 'odds_source', label: 'Fuente de cuota' },
];

export interface PerformanceRow {
  key: string;
  picks: number;
  priced: number;
  won: number;
  winratePct: number | null;
  avgOdds: number | null;
  breakEvenPct: number | null;
  ae: number | null;
  roiPct: number | null;
  unpriced: number;
  unpricedWinratePct: number | null;
}

export interface PerformanceBreakdown {
  dimension: PerformanceDimension;
  windowDays: number;
  minSample: number;
  principalMaxOdds: number;
  rows: PerformanceRow[];
  belowSample: number;
  overall: PerformanceRow;
  generatedAt: string;
}

export function fetchPerformanceBreakdown(params: {
  dimension: PerformanceDimension;
  days: number;
  minSample: number;
}): Promise<PerformanceBreakdown> {
  const qs = new URLSearchParams({
    dimension: params.dimension,
    days: String(params.days),
    minSample: String(params.minSample),
  });
  return api.get<PerformanceBreakdown>(`/admin/stats/performance?${qs.toString()}`);
}

/** Nombre de la dimensión para la cabecera de la primera columna. */
export function performanceDimensionLabel(dimension: PerformanceDimension): string {
  return PERFORMANCE_DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ?? 'Grupo';
}

const humanize = (key: string): string => key.replace(/_/g, ' ');

/** Texto de una fila. Todo valor que llega del backend pasa por un `switch` con
 *  `default`: una clave desconocida se enseña tal cual, como texto. */
export function performanceKeyLabel(dimension: PerformanceDimension, key: string, principalMaxOdds: number): string {
  if (key === 'unpriced') return 'Sin cuota';
  switch (dimension) {
    case 'axis':
      switch (key) {
        case 'goals_low':
          return 'Menos goles';
        case 'goals_high':
          return 'Más goles';
        case 'home_lean_priced':
          return 'Local a cuota alta (≥ 1.50)';
        case 'away_lean_priced':
          return 'Visitante a cuota alta (≥ 1.50)';
        case 'props_over':
          return 'Córners y tarjetas «más de»';
        case 'none':
          return 'Sin eje';
        default:
          return humanize(key);
      }
    case 'risk_group':
      switch (key) {
        case 'principal':
          return `Principal (≤ ${principalMaxOdds.toFixed(2)})`;
        case 'risk':
          return `Riesgo (> ${principalMaxOdds.toFixed(2)})`;
        default:
          return humanize(key);
      }
    case 'odds_source':
      switch (key) {
        case 'sportium':
          return 'Sportium';
        case 'flashscore':
          return 'Flashscore';
        case 'onexbet':
          return '1xBet (respaldo)';
        case 'other':
          // Picks anteriores a la migración 0231, sin fuente guardada: se estima.
          return 'Otra (estimada: Flashscore)';
        default:
          return humanize(key);
      }
    case 'selection': {
      const sep = key.indexOf('|');
      return sep === -1 ? humanize(key) : `${humanize(key.slice(0, sep))} · ${key.slice(sep + 1)}`;
    }
    default:
      return humanize(key);
  }
}

export type CombinadaPerformanceDimension = 'scope' | 'tier' | 'theme' | 'legs' | 'odds_bucket';

export const COMBINADA_DIMENSION_OPTIONS: ReadonlyArray<{ value: CombinadaPerformanceDimension; label: string }> = [
  { value: 'tier', label: 'Tier' },
  { value: 'theme', label: 'Tema' },
  { value: 'scope', label: 'Alcance' },
  { value: 'legs', label: 'Patas' },
  { value: 'odds_bucket', label: 'Tramo de cuota' },
];

export interface CombinadaPerformanceRow {
  key: string;
  groups: Partial<Record<CombinadaPerformanceDimension, string>>;
  settled: number;
  won: number;
  winratePct: number | null;
  priced: number;
  avgOdds: number | null;
  breakEvenPct: number | null;
  ae: number | null;
  roiPct: number | null;
  avgConfidence: number | null;
  avgImpliedPct: number | null;
  confidenceGapPts: number | null;
}

export interface CombinadaPerformance {
  dimensions: CombinadaPerformanceDimension[];
  windowDays: number;
  rows: CombinadaPerformanceRow[];
  overall: CombinadaPerformanceRow;
  generatedAt: string;
}

export function fetchCombinadaPerformance(params: {
  dimensions: readonly CombinadaPerformanceDimension[];
  days: number;
}): Promise<CombinadaPerformance> {
  const qs = new URLSearchParams({ dimension: params.dimensions.join(','), days: String(params.days) });
  return api.get<CombinadaPerformance>(`/admin/stats/combinadas-performance?${qs.toString()}`);
}

export function combinadaDimensionLabel(dimension: CombinadaPerformanceDimension): string {
  return COMBINADA_DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ?? 'Grupo';
}

export function combinadaValueLabel(dimension: CombinadaPerformanceDimension, value: string | undefined): string {
  if (value == null) return '—';
  if (value === 'unpriced') return 'Sin cuota';
  switch (dimension) {
    case 'scope':
      switch (value) {
        case 'daily':
          return 'Diaria';
        case 'weekly':
          return 'Semanal';
        default:
          return value;
      }
    case 'tier':
      switch (value) {
        case 'premium':
          return 'Premium';
        case 'regular':
          return 'Regular';
        default:
          return value;
      }
    case 'theme':
      switch (value) {
        case 'safe':
          return 'Segura';
        case 'none':
          return 'Sin tema';
        default:
          return value;
      }
    case 'legs':
      return `${value} patas`;
    default:
      return value;
  }
}
