'use client';

import { useEffect, useRef, useState } from 'react';
import { useMounted } from '@/lib/use-mounted';

const VIEWPORT_PADDING = 8;
const GAP = 6;

interface FloatingPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * Posiciona un panel flotante porteado a `document.body`, pegado debajo de su
 * disparador y con su mismo ancho. Mismo patrón que `InfoPopover` (la
 * referencia ya probada de este panel): portal para escapar de cualquier
 * `overflow` de card/modal que lo contenga, clic-fuera con DOS refs
 * (disparador + panel porteado — con solo uno, un clic DENTRO del panel se
 * leería como "fuera" y lo cerraría antes de que el click interno registre) y
 * Escape en fase de captura + `stopPropagation` para no cerrar también un
 * modal que lo envuelva.
 *
 * `onRequestClose` se guarda en un ref para no reabrir los listeners en cada
 * tecla escrita: los combobox que usan esto re-renderizan por cada pulsación,
 * y una closure nueva por render volvería a suscribir document en cada una.
 */
export function useFloatingDropdown<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onRequestClose: () => void,
) {
  const mounted = useMounted();
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  // Reinicia la posición medida al cerrar. Ajuste de estado EN EL RENDER (no en
  // un efecto): si esto viviera en el `useEffect` de abajo, reabrir antes de
  // que se vuelva a medir pintaría un frame con la posición vieja en vez de
  // arrancar oculto hasta la medición fresca.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPosition(null);
  }

  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - rect.width - VIEWPORT_PADDING);
      setPosition({
        top: rect.bottom + GAP,
        left: Math.min(Math.max(VIEWPORT_PADDING, rect.left), maxLeft),
        width: rect.width,
      });
    };
    // El scroll se agrupa en un frame para no encadenar getBoundingClientRect +
    // setState en cada evento (mismo motivo que InfoPopover).
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onRequestCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onRequestCloseRef.current();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return { mounted, triggerRef, panelRef, position };
}
