'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMounted } from '@/lib/use-mounted';

interface InfoPopoverProps {
  /** Qué explica este icono. Va al aria-label del disparador. */
  label: string;
  /** La explicación. Texto o JSX. */
  children: React.ReactNode;
  className?: string;
}

const PANEL_WIDTH = 300;
const VIEWPORT_PADDING = 12;
const OPEN_DELAY_MS = 120;
/** Gracia al salir para poder llevar el ratón del icono al panel sin que se cierre. */
const CLOSE_DELAY_MS = 150;

/**
 * Icono ⓘ que abre la explicación de un control en un popover flotante, en vez
 * de imprimirla como párrafo debajo de la etiqueta. Es el único lenguaje de ayuda
 * del panel: lo usan Field, Card/SectionCard, PageHeader y Modal.
 *
 * Hover para ojear, clic para fijar: fijado solo lo cierran Escape o un clic
 * fuera, así puedes leerlo con calma o seleccionar el texto. En táctil no hay
 * hover, por eso el clic tiene que fijar.
 *
 * El panel se portea a document.body con posición calculada: dentro de una card
 * o un modal, `overflow` lo recortaría. Por eso el clic-fuera comprueba DOS refs
 * (el wrapper y el panel porteado) — con solo el wrapper, un clic dentro del
 * popover se leería como "fuera" y lo cerraría. Mismo patrón que ActionMenu.
 */
export function InfoPopover({ label, children, className }: InfoPopoverProps) {
  const mounted = useMounted();
  const panelId = useId();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = pinned || hovered;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setHovered(true), OPEN_DELAY_MS);
  }, [clearTimer]);

  const scheduleClose = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Posición: debajo del icono, alineado a su izquierda. Vuelca arriba si no cabe
  // y se recorta al viewport en horizontal. Se recalcula al hacer scroll (en fase
  // de captura, para enterarse del scroll de contenedores internos) y al resize.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = wrapRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = panelHeight > 0 && spaceBelow < panelHeight + VIEWPORT_PADDING && rect.top > spaceBelow;
      const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - PANEL_WIDTH - VIEWPORT_PADDING);
      const top = flipUp ? rect.top - panelHeight - 8 : rect.bottom + 8;
      const left = Math.min(Math.max(VIEWPORT_PADDING, rect.left), maxLeft);
      // Devolver el mismo objeto si no se movió: si no, cada evento de scroll
      // provocaría un re-render aunque la posición fuese idéntica.
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    };

    // El scroll se agrupa en un frame para no encadenar getBoundingClientRect +
    // setState en cada evento (layout thrashing con el popover abierto).
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    // El panel ya está en el DOM (se monta con `open`, oculto hasta medirlo), así
    // que esta primera pasada ya conoce su altura real y puede decidir el volteo.
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      // Se descarta la posición al cerrar: si el disparador se movió mientras
      // tanto, reabrir con la posición vieja pintaría un frame en el sitio malo.
      setPos(null);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPinned(false);
      setHovered(false);
    };
    // En CAPTURA + stopPropagation: dentro de un modal, el Modal también escucha
    // Escape en document. Sin esto, una sola pulsación cerraría el popover Y el
    // modal que hay detrás. Al capturarlo antes, Escape solo cierra el popover.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPinned(false);
      setHovered(false);
    };
    // Tabular fuera con el popover fijado también lo cierra: si no, el panel se
    // queda flotando sin nada que lo ancle para quien navega con teclado.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPinned(false);
      setHovered(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [pinned]);

  return (
    <span
      ref={wrapRef}
      className={cn('inline-flex flex-none align-middle', className)}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => {
          clearTimer();
          // Fijar y soltar mueven AMBOS estados. Si al soltar dejáramos `hovered`
          // en true, en táctil (donde no hay mouseleave que lo baje) el popover
          // quedaría abierto para siempre: `pinned` ya es false, así que tampoco
          // habría listener de clic-fuera ni de Escape para cerrarlo.
          const next = !pinned;
          setPinned(next);
          setHovered(next);
        }}
        onFocus={() => {
          clearTimer();
          setHovered(true);
        }}
        onBlur={() => {
          if (!pinned) scheduleClose();
        }}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border transition-colors cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-primary/40',
          open ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-primary',
        )}
      >
        <Info size={11} />
      </button>
      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            // Fijado deja de ser un tooltip: el panel admite puntero y se queda
            // para poder leerlo o seleccionar el texto. `note` describe eso sin
            // arrastrar las obligaciones de foco que impone `dialog`.
            role={pinned ? 'note' : 'tooltip'}
            onMouseEnter={clearTimer}
            onMouseLeave={scheduleClose}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: PANEL_WIDTH,
              // En viewports estrechos el ancho fijo se saldría por la derecha.
              maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
              // Montado pero invisible hasta medirlo: así se conoce su altura en
              // la primera pasada y no hay salto de "abajo" a "arriba" al voltear.
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[200] rounded-2xl border border-border bg-surface-2 p-3 shadow-lg text-xs leading-relaxed text-text-secondary font-sans"
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
