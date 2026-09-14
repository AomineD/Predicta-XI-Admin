'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { InfoPopover } from '@/components/ui/InfoPopover';
import styles from './telegram-layout.module.css';

interface ContentTypeCardProps {
  title: string;
  subtitle?: string;
  info?: React.ReactNode;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  schedule: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}

export function ContentTypeCard({ title, subtitle, info, enabled, onEnabledChange, schedule, controls, children }: ContentTypeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <section className="mb-3 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-sm font-semibold text-text-primary font-sans">{title}</h2>
          {info && <InfoPopover label={`Qué hace "${title}"`}>{info}</InfoPopover>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Activar ${title}`}
          onClick={() => onEnabledChange(!enabled)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg text-xs text-text-secondary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          <span>{enabled ? 'Activo' : 'Apagado'}</span>
          <span aria-hidden="true" className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full ${enabled ? 'bg-primary' : 'bg-surface-3'}`}>
            <span className={`h-4 w-4 rounded-full bg-background transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted font-sans">{schedule}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {controls}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          {expanded ? 'Contraer' : 'Expandir'}
          <span className="sr-only"> {title}</span>
          <ChevronDown aria-hidden="true" size={15} className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>
      <div id={detailsId} hidden={!expanded} className={`${styles.details} mt-4 border-t border-border pt-2`}>
        {subtitle && <p className="py-2 text-xs text-text-muted font-sans">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
