'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Chip } from './Chip';

interface LeagueOption {
  id: number;
  apiFootballId: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
  logoCustom: string | null;
  active: boolean;
}

interface LeaguePickerProps {
  /** apiFootballId de las ligas elegidas — igual que hoy guarda cada campo. */
  value: number[];
  onChange: (value: number[]) => void;
  /** Qué significa la lista vacía en ESTE campo. Cambia según el campo ("no
   *  publica nada" frente a "todas"), así que llega por prop y se pinta donde
   *  hoy iba el contador de seleccionadas. */
  emptyStateText: string;
  /** Restringe el universo elegible a estos apiFootballId (p. ej. el whitelist
   *  V1 de Combinadas). Sin esto, el universo es todas las competiciones. */
  restrictToIds?: number[];
  /**
   * Enseña el botón "Todas". Apágalo en campos donde el vacío tiene un
   * significado DINÁMICO (p. ej. `standings_recap`, donde vacío = "ligas
   * destacadas" y se actualiza solo): "Todas" ahí congelaría la lista actual
   * de destacadas en una selección fija, perdiendo ese comportamiento.
   * Default `true`.
   */
  showSelectAll?: boolean;
  className?: string;
}

/**
 * Selector múltiple de ligas por logo + nombre, en vez de una lista de ids
 * separados por coma. Fetch propio de `/admin/competitions` con la MISMA
 * queryKey que usa la página de Competitions (`['competitions']`), para que
 * ambas compartan caché en vez de duplicar la petición.
 */
export function LeaguePicker({
  value,
  onChange,
  emptyStateText,
  restrictToIds,
  showSelectAll = true,
  className,
}: LeaguePickerProps) {
  const [showInactive, setShowInactive] = useState(false);
  const { data, isLoading } = useQuery<LeagueOption[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
    staleTime: 60_000,
  });

  const pool = useMemo(() => {
    const all = data ?? [];
    return restrictToIds ? all.filter((c) => restrictToIds.includes(c.apiFootballId)) : all;
  }, [data, restrictToIds]);

  // Activas siempre, inactivas solo si se piden — PERO una liga ya
  // seleccionada nunca desaparece de la vista por este filtro: si no, "Todas"
  // y el propio hecho de deseleccionarla quedarían fuera del alcance del
  // admin sin que nada lo avise.
  const visible = useMemo(
    () => pool.filter((c) => showInactive || c.active || value.includes(c.apiFootballId)),
    [pool, showInactive, value],
  );

  // Seleccionadas que no están en `pool` (p. ej. fuera de `restrictToIds`, o
  // una competición que ya no existe): no aparecen en la grilla, así que sin
  // esto el admin no tendría forma de verlas ni de quitarlas.
  const orphanIds = useMemo(
    () => value.filter((id) => !pool.some((c) => c.apiFootballId === id)),
    [value, pool],
  );

  const toggle = (apiFootballId: number) => {
    onChange(value.includes(apiFootballId) ? value.filter((x) => x !== apiFootballId) : [...value, apiFootballId]);
  };

  const selectAllVisible = () => {
    // UNIÓN, no reemplazo: si no, una seleccionada fuera de `visible` (una
    // huérfana, o una inactiva oculta tras el filtro) se perdía en silencio.
    onChange(Array.from(new Set([...value, ...visible.map((c) => c.apiFootballId)])));
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-xs text-text-muted/70 font-sans">
          {value.length === 0 ? emptyStateText : `${value.length} seleccionada${value.length === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-pressed={showInactive}
            className={cn(
              'px-2 py-1 rounded-md text-[11px] font-sans transition-colors cursor-pointer',
              showInactive ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-primary',
            )}
          >
            Mostrar inactivas
          </button>
          {showSelectAll && (
            <Button type="button" variant="ghost" size="sm" onClick={selectAllVisible}>
              Todas
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Ninguna
          </Button>
        </div>
      </div>

      {orphanIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {orphanIds.map((id) => (
            <Chip
              key={id}
              label={`Liga #${id} (no disponible)`}
              onRemove={() => onChange(value.filter((x) => x !== id))}
              removeLabel={`Quitar liga #${id}`}
              muted
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-text-muted font-sans py-2">Cargando ligas…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-text-muted font-sans py-2">No hay ligas para mostrar.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 max-h-64 overflow-y-auto pr-1">
          {visible.map((c) => {
            const selected = value.includes(c.apiFootballId);
            const logo = c.logoCustom ?? c.logoUrl;
            return (
              <button
                key={c.apiFootballId}
                type="button"
                onClick={() => toggle(c.apiFootballId)}
                aria-pressed={selected}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer',
                  selected ? 'border-primary bg-primary/10' : 'border-border bg-surface-2 hover:border-text-muted/40',
                )}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="w-6 h-6 object-contain rounded-sm flex-none" />
                ) : (
                  <span className="w-6 h-6 rounded-sm bg-surface-3 flex-none" />
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-text-primary font-sans truncate">{c.name}</span>
                  <span className="block text-[10px] text-text-muted/70 font-sans truncate">
                    {c.country ?? ''}
                    {!c.active && ' · inactiva'}
                  </span>
                </span>
                {selected && (
                  <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-background">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
