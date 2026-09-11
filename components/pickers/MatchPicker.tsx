'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, isCountryFlagUrl } from '@/lib/utils';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFloatingDropdown } from './useFloatingDropdown';
import { useComboboxSearch, comboboxKeyDown } from './useComboboxSearch';

interface MatchTeamRef {
  name: string;
  logo?: string;
}

interface MatchOption {
  id: number;
  kickoff: string | null;
  status: string;
  competitionName?: string;
  homeTeam: MatchTeamRef | null;
  awayTeam: MatchTeamRef | null;
}

interface MatchesResponse {
  items: MatchOption[];
}

interface MatchPickerProps {
  /** Id interno del partido — igual que hoy manda el botón que lo consume. */
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
}

/** Escudo con la misma distinción que la página de partidos: banderas de
 *  selección con recorte de bandera, escudos de club con `object-contain`. */
function MatchCrest({ url, name }: { url?: string; name?: string }) {
  const [error, setError] = useState(false);
  if (!url || error) return <span className="w-4 h-4 rounded-sm bg-surface-3 flex-none" />;
  const fit = isCountryFlagUrl(url) ? 'object-cover rounded-[2px]' : 'object-contain';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" title={name} className={cn('w-4 h-4 flex-none', fit)} onError={() => setError(true)} />
  );
}

function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return '—';
  return new Date(kickoff).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Selector de UN partido por búsqueda de equipo, en vez de su id interno
 * escrito a mano. Sin texto, ofrece de entrada los partidos terminados más
 * recientes (`status=FT&order=desc`) — es el caso de uso real de "probar un
 * partido ya jugado". No hay endpoint para resolver un id por sí solo: si
 * `value` llega impuesto sin haber pasado por una búsqueda en esta sesión, se
 * muestra honesto ("Partido #N") en vez de fingir que está vacío.
 */
export function MatchPicker({ value, onChange, placeholder = 'Buscar partido por equipo…', className }: MatchPickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MatchOption | null>(null);
  const {
    query,
    setQuery,
    debouncedQuery,
    activeIndex,
    setActiveIndex,
    resetQuery,
    listboxId,
    optionId,
    activeDescendantId,
  } = useComboboxSearch({ minChars: 0 });
  const { mounted, triggerRef, panelRef, position } = useFloatingDropdown<HTMLInputElement>(open, () => setOpen(false));

  // Un cambio de `value` que no vino de `select()` (el padre lo limpió, o lo
  // impuso a otro id) no puede resolverse aquí sin un endpoint por id: se
  // deja `null` y el bloque "impuesto" de abajo lo pinta honesto en vez de
  // arrastrar los datos cacheados de OTRO partido. Ajuste de estado EN EL
  // RENDER (no en un efecto): comparar contra el último `value` visto.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setSelected((prev) => (prev && prev.id === value ? prev : null));
  }

  const trimmed = debouncedQuery.trim();
  const listQ = useQuery<MatchesResponse>({
    queryKey: trimmed ? ['admin-matches-search', trimmed] : ['admin-matches-recent'],
    queryFn: () =>
      trimmed
        ? api.get(`/admin/matches?search=${encodeURIComponent(trimmed)}&order=desc&pageSize=20`)
        : api.get('/admin/matches?status=FT&order=desc&pageSize=20'),
    enabled: open,
    staleTime: 15_000,
  });
  const results = listQ.data?.items ?? [];

  const select = (match: MatchOption) => {
    setSelected(match);
    onChange(match.id);
    setOpen(false);
    resetQuery();
  };
  const clear = () => {
    setSelected(null);
    onChange(null);
    setOpen(true);
  };

  if (value != null && selected) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <span className="text-xs text-text-muted font-sans flex-none">{formatKickoff(selected.kickoff)}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <MatchCrest url={selected.homeTeam?.logo} name={selected.homeTeam?.name} />
            <span className="text-text-primary text-sm truncate">{selected.homeTeam?.name ?? '?'}</span>
            <span className="text-text-muted/60 text-xs">vs</span>
            <MatchCrest url={selected.awayTeam?.logo} name={selected.awayTeam?.name} />
            <span className="text-text-primary text-sm truncate">{selected.awayTeam?.name ?? '?'}</span>
          </span>
          <StatusBadge status={selected.status} className="flex-none" />
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={clear}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  if (value != null && !selected) {
    return (
      <div className={className}>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <span className="text-text-muted text-sm font-sans flex-1">Partido #{value}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
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
              const match = results[activeIndex];
              if (match) select(match);
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
            className="z-[200] max-h-80 overflow-y-auto rounded-xl border border-border bg-surface-2 shadow-lg"
          >
            {!trimmed && (
              <p className="px-3 py-1.5 text-[11px] text-text-muted/70 font-sans border-b border-border sticky top-0 bg-surface-2">
                Partidos terminados recientes
              </p>
            )}
            {listQ.isFetching ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Cargando…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-muted font-sans">Sin resultados.</p>
            ) : (
              results.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  id={optionId(i)}
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(m)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-sans cursor-pointer',
                    i === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-3',
                  )}
                >
                  <span className="text-text-muted w-24 flex-none truncate">{formatKickoff(m.kickoff)}</span>
                  <span className="flex items-center gap-1 min-w-0 flex-1">
                    <MatchCrest url={m.homeTeam?.logo} name={m.homeTeam?.name} />
                    <span className="text-text-primary truncate">{m.homeTeam?.name ?? '?'}</span>
                    <span className="text-text-muted/50 flex-none">–</span>
                    <MatchCrest url={m.awayTeam?.logo} name={m.awayTeam?.name} />
                    <span className="text-text-primary truncate">{m.awayTeam?.name ?? '?'}</span>
                  </span>
                  <span className="text-text-muted/70 truncate w-20 flex-none text-right">{m.competitionName ?? ''}</span>
                  <StatusBadge status={m.status} className="flex-none" />
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
