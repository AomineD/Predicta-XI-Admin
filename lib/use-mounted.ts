'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Devuelve `true` en el cliente (tras hidratar) y `false` en SSR, sin llamar a
 * setState dentro de un effect. Útil para portales (createPortal a document.body)
 * que solo pueden montarse en el cliente.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
