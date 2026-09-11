'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';

interface UseComboboxSearchOptions {
  /** Mínimo de caracteres para considerar la búsqueda lista. Default 2. */
  minChars?: number;
  debounceMs?: number;
}

/**
 * Estado de interacción compartido por los combobox de búsqueda (Team/User/
 * Match picker): texto tecleado, versión debounced, índice activo para
 * ↑/↓/Enter, e ids ARIA de combobox/listbox/option. La query de red y el
 * render de filas quedan a cargo de quien lo use — aquí solo vive la
 * interacción, igual en los tres.
 */
export function useComboboxSearch(options?: UseComboboxSearchOptions) {
  const minChars = options?.minChars ?? 2;
  const debounceMs = options?.debounceMs ?? 300;
  const baseId = useId();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // El resaltado se reinicia con CADA búsqueda nueva (cambia el texto
  // debounced), no cuando cambia el número de resultados: dos búsquedas
  // distintas pueden devolver el mismo conteo de filas, y con la dependencia
  // vieja (`results.length`) el índice se quedaba apuntando a la fila de la
  // búsqueda ANTERIOR — Enter elegía una fila que no era la resaltada a
  // propósito por el usuario. Ajuste de estado EN EL RENDER (no en un
  // efecto): comparar contra la última `debouncedQuery` vista.
  const [lastDebouncedQuery, setLastDebouncedQuery] = useState(debouncedQuery);
  if (debouncedQuery !== lastDebouncedQuery) {
    setLastDebouncedQuery(debouncedQuery);
    setActiveIndex(0);
  }

  const searchReady = debouncedQuery.trim().length >= minChars;

  const resetQuery = () => {
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
  };

  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  /** Para `aria-activedescendant` del input: sin filas, no hay opción activa. */
  const activeDescendantId = (resultCount: number) => (resultCount > 0 ? optionId(activeIndex) : undefined);

  return {
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
  };
}

/**
 * Navegación de teclado de un combobox: ↑/↓ mueven el resaltado, Enter elige
 * la fila resaltada, Esc cierra. `onEnter` no recibe el índice: la closure del
 * llamador ya captura el `activeIndex` del render vigente, así que no hace
 * falta pasarlo dos veces.
 */
export function comboboxKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  resultCount: number,
  setActiveIndex: (updater: (index: number) => number) => void,
  onEnter: () => void,
  onEscape: () => void,
): void {
  if (e.key === 'ArrowDown' && resultCount > 0) {
    e.preventDefault();
    setActiveIndex((i) => Math.min(i + 1, resultCount - 1));
  } else if (e.key === 'ArrowUp' && resultCount > 0) {
    e.preventDefault();
    setActiveIndex((i) => Math.max(i - 1, 0));
  } else if (e.key === 'Enter' && resultCount > 0) {
    e.preventDefault();
    onEnter();
  } else if (e.key === 'Escape') {
    onEscape();
  }
}
