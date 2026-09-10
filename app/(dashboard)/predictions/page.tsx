'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { MarketReturnsCard } from './_components/MarketReturnsCard';

interface Prediction {
  id: string;
  matchId: number;
  model: string;
  coverageScore: number | null;
  settlement: string;
  settledMarkets: number | null;
  wonMarkets: number | null;
  /** Conteo del grado: el mismo, pero sin los picks de longshot (elegidos por la cuota
   *  que pagan y no por su probabilidad). Es el que ve el usuario en la app, y el que
   *  usan el badge, el filtro "Accuracy range" y el orden por Accuracy. La columna
   *  "Markets" sigue mostrando el conteo COMPLETO a propósito: ahí interesa saber cuántos
   *  mercados se evaluaron de verdad. */
  gradeSettledMarkets?: number | null;
  gradeWonMarkets?: number | null;
  createdAt: string | null;
  kickoff: string | null;
  homeTeam?: { id: number; name: string; short_name: string; logo: string } | string;
  awayTeam?: { id: number; name: string; short_name: string; logo: string } | string;
}

/**
 * El endpoint pagina con `hasMore` (no con un `total`): el conteo exacto exigiría un
 * COUNT sobre el mismo join con los filtros de grado, y no se usa para nada más.
 * La página venía leyendo `total`, que nunca llegaba, así que la paginación no se
 * renderizaba jamás y la lista se quedaba en las primeras 20 filas.
 */
interface PredictionsResponse {
  items: Prediction[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

interface FilterOptions {
  models: string[];
  competitions: { id: number; name: string; logoUrl: string | null }[];
}

const SETTLEMENT_OPTIONS = ['', 'won', 'lost', 'partial', 'pending', 'void'];

/**
 * Cortes (en % de aciertos) de la escala de grados, tal como los guarda el admin
 * en Config → Prediction grade scale. Los extremos no viajan porque son
 * definitorios: PERFECTO es 100% y FATAL es 0 aciertos.
 */
interface PredictionGradeScale {
  excelente: number;
  bueno: number;
  medio: number;
}

/** Espejo de DEFAULT_PREDICTION_GRADE_SCALE del backend, para pintar mientras carga. */
const DEFAULT_GRADE_SCALE: PredictionGradeScale = { excelente: 75, bueno: 60, medio: 40 };

type AccuracyBucket = '' | 'high' | 'mid' | 'low';
type SortKey =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'accuracy:desc'
  | 'accuracy:asc'
  | 'coverage:desc'
  | 'coverage:asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'accuracy:desc', label: 'Accuracy (high → low)' },
  { value: 'accuracy:asc', label: 'Accuracy (low → high)' },
  { value: 'coverage:desc', label: 'Coverage (high → low)' },
  { value: 'coverage:asc', label: 'Coverage (low → high)' },
];

/**
 * Presets de fecha, sobre el KICKOFF del partido y no sobre la fecha de creación
 * de la fila.
 *
 * "Mañana" no existe como fecha de creación —nunca se genera una predicción en el
 * futuro— pero sí como jornada: son los partidos que se juegan mañana, con su
 * predicción ya emitida. Esa es la pregunta que se hace al abrir esta página, así
 * que los presets viajan por `kickoffFrom`/`kickoffTo`. El rango manual sigue
 * filtrando por fecha de creación, que es otra pregunta distinta y legítima
 * ("qué generó el scheduler tal día").
 */
type DatePreset = 'today' | 'tomorrow' | 'yesterday' | 'week' | 'last7' | 'all';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'tomorrow', label: 'Mañana' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'week', label: 'Esta semana' },
  { value: 'last7', label: 'Últimos 7 días' },
  { value: 'all', label: 'Todo' },
];

/** Preset activo al entrar: lo del día es lo que se viene a mirar. */
const DEFAULT_DATE_PRESET: DatePreset = 'today';

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Ventana [desde, hasta) del preset, en hora LOCAL del navegador.
 *
 * Se construye con `Date` local y se envía en ISO: así "Hoy" es el día que el
 * operador tiene en su reloj y no el día UTC, que a partir de las 20:00 en Caracas
 * ya sería el siguiente y dejaría la lista vacía.
 */
function presetRange(preset: DatePreset): { from: Date; to: Date } | null {
  if (preset === 'all') return null;
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'tomorrow':
      return { from: addDays(today, 1), to: addDays(today, 2) };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case 'week': {
      // Semana de lunes a domingo: la jornada se piensa así, no de domingo a sábado.
      const dow = today.getDay(); // 0 = domingo
      const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
      return { from: monday, to: addDays(monday, 7) };
    }
    case 'last7':
      return { from: addDays(today, -6), to: addDays(today, 1) };
  }
}

export default function PredictionsPage() {
  const [page, setPage] = useState(1);
  const [settlement, setSettlement] = useState('');
  const [model, setModel] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accuracyBucket, setAccuracyBucket] = useState<AccuracyBucket>('');
  const [sort, setSort] = useState<SortKey>('createdAt:desc');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const [showCustomRange, setShowCustomRange] = useState(false);

  // La escala de grados vive en credits_config (Config → Prediction grade scale).
  // Se lee aquí para que el badge gradúe con los mismos cortes que la app y el
  // push, en vez de con una copia hardcodeada que se desincroniza al primer
  // cambio en el panel.
  const { data: gradeConfig } = useQuery<{ predictionGradeScale?: PredictionGradeScale }>({
    queryKey: ['credits-config-grade-scale'],
    queryFn: () => api.get('/admin/credits-config'),
    staleTime: 5 * 60_000,
  });
  const gradeScale = gradeConfig?.predictionGradeScale ?? DEFAULT_GRADE_SCALE;

  const { data: options } = useQuery<FilterOptions>({
    queryKey: ['predictions-filter-options'],
    queryFn: () => api.get('/admin/predictions/filter-options'),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery<PredictionsResponse>({
    queryKey: ['predictions', page, settlement, model, competitionId, from, to, accuracyBucket, sort, datePreset],
    queryFn: () => {
      const [sortBy, sortOrder] = sort.split(':');
      const params = new URLSearchParams({ page: String(page), pageSize: '20', sortBy, sortOrder });
      if (settlement) params.set('settlement', settlement);
      if (model) params.set('model', model);
      if (competitionId) params.set('competitionId', competitionId);
      const kickoffRange = presetRange(datePreset);
      if (kickoffRange) {
        params.set('kickoffFrom', kickoffRange.from.toISOString());
        params.set('kickoffTo', kickoffRange.to.toISOString());
      }
      if (from) params.set('from', new Date(from).toISOString());
      if (to) {
        // Include the entire "to" day by pushing to 23:59:59.999 local time
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        params.set('to', d.toISOString());
      }
      if (accuracyBucket) params.set('accuracyBucket', accuracyBucket);
      return api.get(`/admin/predictions?${params}`);
    },
  });

  const resetToFirstPage = () => setPage(1);

  const clearFilters = () => {
    setSettlement('');
    setModel('');
    setCompetitionId('');
    setFrom('');
    setTo('');
    setAccuracyBucket('');
    setSort('createdAt:desc');
    setDatePreset(DEFAULT_DATE_PRESET);
    setShowCustomRange(false);
    setPage(1);
  };

  const columns: Column<Prediction>[] = [
    {
      key: 'match',
      header: 'Match',
      render: (row) => {
        const home = typeof row.homeTeam === 'object' ? row.homeTeam?.name : row.homeTeam;
        const away = typeof row.awayTeam === 'object' ? row.awayTeam?.name : row.awayTeam;
        return (
          <span className="text-text-primary font-medium">
            {home && away ? `${home} vs ${away}` : `Match #${row.matchId}`}
          </span>
        );
      },
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => <span className="text-text-secondary text-xs">{row.model}</span>,
    },
    {
      key: 'coverage',
      header: 'Coverage',
      render: (row) => (
        <span className="text-text-secondary">{row.coverageScore != null ? `${row.coverageScore}%` : '—'}</span>
      ),
    },
    {
      key: 'settlement',
      header: 'Settlement',
      render: (row) => {
        if (row.settlement === 'pending' || row.settlement === 'void') {
          return <StatusBadge status={row.settlement} />;
        }
        // El badge grada con el MISMO conteo que la app: el del grado, que excluye los
        // picks de valor. Se cae al completo en lo liquidado antes de la migración 0168.
        const gradeSettled =
          row.gradeSettledMarkets != null && row.gradeSettledMarkets > 0
            ? row.gradeSettledMarkets
            : row.settledMarkets;
        const gradeWon =
          row.gradeSettledMarkets != null && row.gradeSettledMarkets > 0
            ? (row.gradeWonMarkets ?? 0)
            : row.wonMarkets;
        if (gradeWon != null && gradeSettled != null && gradeSettled > 0) {
          const pct = Math.round((gradeWon / gradeSettled) * 100);
          let label: string;
          let colorClass: string;
          // Escala única compartida con la app (prediction_grade.dart) y el push
          // de resultado (shared/prediction-grade.ts): mismos cortes (los del
          // admin), mismos nombres, mismos colores. Cero aciertos es su propio
          // grado: no es "poco", es no haber acertado nada.
          if (gradeWon <= 0) {
            label = 'FATAL'; colorClass = 'bg-danger/15 text-danger';
          } else if (pct >= 100) {
            label = 'PERFECTO'; colorClass = 'bg-success/15 text-success';
          } else if (pct >= gradeScale.excelente) {
            label = 'EXCELENTE'; colorClass = 'bg-success/15 text-success';
          } else if (pct >= gradeScale.bueno) {
            label = 'BUENO'; colorClass = 'bg-secondary/15 text-secondary';
          } else if (pct >= gradeScale.medio) {
            label = 'MEDIO'; colorClass = 'bg-warning/15 text-warning';
          } else {
            label = 'BAJO'; colorClass = 'bg-danger/15 text-danger';
          }
          return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide w-fit ${colorClass}`}>
              {label} ({pct}%)
            </span>
          );
        }
        return <StatusBadge status={row.settlement} />;
      },
    },
    {
      key: 'markets',
      header: 'Markets',
      render: (row) => (
        <span className="text-text-muted text-xs">
          {row.wonMarkets != null && row.settledMarkets != null
            ? `${row.wonMarkets}/${row.settledMarkets}`
            : '—'}
        </span>
      ),
    },
    {
      // Ahora que la lista se filtra por jornada, la fecha que se busca en la fila es
      // la del PARTIDO. La de generación se queda al lado porque es la que delata un
      // scheduler que llegó tarde.
      key: 'kickoff',
      header: 'Kickoff',
      render: (row) => <span className="text-text-secondary text-xs">{formatDateTime(row.kickoff)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Link href={`/predictions/${row.id}`} className="text-secondary text-xs hover:underline">
          View
        </Link>
      ),
    },
  ];

  const selectClass =
    'h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none';

  return (
    <div>
      <PageHeader title="Predictions" description="All generated predictions" />

      <MarketReturnsCard />

      {/* Presets de jornada. Primera fila propia porque es el filtro que se toca
          siempre; los selects de abajo se ajustan una vez y se quedan. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => { setDatePreset(p.value); resetToFirstPage(); }}
            aria-pressed={datePreset === p.value}
            className={`px-3 h-9 rounded-xl text-sm font-sans transition-colors ${
              datePreset === p.value
                ? 'bg-primary/15 text-primary'
                : 'bg-surface-2 border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustomRange((v) => !v)}
          aria-expanded={showCustomRange}
          className={`px-3 h-9 rounded-xl text-sm font-sans transition-colors ${
            from || to
              ? 'bg-secondary/15 text-secondary'
              : 'bg-surface-2 border border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          Rango de generación{from || to ? ' ·' : '…'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={settlement}
          onChange={(e) => { setSettlement(e.target.value); resetToFirstPage(); }}
          className={selectClass}
          aria-label="Settlement"
        >
          <option value="">All settlements</option>
          {SETTLEMENT_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={model}
          onChange={(e) => { setModel(e.target.value); resetToFirstPage(); }}
          className={selectClass}
          aria-label="Model"
        >
          <option value="">All models</option>
          {(options?.models ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={competitionId}
          onChange={(e) => { setCompetitionId(e.target.value); resetToFirstPage(); }}
          className={selectClass}
          aria-label="League"
        >
          <option value="">All leagues</option>
          {(options?.competitions ?? []).map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>

        <select
          value={accuracyBucket}
          onChange={(e) => { setAccuracyBucket(e.target.value as AccuracyBucket); resetToFirstPage(); }}
          className={selectClass}
          aria-label="Accuracy range"
        >
          <option value="">Any accuracy</option>
          <option value="high">&gt; 70%</option>
          <option value="mid">45% – 70%</option>
          <option value="low">&lt; 45%</option>
        </select>

        {showCustomRange && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); resetToFirstPage(); }}
              className={selectClass}
              aria-label="Generada desde"
              title="Generada desde (fecha de creación de la predicción)"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); resetToFirstPage(); }}
              className={selectClass}
              aria-label="Generada hasta"
              title="Generada hasta (fecha de creación de la predicción)"
            />
          </>
        )}

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); resetToFirstPage(); }}
          className={selectClass}
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <Button size="sm" variant="secondary" onClick={clearFilters}>
          Reset
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No predictions found"
      />

      {/* Pagination */}
      {data && (data.hasMore || page > 1) && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-text-muted text-sm font-sans">
            Page {page} · {data.items.length} shown
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={!data.hasMore}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
