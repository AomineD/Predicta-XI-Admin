'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { ConsumoRow } from './types';

export function ActionsDropdown({
  row,
  onViewInfo,
  onViewError,
}: {
  row: ConsumoRow;
  onViewInfo: () => void;
  onViewError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 140;
      const viewportPadding = 12;
      const left = Math.max(viewportPadding, rect.right - menuWidth);

      setMenuStyle({
        top: rect.bottom + 4,
        left,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
      >
        Opciones
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-xl py-1 min-w-[140px] shadow-lg"
          style={{
            top: menuStyle.top,
            left: menuStyle.left,
            background: '#1A2538',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <button
            onClick={() => { onViewInfo(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs font-sans text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            Ver info
          </button>
          <button
            onClick={() => { if (row.error) { onViewError(); setOpen(false); } }}
            disabled={!row.error}
            className={`w-full text-left px-3 py-2 text-xs font-sans transition-colors ${
              row.error
                ? 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                : 'text-text-muted/40 cursor-not-allowed'
            }`}
          >
            Ver error
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
