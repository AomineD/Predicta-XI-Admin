'use client';

import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Input, Select } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { LeaguePicker } from '@/components/pickers/LeaguePicker';
import { TeamPicker } from '@/components/pickers/TeamPicker';
import { ENGINE_LAYERS } from './constants';
import type { PredictionConfig, SetField } from './types';

/** Chips de selección múltiple (mercados de salida, campos de entrada). */
export function MultiCheckbox({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((x) => x !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            'px-3 py-1 rounded-lg text-xs font-sans font-medium transition-colors cursor-pointer',
            value.includes(opt)
              ? 'bg-primary text-background'
              : 'bg-surface-3 text-text-secondary hover:text-text-primary',
          )}
        >
          {opt.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}

/** Tarjeta colapsable con todas las capas del "Motor Predicta calibrado". */
export function PredictionEngineCard({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  const [expanded, setExpanded] = useState(false);

  const enabledCount = ENGINE_LAYERS.filter((l) => form[l.key]).length;
  const allOn = enabledCount === ENGINE_LAYERS.length;

  const toggleAll = (target: boolean) => {
    for (const l of ENGINE_LAYERS) setField(l.key, target);
  };

  return (
    <div className="rounded-2xl mb-4 border border-border bg-surface">
      <div className="flex items-center gap-3 p-5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-3 flex-1 text-left cursor-pointer"
        >
          <ChevronRight
            size={16}
            className="flex-none text-text-muted transition-transform"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
          <div>
            <h2 className="text-sm font-semibold text-text-primary font-sans">Motor Predicta calibrado</h2>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">
              {enabledCount}/{ENGINE_LAYERS.length} capas activas · el interruptor enciende o apaga todas
            </p>
          </div>
        </button>
        <Toggle value={allOn} onChange={toggleAll} />
      </div>

      {expanded && (
        <div className="px-5 pb-2 border-t border-border">
          {ENGINE_LAYERS.map((layer) => (
            <div key={layer.key} className="py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary font-sans flex-1">{layer.title}</span>
                <InfoPopover label={`Qué hace "${layer.title}"`}>{layer.info}</InfoPopover>
                <Toggle value={form[layer.key]} onChange={(v) => setField(layer.key, v)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Selector múltiple de ligas — hoy chips de solo texto, delega en `LeaguePicker`
 * (logo + nombre + país, activo/inactivo). `leagues` ya no aporta datos de
 * render (esa versión no traía logo ni país): pasa a acotar el universo
 * elegible, para que Combinadas siga limitado a las ligas V1 que le entrega su
 * página en vez de a todas las competiciones sincronizadas.
 */
export function LeagueMultiSelect({
  leagues,
  value,
  onChange,
  emptyLabel,
}: {
  leagues: Array<{ apiFootballId: number; name: string }>;
  value: number[];
  onChange: (v: number[]) => void;
  emptyLabel: string;
}) {
  return (
    <LeaguePicker
      value={value}
      onChange={onChange}
      emptyStateText={emptyLabel}
      restrictToIds={leagues.map((l) => l.apiFootballId)}
    />
  );
}

/**
 * Buscador de equipos para excluir (blacklist de combinadas) — delega en
 * `TeamPicker`. Antes resolvía los ya seleccionados pidiendo
 * `/admin/teams?pageSize=100` y cruzando: un equipo fuera de los primeros 100
 * por orden alfabético desaparecía de la vista sin avisar. `TeamPicker` los
 * resuelve con `?ids=`.
 */
export function TeamBlacklistPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return <TeamPicker value={value} onChange={onChange} placeholder="Search team by name..." />;
}

/** Editor de cupones Sportium (competición → slug/URL). */
export function CouponUrlsEditor({
  competitions,
  value,
  onChange,
}: {
  competitions: Array<{ id: number; name: string }>;
  value: Array<{ competitionId: number; url: string }>;
  onChange: (v: Array<{ competitionId: number; url: string }>) => void;
}) {
  const setRow = (i: number, patch: Partial<{ competitionId: number; url: string }>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { competitionId: competitions[0]?.id ?? 0, url: '' }]);

  return (
    <div className="space-y-2 w-full">
      {value.length === 0 && (
        <p className="text-xs text-text-muted/60 font-sans">No coupons set — the module scrapes nothing.</p>
      )}
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            className="w-44 flex-none"
            value={row.competitionId}
            onChange={(e) => setRow(i, { competitionId: Number(e.target.value) })}
          >
            {!competitions.some((c) => c.id === row.competitionId) && (
              <option value={row.competitionId}>#{row.competitionId}</option>
            )}
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input
            type="text"
            value={row.url}
            onChange={(e) => setRow(i, { url: e.target.value })}
            placeholder="soccer-int2-sb_type_296772"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-text-muted hover:text-danger px-2 cursor-pointer"
            aria-label="Remove coupon"
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add} disabled={competitions.length === 0}>
        Add coupon
      </Button>
    </div>
  );
}
