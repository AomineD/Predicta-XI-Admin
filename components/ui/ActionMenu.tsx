'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
  /** Hidden items are filtered out; a section with no visible items is dropped. */
  hidden?: boolean;
}

export interface ActionMenuSection {
  label?: string;
  items: ActionMenuItem[];
}

interface ActionMenuProps {
  sections: ActionMenuSection[];
  label?: string;
  menuWidth?: number;
  className?: string;
}

/**
 * Reusable portal dropdown for grouping secondary page actions behind a single
 * trigger. Items are organised into labelled sections (e.g. DATA / SETTLEMENT /
 * DANGER). Extracted from the ad-hoc dropdowns in matches/consumo so the
 * quiniela toolbar can declutter ~10 buttons into one menu.
 *
 * Outside-click needs BOTH the wrapper ref and the portaled menu ref — the menu
 * lives on document.body, so a single contains() check on the wrapper would
 * treat menu clicks as "outside" and swallow them.
 */
export function ActionMenu({ sections, label = 'Acciones', menuWidth = 224, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden) }))
    .filter((s) => s.items.length > 0);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const update = () => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const left = Math.max(viewportPadding, rect.right - menuWidth);
      setPos({ top: rect.bottom + 6, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, menuWidth]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (visibleSections.length === 0) return null;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-[14px] font-sans border border-border text-text-primary hover:bg-surface-2 transition-colors"
      >
        {label}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-2xl py-1.5 shadow-lg"
          style={{
            top: pos.top,
            left: pos.left,
            width: menuWidth,
            background: '#1A2538',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {visibleSections.map((section, si) => (
            <div
              key={section.label ?? si}
              className={si > 0 ? 'mt-1 pt-1 border-t border-[rgba(255,255,255,0.08)]' : undefined}
            >
              {section.label && (
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted font-sans">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => { item.onClick(); setOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-sans text-left transition-colors',
                      item.disabled
                        ? 'text-text-muted/40 cursor-not-allowed'
                        : item.danger
                          ? 'text-danger hover:bg-danger/10'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-3',
                    )}
                  >
                    {Icon && <Icon size={14} className="shrink-0" />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
