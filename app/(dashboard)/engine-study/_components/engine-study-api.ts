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
