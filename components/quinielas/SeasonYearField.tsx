'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SeasonCandidate {
  seasonYear: string;
  label: string;
  standings: number;
  ranking: number;
}

export interface SeasonPreview {
  suggested: string;
  suggestedLabel: string;
  isNationalTeamCompetition: boolean;
  /** Bajo qué temporada aterrizan las tablas al sincronizar. */
  syncWritesUnder: string;
  candidates: SeasonCandidate[];
}

/**
 * Elige la temporada de una quiniela sin escribirla a mano.
 *
 * El año tecleado ya causó un fallo caro y silencioso: la quiniela de la
 * Champions 2026/27 se creó como <strong>2027</strong> —el año de fin, que es
 * como se lee el nombre del torneo— mientras el sistema guarda esa temporada
 * como <strong>2026</strong>, el de inicio. No falló nada visible: las tablas se
 * sincronizaron, los jobs completaron sin error, y la quiniela se quedó mirando
 * un cajón vacío.
 *
 * Aquí el año lo deriva el backend de la fecha de inicio que ya se eligió, con
 * la misma función que usa el sincronizador al escribir las tablas. Y cada
 * candidata viene con cuántos datos tiene guardados, para que un desajuste se
 * vea antes de crear nada.
 */
export function SeasonYearField({
  competitionId,
  startsAt,
  value,
  onChange,
  disabled,
  disabledReason,
}: {
  competitionId: number | '';
  /** Fecha de inicio del torneo, en el formato del `datetime-local`. */
  startsAt: string;
  value: string;
  onChange: (seasonYear: string) => void;
  disabled?: boolean;
  /** Por qué no se puede cambiar (con picks ya generados, por ejemplo). */
  disabledReason?: string;
}) {
  const parsedStart = startsAt ? new Date(startsAt) : null;
  const validStart = parsedStart !== null && !Number.isNaN(parsedStart.getTime());
  const enabled = competitionId !== '' && validStart;

  const { data: preview, isLoading } = useQuery<SeasonPreview>({
    queryKey: ['season-preview', competitionId, startsAt],
    enabled,
    queryFn: () =>
      api.get(
        `/admin/quinielas/season-preview?competitionId=${competitionId}&startsAt=${encodeURIComponent(
          // `enabled` ya garantiza que la fecha es válida: sin ese guard, un
          // `toISOString()` sobre una fecha inválida lanza dentro del queryFn y
          // el campo se queda mudo, sin chips y sin "Calculando…".
          (parsedStart as Date).toISOString(),
        )}`,
      ) as Promise<SeasonPreview>,
  });

  // Si el operador eligió una temporada a mano, mandan sus dedos. Si no, el
  // campo sigue a la sugerida.
  //
  // La distinción hay que guardarla: mirar solo `value === ''` dejaba el
  // formulario en un estado mudo en cuanto se corregía la fecha después del
  // autorrelleno. Con inicio en 2026 se autorrellenaba `2026`; al cambiar la
  // fecha a 2029 las candidatas pasaban a 2028/2029/2030, ningún chip quedaba
  // marcado, y el formulario enviaba igualmente `2026` — un valor que ya no
  // aparecía en ninguna parte de la pantalla.
  //
  // Arranca en `true` cuando el campo nace con valor: eso solo pasa al EDITAR una
  // quiniela existente, y ahí la sugerida es una recomendación, no algo que deba
  // aplicarse sola nada más abrir el editor. En el alta el campo nace vacío y sí
  // sigue a la fecha.
  const chosenByHand = useRef(value !== '');

  const pick = (seasonYear: string): void => {
    chosenByHand.current = true;
    onChange(seasonYear);
  };

  useEffect(() => {
    if (!preview) return;
    if (chosenByHand.current && value !== '') return;
    if (value !== preview.suggested) onChange(preview.suggested);
  }, [preview, value, onChange]);

  const candidates = preview?.candidates ?? [];
  const selected = candidates.find((c) => c.seasonYear === value);

  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
        Temporada
      </label>

      {!enabled && (
        <p className="text-xs text-text-muted font-sans py-2">
          Elige la competición y la fecha de inicio: la temporada se deduce de ahí.
        </p>
      )}

      {enabled && isLoading && (
        <p className="text-xs text-text-muted font-sans py-2">Calculando…</p>
      )}

      {enabled && preview && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => {
              const isSuggested = c.seasonYear === preview.suggested;
              const active = c.seasonYear === value;
              return (
                <button
                  key={c.seasonYear}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(c.seasonYear)}
                  title={
                    disabled
                      ? disabledReason
                      : `${c.standings} equipos en la tabla · ${c.ranking} filas de ranking`
                  }
                  className={`px-2.5 h-9 rounded-xl text-sm font-sans transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-primary text-background font-semibold'
                      : 'bg-surface-2 border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {c.label}
                  <span
                    className={`ml-1.5 text-[11px] tabular-nums ${
                      active ? 'opacity-70' : c.standings > 0 ? 'text-success' : 'text-text-muted'
                    }`}
                  >
                    {c.standings}
                  </span>
                  {isSuggested && (
                    <span className={`ml-1 text-[10px] ${active ? 'opacity-70' : 'text-text-muted'}`}>
                      sugerida
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-text-muted font-sans mt-1.5 leading-relaxed">
            {preview.isNationalTeamCompetition
              ? 'Torneo de selecciones: la temporada es el año de la edición.'
              : 'Torneo de clubes: la temporada es el año de INICIO (la 2026/27 se guarda como 2026).'}{' '}
            El número es cuántos equipos hay en la tabla de esa temporada.
          </p>

          {selected && selected.standings === 0 && (
            <p className="text-[11px] text-warning font-sans mt-1">
              No hay ningún equipo guardado en esa temporada, así que la generación no encontraría a
              nadie.{' '}
              {preview.syncWritesUnder === selected.seasonYear ? (
                <>Sincroniza la tabla desde Teams → &quot;Sync Table&quot;.</>
              ) : (
                <>
                  {/* Decir "dale a Sync Table" sería mandar a un bucle: ese botón
                      escribe bajo la temporada que la competición tiene fijada, no
                      bajo la que necesita la quiniela. */}
                  Ojo: al sincronizar, las tablas de esta competición se guardan bajo{' '}
                  <strong>{preview.syncWritesUnder}</strong>, no bajo {selected.seasonYear}. Ajusta
                  la temporada de la competición en Competitions antes de sincronizar, o elige aquí
                  la que ya tiene datos.
                </>
              )}
            </p>
          )}

          {disabled && disabledReason && (
            <p className="text-[11px] text-text-muted font-sans mt-1">{disabledReason}</p>
          )}
        </>
      )}
    </div>
  );
}
