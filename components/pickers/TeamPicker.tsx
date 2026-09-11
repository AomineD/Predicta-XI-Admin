'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/inputs';
import { Chip } from './Chip';
import { useFloatingDropdown } from './useFloatingDropdown';
import { useComboboxSearch, comboboxKeyDown } from './useComboboxSearch';

interface TeamOption {
  id: number;
  name: string;
  logo: string | null;
  country: string | null;
}

interface TeamPickerProps {
  /** Ids internos (`teams.id`) — igual que hoy guarda cada campo. */
  value: number[];
  onChange: (value: number[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Selector múltiple de equipos por búsqueda (escudo + nombre + país), en vez
 * de ids internos escritos a mano. Los seleccionados se resuelven con
 * `GET /admin/teams?ids=...` — no con `pageSize=100` + cruce, que perdía
 * cualquier equipo fuera de los primeros 100 por orden alfabético. Un id que
 * no vuelva en esa respuesta se pinta como chip "no encontrado", removible.
 */
export function TeamPicker({ value, onChange, placeholder = 'Buscar equipo por nombre…', className }: TeamPickerProps) {
  const [open, setOpen] = useState(false);
  const {
    query,
    setQuery,
    debouncedQuery,
    searchReady,
    activeIndex,
    setActiveIndex,
    resetQuery,
    listboxId,
    optionId,
    activeDescendantId,
  } = useComboboxSearch();
  const { mounted, triggerRef, panelRef, position } = useFloatingDropdown<HTMLInputElement>(open, () => setOpen(false));

  const searchQ = useQuery<{ items: TeamOption[] }>({
    queryKey: ['admin-teams-search', debouncedQuery],
    queryFn: () => api.get(`/admin/teams?search=${encodeURIComponent(debouncedQuery)}&pageSize=20`),
    enabled: searchReady,
    staleTime: 30_000,
  });
  const results = useMemo(
    () => (searchQ.data?.items ?? []).filter((t) => !value.includes(t.id)),
    [searchQ.data, value],
  );

  const resolvedQ = useQuery<{ items: TeamOption[] }>({
    queryKey: ['admin-teams-by-ids', value],
    queryFn: () => api.get(`/admin/teams?ids=${value.join(',')}`),
    enabled: value.length > 0,
    staleTime: 30_000,
  });
  const resolvedById = useMemo(
    () => new Map((resolvedQ.data?.items ?? []).map((t) => [t.id, t])),
    [resolvedQ.data],
  );

  const select = (team: TeamOption) => {
    onChange([...value, team.id]);
    resetQuery();
    triggerRef.current?.focus();
  };
  const remove = (id: number) => onChange(value.filter((x) => x !== id));

  return (
    <div className={className}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => {
            const team = resolvedById.get(id);
            return team ? (
              <Chip key={id} label={team.name} avatarUrl={team.logo} onRemove={() => remove(id)} removeLabel={`Quitar ${team.name}`} />
            ) : (
              <Chip
                key={id}
                label={`Equipo #${id} (no encontrado)`}
                onRemove={() => remove(id)}
                removeLabel={`Quitar equipo #${id}`}
                muted
              />
            );
          })}
        </div>
      )}

      <Input
        ref={triggerRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open ? activeDescendantId(results.length) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) =>
          comboboxKeyDown(
            e,
            results.length,
            setActiveIndex,
            () => {
              const team = results[activeIndex];
              if (team) select(team);
            },
            () => setOpen(false),
          )
        }
        placeholder={placeholder}
      />

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            id={listboxId}
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width ?? 'auto',
              visibility: position ? 'visible' : 'hidden',
            }}
            className="z-[200] max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-2 shadow-lg"
          >
            {query.trim().length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Escribe al menos 2 letras para buscar.</p>
            ) : !searchReady ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Escribe al menos 2 letras.</p>
            ) : searchQ.isFetching ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Sin resultados.</p>
            ) : (
              results.map((team, i) => (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  id={optionId(i)}
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(team)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-sans cursor-pointer',
                    i === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-3',
                  )}
                >
                  {team.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.logo} alt="" className="w-5 h-5 object-contain rounded-sm flex-none" />
                  ) : (
                    <span className="w-5 h-5 rounded-sm bg-surface-3 flex-none" />
                  )}
                  <span className="text-text-primary truncate flex-1">{team.name}</span>
                  {team.country && <span className="text-text-muted/60 text-xs flex-none">{team.country}</span>}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
