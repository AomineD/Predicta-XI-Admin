'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { formatDateTime } from '@/lib/utils';

export interface LogoEnrichUnmatchedClub {
  id: number;
  name: string;
  country: string | null;
  /**
   * `no_match`: ni football-data ni TheSportsDB lo tienen con un nombre seguro.
   * `no_crest`: casó en football-data pero sin escudo, y TheSportsDB tampoco lo
   * resolvió. `unverified`: no se pudo comprobar del todo (una liga de
   * football-data o una búsqueda de TheSportsDB no respondió, o no se llegó a
   * buscar por el tope de la pasada).
   */
  reason: 'no_match' | 'no_crest' | 'unverified';
}

/** Lo que aportó TheSportsDB en la pasada. */
export interface LogoEnrichFallbackStats {
  /** Escudos subidos desde TheSportsDB; ya van dentro de `clubsUpdated`. */
  updated: number;
  lookups: number;
  lookupsFailed: number;
  /** Clubes que no se buscaron por el tope de búsquedas de la pasada. */
  notTried: number;
}

/** Respuesta de `GET /admin/logos/enrich-hd/status`. */
export interface LogoEnrichStatus {
  storageConfigured: boolean;
  footballDataConfigured: boolean;
  job: {
    id: number;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: string | null;
    finishedAt: string | null;
    errorLog: string | null;
  } | null;
  /**
   * Si el job de verdad sigue en curso. Un `running` viejo es un huérfano (el
   * proceso murió sin cerrarlo) y viene en `false`. Opcional: un backend anterior
   * no lo manda.
   */
  running?: boolean;
  progress: {
    phase: number;
    totalPhases: number;
    phaseName: string;
    current: number;
    total: number;
    itemLabel: string;
  } | null;
  /** Informe del último job ya terminado. `null` si es anterior a este informe o caducó. */
  report: {
    clubsUpdated: number;
    clubsUnmatched: number;
    unmatchedClubs: LogoEnrichUnmatchedClub[];
    clubsFailed: number;
    /** Ligas cuya lista de equipos no se pudo pedir a football-data. Opcional en informes viejos. */
    competitionsFailed?: string[];
    /** Clubes sin escudo nítido y sin ningún partido: no se buscan ni se listan. Opcional en informes viejos. */
    clubsWithoutMatches?: number;
    /** Opcional en informes viejos. */
    fallback?: LogoEnrichFallbackStats;
    nationalsUpdated: number;
    nationalsFailed: number;
    leaguesUpdated: number;
    leaguesFailed: number;
  } | null;
}

const STATUS_QUERY_KEY = ['logo-enrich-status'] as const;

/** El job reporta sus fases en inglés; aquí se enseñan en español. */
const PHASE_LABELS: Record<number, string> = {
  1: 'Escudos de football-data y emblemas de liga',
  2: 'Escudos de TheSportsDB',
  3: 'Banderas de selecciones',
};
const ITEM_LABELS: Record<string, string> = { competition: 'competición', team: 'equipo' };

/** ¿Hay una pasada en curso de verdad? Un huérfano no cuenta: no bloquea el botón ni se sondea. */
function isPassActive(status: LogoEnrichStatus | undefined): boolean {
  if (!status?.job) return false;
  return status.running ?? status.job.status === 'running';
}

/**
 * Barrido de escudos HD: la misma pasada que el cron diario de las 03:30 UTC,
 * lanzable desde el panel. Antes solo corría por el cron, así que un equipo nuevo
 * se quedaba pixelado hasta la madrugada siguiente.
 *
 * Sondea el estado solo mientras hay un job en curso y, al terminar, refresca la
 * rejilla de equipos para que se vean los escudos nuevos sin recargar.
 */
export function useLogoEnrichment() {
  const qc = useQueryClient();
  const status = useQuery<LogoEnrichStatus>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => api.get('/admin/logos/enrich-hd/status'),
    refetchInterval: (query) => (isPassActive(query.state.data) ? 3_000 : false),
  });

  const launch = useMutation<{ jobId: number }, Error, void>({
    mutationFn: () => api.post('/admin/logos/enrich-hd', {}),
    // También tras un error: un 409 significa que YA hay uno en curso, y el
    // estado fresco es lo que arranca el sondeo de ese.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    },
  });

  const jobStatus = status.data?.job?.status;
  const previousJobStatus = useRef(jobStatus);
  useEffect(() => {
    if (previousJobStatus.current === 'running' && jobStatus && jobStatus !== 'running') {
      void qc.invalidateQueries({ queryKey: ['teams'] });
    }
    previousJobStatus.current = jobStatus;
  }, [jobStatus, qc]);

  return {
    status: status.data,
    /** El estado no se pudo leer: sin esto, la tarjeta simplemente no aparecía. */
    statusError: status.error ? status.error.message : null,
    launch: () => launch.mutate(),
    launching: launch.isPending,
    launchError: launch.error?.message ?? null,
    running: isPassActive(status.data),
    /** Sin almacenamiento el backend responde 503: no tiene sentido ofrecer el botón. */
    storageConfigured: status.data?.storageConfigured !== false,
  };
}

function firstLine(text: string | null): string | null {
  const line = text?.split('\n')[0]?.trim();
  return line ? line : null;
}

/**
 * Estado del barrido de escudos: por qué no se puede lanzar, barra de progreso
 * mientras corre y, al terminar, qué consiguió y qué clubes siguen sin escudo
 * nítido. Esa lista antes no existía: el job solo contaba los que no casaban, y
 * saber cuáles eran obligaba a sacarlo a mano de la base.
 */
export function LogoEnrichmentStatusCard({
  status,
  launchError,
  statusError,
}: {
  status: LogoEnrichStatus | undefined;
  launchError: string | null;
  statusError: string | null;
}) {
  const job = status?.job ?? null;
  const storageMissing = status?.storageConfigured === false;
  if (!job && !launchError && !statusError && !storageMissing) return null;
  const active = isPassActive(status);

  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 text-sm font-sans"
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-text-primary font-medium">Escudos HD</span>
        <InfoPopover label="Qué hace el barrido de escudos HD">
          Cambia el escudo pixelado de Flashscore por uno nítido y lo sube a nuestro almacenamiento:
          primero el de football-data en los clubes de las ligas que cubre; los que no están ahí
          (rivales de previas europeas, equipos de segunda) se buscan en TheSportsDB, hasta{' '}
          40 por pasada y empezando por los que juegan antes; y al final las banderas de las
          selecciones. Corre solo cada día a las 03:30 UTC; el botón lanza esa misma pasada ahora. Un
          club <strong>sin casar</strong> es uno que ninguna de las dos fuentes tiene con un nombre y
          un país seguros, y se queda con el escudo de Flashscore. Uno <strong>sin verificar</strong>{' '}
          no se pudo comprobar del todo: una fuente no respondió o no se llegó a buscar. Los clubes
          sin ningún partido no se buscan ni se listan.
        </InfoPopover>
        {job?.finishedAt && job.status !== 'running' && (
          <span className="text-text-muted text-xs ml-auto">{formatDateTime(job.finishedAt)}</span>
        )}
      </div>

      {/* Los motivos por los que el botón está gris o la tarjeta no dice nada se
          quedan VISIBLES: son la respuesta a «por qué no puedo lanzarlo». */}
      {storageMissing && (
        <p className="text-warning text-xs mt-1">
          No disponible: el servidor no tiene almacenamiento configurado, así que no hay dónde subir los escudos.
        </p>
      )}
      {statusError && <p className="text-danger text-xs mt-1">No se pudo leer el estado del barrido: {statusError}</p>}
      {launchError && <p className="text-danger text-xs mt-1">No se pudo lanzar: {launchError}</p>}

      {job?.status === 'running' && active && <LogoEnrichmentProgress progress={status?.progress ?? null} />}
      {job?.status === 'running' && !active && (
        <p className="text-warning text-xs mt-1">
          El último barrido quedó sin cerrar: el servidor se reinició a mitad. Puedes lanzar otro.
        </p>
      )}
      {job?.status === 'failed' && (
        <p className="text-danger text-xs mt-1">
          El barrido falló{firstLine(job.errorLog) ? `: ${firstLine(job.errorLog)}` : ' sin actualizar ningún escudo.'}
        </p>
      )}
      {job?.status === 'cancelled' && <p className="text-text-muted text-xs mt-1">Cancelado a mitad.</p>}
      {job && job.status !== 'running' && <LogoEnrichmentReport report={status?.report ?? null} />}
    </div>
  );
}

function LogoEnrichmentProgress({ progress }: { progress: LogoEnrichStatus['progress'] }) {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;
  return (
    <div className="mt-2">
      <div
        className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden"
        role="progressbar"
        aria-label="Progreso del barrido de escudos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-text-muted mt-1">
        {progress
          ? `Fase ${progress.phase}/${progress.totalPhases}: ${PHASE_LABELS[progress.phase] ?? progress.phaseName} · ${ITEM_LABELS[progress.itemLabel] ?? progress.itemLabel} ${progress.current}/${progress.total}`
          : 'Arrancando…'}
      </p>
    </div>
  );
}

const REASON_NOTES: Record<LogoEnrichUnmatchedClub['reason'], string> = {
  no_match: '',
  no_crest: ' · football-data lo tiene sin escudo',
  unverified: ' · sin verificar',
};

function LogoEnrichmentReport({ report }: { report: LogoEnrichStatus['report'] }) {
  if (!report) {
    return (
      <p className="text-xs text-text-muted mt-1">
        Sin informe de este barrido: es anterior a esta versión o ya caducó.
      </p>
    );
  }
  const clubs = [...report.unmatchedClubs].sort((a, b) => a.name.localeCompare(b.name));
  const notListed = report.clubsUnmatched - clubs.length;
  const failed = report.clubsFailed + report.nationalsFailed + report.leaguesFailed;
  const unreachable = report.competitionsFailed ?? [];
  const fromTsdb = report.fallback?.updated ?? 0;
  const tsdbFailed = report.fallback?.lookupsFailed ?? 0;
  const notTried = report.fallback?.notTried ?? 0;
  const withoutMatches = report.clubsWithoutMatches ?? 0;

  return (
    <div className="mt-1">
      <p className="text-xs text-text-secondary">
        {report.clubsUpdated} escudos nuevos{fromTsdb > 0 ? ` (${fromTsdb} de TheSportsDB)` : ''} ·{' '}
        {report.leaguesUpdated} emblemas de liga · {report.nationalsUpdated} banderas · {report.clubsUnmatched} clubes
        sin casar · {failed} fallos de descarga
        {withoutMatches > 0 ? ` · ${withoutMatches} sin partidos (no se buscan)` : ''}
      </p>
      {unreachable.length > 0 && (
        <p className="text-warning text-xs mt-1">
          football-data no respondió para {unreachable.length === 1 ? 'una liga' : `${unreachable.length} ligas`} (
          {unreachable.join(', ')}): los clubes que no casaron en las demás figuran «sin verificar», no como sin casar.
        </p>
      )}
      {tsdbFailed > 0 && (
        <p className="text-warning text-xs mt-1">
          TheSportsDB no respondió en {tsdbFailed === 1 ? 'una búsqueda' : `${tsdbFailed} búsquedas`}: esos clubes
          figuran «sin verificar» y se vuelven a buscar en la próxima pasada.
        </p>
      )}
      {notTried > 0 && (
        <p className="text-text-muted text-xs mt-1">
          {notTried === 1 ? 'Un club quedó' : `${notTried} clubes quedaron`} sin buscar en TheSportsDB por el tope de
          búsquedas de cada pasada; figuran «sin verificar». Se busca primero a los que juegan antes.
        </p>
      )}
      {clubs.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-secondary cursor-pointer">
            Ver los clubes que siguen sin escudo nítido
          </summary>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs text-text-muted">
            {clubs.map((club) => (
              <li key={club.id}>
                <span className="text-text-secondary">{club.name}</span>
                {club.country ? ` · ${club.country}` : ''}
                {REASON_NOTES[club.reason] ?? ''}
              </li>
            ))}
          </ul>
          {notListed > 0 && <p className="text-xs text-text-muted mt-1">…y {notListed} más.</p>}
        </details>
      )}
    </div>
  );
}
