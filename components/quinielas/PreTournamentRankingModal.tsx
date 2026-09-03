'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { isCountryFlagUrl } from '@/lib/utils';

interface QualifiedTeam {
  teamId: number;
  name: string;
  logo: string | null;
  groupKey: string | null;
  /** Posicion real en `competition_standings`. Null si el equipo aun no tiene. */
  standingsRank: number | null;
  currentRank: number | null;
  rankSource: string | null;
}

/**
 * Orden de la TABLA de posiciones: grupo, y dentro del grupo la posicion real.
 * El nombre solo desempata cuando falta `standingsRank` en ambos.
 *
 * Ordenar por nombre seria alfabetico, no "orden de la tabla" — y como este
 * orden acaba siendo el ancla que el LLM usa para `dark_horse` y
 * `first_eliminated`, guardar una lista A-Z creyendo que es la clasificacion
 * mete ruido directo en las predicciones. Espeja `compareByStandings` del
 * backend (`quiniela-admin.service.ts`).
 */
function compareByStandings(a: QualifiedTeam, b: QualifiedTeam): number {
  const byGroup = (a.groupKey ?? '').localeCompare(b.groupKey ?? '');
  if (byGroup !== 0) return byGroup;
  if (a.standingsRank != null && b.standingsRank != null) return a.standingsRank - b.standingsRank;
  if (a.standingsRank != null) return -1;
  if (b.standingsRank != null) return 1;
  return a.name.localeCompare(b.name);
}

/**
 * Siembra manual de `competition_pre_tournament_ranking`.
 *
 * Es el ultimo gate de `assertMinDataCoverage`: sin al menos una fila para la
 * (competicion, temporada) no se puede generar la Phase 1. Hasta ahora el panel
 * solo ofrecia "Sync FIFA ranking", que es de SELECCIONES y no sirve para un
 * torneo de clubes como la Champions.
 *
 * El orden que se guarda aqui es el ancla mas fuerte que ve el LLM para los
 * picks de `dark_horse` y `first_eliminated`, asi que la posicion 1 debe ser el
 * favorito y la ultima el equipo con menos opciones.
 */
export function PreTournamentRankingModal({
  competitionId,
  seasonYear,
  open,
  onClose,
}: {
  competitionId: number;
  seasonYear: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<QualifiedTeam[]>({
    queryKey: ['qualified-teams', competitionId, seasonYear],
    queryFn: () =>
      api.get(
        `/admin/competitions/${competitionId}/qualified-teams?seasonYear=${encodeURIComponent(seasonYear)}`,
      ),
    enabled: open,
  });

  // `null` = todavia no se ha tocado nada, asi que manda lo que devuelve el
  // servidor. En cuanto el admin reordena, este override pasa a ser la verdad.
  // Se deriva en vez de sincronizarse con un useEffect: copiar `data` a estado
  // dentro de un efecto provoca renders en cascada (regla
  // react-hooks/set-state-in-effect) y ademas pisaria el orden a medio editar
  // cada vez que react-query refresca la query.
  const [reordered, setReordered] = useState<QualifiedTeam[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const order = reordered ?? data ?? [];

  // Al cerrar se descarta el borrador: la proxima apertura parte de lo que hay
  // guardado en el servidor, no de una edicion abandonada.
  const handleClose = () => {
    setReordered(null);
    onClose();
  };

  const savedCount = useMemo(
    () => (data ?? []).filter((t) => t.currentRank != null).length,
    [data],
  );
  const existingSource = useMemo(
    () => (data ?? []).find((t) => t.rankSource)?.rankSource ?? null,
    [data],
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setReordered(next);
  };

  const resetToStandings = () => {
    setReordered([...order].sort(compareByStandings));
  };

  const save = useMutation({
    mutationFn: () =>
      api.post(`/admin/competitions/${competitionId}/pre-tournament-ranking`, {
        seasonYear,
        source: 'ADMIN_MANUAL',
        entries: order.map((team, index) => ({ teamId: team.teamId, rank: index + 1 })),
      }),
    onSuccess: (result: unknown) => {
      const { inserted, unmatchedNames } = (result ?? {}) as {
        inserted?: number;
        unmatchedNames?: string[];
      };
      // `unmatchedNames` solo se llena cuando se manda `teamName` sin `teamId`,
      // y aqui siempre mandamos el id. Si aun asi vuelve algo, se avisa en vez
      // de dar por bueno un guardado incompleto.
      if (unmatchedNames && unmatchedNames.length > 0) {
        toast.error(`No se pudieron resolver: ${unmatchedNames.join(', ')}`);
      } else {
        toast.success(`Ranking guardado: ${inserted ?? order.length} equipos.`);
      }
      queryClient.invalidateQueries({ queryKey: ['qualified-teams', competitionId, seasonYear] });
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="Ranking pre-torneo"
      description={`${seasonYear} · ${order.length} equipos · arrastra para ordenar del favorito (1) al ultimo`}
      info={
        <>
          Es el ultimo requisito para generar la Phase 1: sin ninguna fila guardada, la generacion
          se rechaza. El orden es el ancla mas fuerte que ve el modelo para elegir la revelacion
          (<span className="font-mono">dark_horse</span>) y el primer eliminado
          (<span className="font-mono">first_eliminated</span>), asi que colocalo con criterio: el 1
          es el maximo favorito. Guardar <strong>reemplaza por completo</strong> el ranking anterior
          de esta competicion y temporada.
        </>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={resetToStandings} disabled={order.length === 0}>
            <RotateCcw size={14} /> Orden de la tabla
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={save.isPending}
            disabled={order.length === 0}
            onClick={() => (savedCount > 0 ? setConfirmOpen(true) : save.mutate())}
          >
            Guardar ranking
          </Button>
        </>
      }
    >
      {isLoading && <p className="text-sm text-text-muted font-sans">Cargando equipos...</p>}

      {!isLoading && order.length === 0 && (
        <p className="text-sm text-text-muted font-sans">
          No hay equipos en <span className="font-mono">competition_standings</span> para{' '}
          {seasonYear}. Sincroniza la tabla antes de sembrar el ranking.
        </p>
      )}

      {!isLoading && order.length > 0 && (
        <>
          <p className="text-xs text-text-muted font-sans mb-3">
            {savedCount > 0
              ? `Ya hay un ranking guardado (${savedCount} equipos, fuente ${existingSource ?? '—'}). Al guardar se sustituye.`
              : 'Todavia no hay ranking guardado para esta temporada.'}
          </p>

          <ol className="space-y-1">
            {order.map((team, index) => (
              <li
                key={team.teamId}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 border transition-colors ${
                  dragIndex === index
                    ? 'border-primary/50 bg-surface-3'
                    : 'border-border bg-surface-2 hover:border-primary/30'
                }`}
              >
                <GripVertical size={14} className="shrink-0 text-text-muted cursor-grab" />
                <span className="w-7 shrink-0 text-sm font-semibold tabular-nums text-text-primary font-sans">
                  {index + 1}
                </span>
                {team.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.logo}
                    alt=""
                    className={`w-6 h-6 shrink-0 ${isCountryFlagUrl(team.logo) ? 'object-cover rounded-[3px]' : 'object-contain'}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-6 h-6 shrink-0 rounded-full bg-surface-3" />
                )}
                <span className="flex-1 min-w-0 truncate text-sm text-text-primary font-sans">
                  {team.name}
                </span>
                {team.groupKey && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-text-muted font-sans">
                    {team.groupKey}
                  </span>
                )}
                {/* Alternativa accesible al drag: sin esto el orden no se puede
                    cambiar con teclado ni desde un trackpad incomodo. */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Subir ${team.name}`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${team.name}`}
                    disabled={index === order.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>

    {/* La advertencia de que se reemplaza el snapshot vivia solo dentro del popover
        de ayuda. La convencion del panel es que lo destructivo se confirme de forma
        visible, asi que solo se pregunta cuando de verdad hay algo que pisar. */}
    <ConfirmDialog
      open={confirmOpen}
      variant="danger"
      title="Reemplazar el ranking guardado"
      message={`Vas a sustituir el ranking actual (${savedCount} equipos, fuente ${existingSource ?? '—'}) por este orden manual de ${order.length}. No se puede deshacer.`}
      confirmLabel="Reemplazar"
      cancelLabel="Cancelar"
      loading={save.isPending}
      onConfirm={() => {
        setConfirmOpen(false);
        save.mutate();
      }}
      onClose={() => setConfirmOpen(false)}
    />
    </>
  );
}
