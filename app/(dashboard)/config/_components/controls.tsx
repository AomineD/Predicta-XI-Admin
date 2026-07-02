'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Info, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { ENGINE_LAYERS, type EngineLayerKey } from './constants';
import type { PredictionConfig, SetField, TeamLite } from './types';

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
  const [openInfo, setOpenInfo] = useState<EngineLayerKey | null>(null);

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
                <button
                  type="button"
                  onClick={() => setOpenInfo((cur) => (cur === layer.key ? null : layer.key))}
                  aria-label={`What does "${layer.title}" do?`}
                  aria-expanded={openInfo === layer.key}
                  className={cn(
                    'flex h-5 w-5 flex-none items-center justify-center rounded-full border transition-colors cursor-pointer',
                    openInfo === layer.key
                      ? 'border-primary text-primary'
                      : 'border-border text-text-muted hover:text-text-primary',
                  )}
                >
                  <Info size={11} />
                </button>
                <Toggle value={form[layer.key]} onChange={(v) => setField(layer.key, v)} />
              </div>
              {openInfo === layer.key && (
                <p className="text-xs text-text-muted/70 font-sans mt-2 leading-relaxed">{layer.info}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Selector múltiple de ligas por chips. */
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
  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };
  return (
    <div>
      <p className="text-xs text-text-muted/60 font-sans mb-2">
        {value.length === 0 ? emptyLabel : `${value.length} selected`}
      </p>
      <div className="flex flex-wrap gap-2">
        {leagues.map((l) => (
          <button
            key={l.apiFootballId}
            type="button"
            onClick={() => toggle(l.apiFootballId)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-sans font-medium transition-colors cursor-pointer',
              value.includes(l.apiFootballId)
                ? 'bg-primary text-background'
                : 'bg-surface-3 text-text-secondary hover:text-text-primary',
            )}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Buscador de equipos para excluir (blacklist de combinadas). */
export function TeamBlacklistPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [q, setQ] = useState('');
  const { data: searchResult } = useQuery<{ items: TeamLite[] }>({
    queryKey: ['admin-teams-search', q],
    queryFn: () => api.get(`/admin/teams?search=${encodeURIComponent(q)}&pageSize=20`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
  const { data: selectedTeams } = useQuery<TeamLite[]>({
    queryKey: ['admin-teams-by-ids', value],
    queryFn: async () => {
      if (value.length === 0) return [];
      const all = (await api.get<{ items: TeamLite[] }>(`/admin/teams?pageSize=100`))?.items ?? [];
      const byId = new Map(all.map((t) => [t.id, t]));
      return value.map((id) => byId.get(id)).filter((t): t is TeamLite => !!t);
    },
    enabled: value.length > 0,
  });

  const add = (team: TeamLite) => {
    if (!value.includes(team.id)) onChange([...value, team.id]);
    setQ('');
  };
  const remove = (id: number) => onChange(value.filter((x) => x !== id));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {(selectedTeams ?? []).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-3 text-xs text-text-primary"
          >
            {t.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo} alt="" className="w-4 h-4 rounded-sm" />
            )}
            {t.name}
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-text-muted hover:text-text-primary cursor-pointer"
              aria-label={`Remove ${t.name}`}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-text-muted/60 font-sans">No teams excluded</span>}
      </div>
      <Input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search team by name..."
        className="max-w-sm"
      />
      {q.trim().length >= 2 && (searchResult?.items ?? []).length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface-2">
          {(searchResult?.items ?? [])
            .filter((t) => !value.includes(t.id))
            .slice(0, 10)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-surface-3 cursor-pointer"
              >
                {t.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo} alt="" className="w-5 h-5 rounded-sm" />
                )}
                <span className="text-text-primary">{t.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
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
