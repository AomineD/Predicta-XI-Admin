'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/inputs';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { CRITERIA_OPS, type BadgeCriteria, type BadgeMetric } from './types';

interface PreviewResult {
  matched: number;
  evaluated: number;
  sample: number[];
}

/**
 * Constructor de la regla que otorga una insignia nueva.
 *
 * Las condiciones se combinan con Y, no con O, y eso es deliberado: la forma que
 * de verdad hace falta es "muestra mínima Y umbral" —al menos 30 picks Y acierto
 * por debajo del 40 %—, y un árbol con OR anidados sería una regla que nadie
 * puede leer de un vistazo seis meses después.
 *
 * La vista previa no es un adorno. Un umbral mal puesto es invisible en el
 * formulario y solo se descubre cuando el barrido reparte una insignia
 * permanente a media base de usuarios, o cuando no se la da a nadie y nadie se
 * entera nunca.
 */
export function CriteriaBuilder({
  value,
  onChange,
  metrics,
}: {
  value: BadgeCriteria;
  onChange: (v: BadgeCriteria) => void;
  metrics: BadgeMetric[];
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const runPreview = useMutation<PreviewResult, Error>({
    mutationFn: () => api.post('/admin/badges/preview', { criteria: value }) as Promise<PreviewResult>,
    onSuccess: (r) => setPreview(r),
  });

  const conditions = value.all ?? [];
  const metricOf = (key: string): BadgeMetric | undefined => metrics.find((m) => m.key === key);

  const patch = (i: number, next: Partial<{ metric: string; op: string; value: number }>): void => {
    const all = conditions.map((c, idx) => (idx === i ? { ...c, ...next } : c));
    onChange({ all });
    setPreview(null);
  };

  const add = (): void => {
    onChange({ all: [...conditions, { metric: '', op: 'gte', value: 0 }] });
    setPreview(null);
  };

  const remove = (i: number): void => {
    onChange({ all: conditions.filter((_, idx) => idx !== i) });
    setPreview(null);
  };

  const complete =
    conditions.length > 0 &&
    conditions.every((c) => c.metric !== '' && Number.isFinite(c.value));

  // Una regla sin métrica o sin umbral no se puede guardar. El servidor también
  // la rechaza, pero avisar aquí evita que el error aparezca después de haber
  // rellenado los textos y el icono.
  const incomplete = conditions.some((c) => c.metric === '' || !Number.isFinite(c.value));

  return (
    <div className="space-y-3">
      {conditions.map((c, i) => {
        const meta = metricOf(c.metric);
        return (
          <div key={i} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-wide text-text-muted font-sans w-6">
                {i === 0 ? 'Si' : 'y'}
              </span>
              <Select
                value={c.metric}
                onChange={(e) => patch(i, { metric: e.target.value })}
                className="flex-1"
              >
                <option value="">Elige una métrica…</option>
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Select
                value={c.op}
                onChange={(e) => patch(i, { op: e.target.value })}
                className="w-20"
              >
                {CRITERIA_OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                step="any"
                value={Number.isFinite(c.value) ? c.value : ''}
                // `Number('')` es 0, y 0 es un umbral LEGAL: vaciar la casilla
                // convertía la regla en "todo el mundo la cumple". Con una
                // insignia permanente eso la reparte a la base entera y no hay
                // forma de retirarla. Vacío tiene que significar "sin valor",
                // no "cero".
                onChange={(e) =>
                  patch(i, {
                    value: e.target.value.trim() === '' ? Number.NaN : Number(e.target.value),
                  })
                }
                className={`w-28 ${Number.isFinite(c.value) ? '' : 'border-danger/60'}`}
              />
              {meta?.unit === 'percent' && (
                <span className="text-xs text-text-muted font-sans">%</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={conditions.length === 1}
                title="Quitar condición"
                className="p-1.5 rounded-lg text-text-muted hover:text-danger disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {meta?.hint && (
              <p className="text-[11px] text-text-muted font-sans pl-8">{meta.hint}</p>
            )}
            {meta?.nullable && !meta.hint && (
              <p className="text-[11px] text-text-muted font-sans pl-8">
                Puede no tener dato. Sin dato la condición no se cumple, así que nadie la gana por
                omisión.
              </p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={add}>
          <Plus size={14} className="mr-1" />
          Añadir condición
        </Button>
        <Button
          variant="secondary"
          disabled={!complete}
          loading={runPreview.isPending}
          onClick={() => runPreview.mutate()}
        >
          Ver a cuánta gente alcanza
        </Button>
        <InfoPopover label="Por qué conviene mirar la vista previa">
          Cuenta cuántos usuarios cumplirían la regla <strong>hoy</strong>, recorriendo la misma
          población y la misma foto de datos que usa el barrido. Si el número sale enorme, el umbral
          está demasiado bajo; si sale 0, la insignia no se otorgaría nunca y nadie lo notaría.
          Compruébalo siempre antes de encender una insignia <strong>permanente</strong>: esas no se
          pueden retirar después.
        </InfoPopover>
      </div>

      {incomplete && (
        <p className="text-xs text-warning font-sans">
          Cada condición necesita una métrica y un umbral. Una casilla vacía no vale como 0.
        </p>
      )}

      {runPreview.error && (
        <p className="text-xs text-danger font-sans">{runPreview.error.message}</p>
      )}

      {preview && (
        <div className="rounded-xl border border-border bg-surface-3 p-3">
          <p className="text-sm text-text-primary font-sans">
            <strong className="tabular-nums">{preview.matched.toLocaleString('es-ES')}</strong>{' '}
            {preview.matched === 1 ? 'usuario la ganaría' : 'usuarios la ganarían'} hoy, de{' '}
            <span className="tabular-nums">{preview.evaluated.toLocaleString('es-ES')}</span>{' '}
            evaluados.
          </p>
          {preview.sample.length > 0 && (
            <p className="text-[11px] text-text-muted font-sans mt-1">
              Valores de la primera métrica entre quienes cumplen: {preview.sample.join(', ')}
              {preview.matched > preview.sample.length ? '…' : ''}
            </p>
          )}
          {preview.matched === 0 && (
            <p className="text-[11px] text-warning font-sans mt-1">
              Con este umbral la insignia no se otorgaría a nadie. Puede ser lo que quieres (una meta
              a futuro), pero revísalo antes de encenderla.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
