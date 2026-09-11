'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input, Textarea } from '@/components/ui/inputs';
import { Chip } from './Chip';
import { useFloatingDropdown } from './useFloatingDropdown';
import { useComboboxSearch, comboboxKeyDown } from './useComboboxSearch';

interface UserOption {
  id: string;
  email: string | null;
  displayName: string | null;
}

interface UsersSearchResponse {
  rows: UserOption[];
}

interface UserPickerProps {
  /** UUIDs de usuario — igual que hoy manda el payload de envío. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Tope de ids que admite el modo "pegar lista". Default 5000. */
  maxPaste?: number;
  className?: string;
}

type Mode = 'search' | 'paste';

/** Por encima de esto, pintar un chip por usuario deja de tener sentido (un
 *  pegado masivo son miles): se resume en una línea en vez de explotar el DOM. */
const CHIP_DISPLAY_LIMIT = 30;

function displayLabel(u: UserOption): string {
  return u.displayName ?? u.email ?? `Usuario ${u.id.slice(0, 8)}…`;
}

function parsePastedIds(raw: string, maxPaste: number): { ids: string[]; truncatedFrom: number | null } {
  const all = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (all.length <= maxPaste) return { ids: all, truncatedFrom: null };
  return { ids: all.slice(0, maxPaste), truncatedFrom: all.length };
}

/**
 * Selector múltiple de usuarios por búsqueda (nombre o email), con un modo
 * secundario para pegar una lista de ids de un tirón — el envío masivo
 * original no se pierde, solo deja de ser la única vía. El valor sigue siendo
 * la lista plana de UUIDs: el payload de envío no cambia.
 */
export function UserPicker({ value, onChange, maxPaste = 5000, className }: UserPickerProps) {
  const [mode, setMode] = useState<Mode>('search');
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [knownUsers, setKnownUsers] = useState<Map<string, UserOption>>(new Map());

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

  const searchQ = useQuery<UsersSearchResponse>({
    queryKey: ['admin-users-search', debouncedQuery],
    queryFn: () => api.get(`/admin/users?search=${encodeURIComponent(debouncedQuery)}&pageSize=20`),
    enabled: searchReady,
    staleTime: 30_000,
  });
  const results = useMemo(
    () => (searchQ.data?.rows ?? []).filter((u) => !value.includes(u.id)),
    [searchQ.data, value],
  );

  // Cachea lo que va apareciendo en resultados de búsqueda, para poder pintar
  // el nombre/email de un chip aunque el usuario ya no esté en la página
  // actual de resultados. Sin esto, un id elegido y luego re-buscado con otro
  // texto perdería su etiqueta. Ajuste de estado EN EL RENDER (no en un
  // efecto): se compara la referencia de `searchQ.data` contra la última vista.
  const [lastSearchData, setLastSearchData] = useState(searchQ.data);
  if (searchQ.data !== lastSearchData) {
    setLastSearchData(searchQ.data);
    const rows = searchQ.data?.rows;
    if (rows && rows.length > 0) {
      setKnownUsers((prev) => {
        const next = new Map(prev);
        for (const u of rows) next.set(u.id, u);
        return next;
      });
    }
  }

  const select = (user: UserOption) => {
    onChange([...value, user.id]);
    resetQuery();
    triggerRef.current?.focus();
  };
  const remove = (id: string) => onChange(value.filter((x) => x !== id));

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'paste') setPasteText(value.join('\n'));
    setPasteNote(null);
    setMode(next);
  };

  const onPasteChange = (raw: string) => {
    setPasteText(raw);
    const { ids, truncatedFrom } = parsePastedIds(raw, maxPaste);
    setPasteNote(truncatedFrom ? `Se tomaron los primeros ${maxPaste} de ${truncatedFrom} pegados.` : null);
    onChange(ids);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-2">
        {(['search', 'paste'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-sans font-medium transition-colors cursor-pointer',
              mode === m ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-primary',
            )}
          >
            {m === 'search' ? 'Buscar' : 'Pegar lista de ids'}
          </button>
        ))}
        <span className="text-[11px] text-text-muted/60 font-sans ml-1">
          {value.length} seleccionado{value.length === 1 ? '' : 's'}
        </span>
      </div>

      {mode === 'search' ? (
        <>
          {value.length > 0 && value.length <= CHIP_DISPLAY_LIMIT && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {value.map((id) => {
                const user = knownUsers.get(id);
                return user ? (
                  <Chip key={id} label={displayLabel(user)} onRemove={() => remove(id)} removeLabel={`Quitar ${displayLabel(user)}`} />
                ) : (
                  <Chip
                    key={id}
                    label={`Usuario ${id.slice(0, 8)}…`}
                    onRemove={() => remove(id)}
                    removeLabel={`Quitar usuario ${id}`}
                    muted
                  />
                );
              })}
            </div>
          )}
          {value.length > CHIP_DISPLAY_LIMIT && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 mb-2">
              <span className="text-xs text-text-secondary font-sans">
                {value.length} usuarios seleccionados — cambia a &quot;Pegar lista de ids&quot; para revisarlos.
              </span>
              <button type="button" onClick={() => onChange([])} className="text-xs text-danger hover:underline font-sans cursor-pointer flex-none">
                Vaciar
              </button>
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
                  const user = results[activeIndex];
                  if (user) select(user);
                },
                () => setOpen(false),
              )
            }
            placeholder="Buscar por nombre o email…"
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
                  results.map((user, i) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      id={optionId(i)}
                      aria-selected={i === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(user)}
                      className={cn(
                        'flex w-full flex-col items-start px-3 py-2 text-left font-sans cursor-pointer',
                        i === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-3',
                      )}
                    >
                      <span className="text-sm text-text-primary truncate w-full">{user.displayName ?? '—'}</span>
                      {user.email && <span className="text-xs text-text-muted/70 truncate w-full">{user.email}</span>}
                    </button>
                  ))
                )}
              </div>,
              document.body,
            )}
        </>
      ) : (
        <>
          <Textarea
            rows={5}
            value={pasteText}
            onChange={(e) => onPasteChange(e.target.value)}
            placeholder={'3f1c...-...\na92b...-...'}
          />
          <p className="text-[11px] text-text-muted/70 font-sans mt-1">
            Un id por línea (o separados por coma/espacio). Máximo {maxPaste.toLocaleString('es')}.
          </p>
          {pasteNote && <p className="text-[11px] text-warning font-sans mt-1">{pasteNote}</p>}
        </>
      )}
    </div>
  );
}
