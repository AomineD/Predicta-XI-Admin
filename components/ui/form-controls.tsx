'use client';

/**
 * Shared form primitives for admin config screens (Credits, Social Quiniela,
 * Config, …). Un solo juego de controles para que todas las pantallas de ajustes
 * rendericen idéntico. Usan los tokens del theme (no hex inline).
 */

import { useState } from 'react';
import { Card } from './Card';
import { InfoPopover } from './InfoPopover';

export function SectionCard({
  title,
  subtitle,
  info,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Explicación larga: va detrás del ⓘ del encabezado, no debajo del título. */
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card title={title} subtitle={subtitle} info={info} className="mb-4">
      {children}
    </Card>
  );
}

export function Field({
  label,
  subtitle,
  info,
  children,
}: {
  label: string;
  /** Dato corto que se consulta a diario (rango, tope, valor por defecto). */
  subtitle?: string;
  /** Cómo funciona y por qué: va detrás del ⓘ, no ocupa la pantalla. */
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-0">
      <div className="w-52 flex-none">
        <span className="flex items-center gap-1.5 pt-0.5">
          <span className="text-sm text-text-muted font-sans">{label}</span>
          {info && <InfoPopover label={`Qué hace "${label}"`}>{info}</InfoPopover>}
        </span>
        {subtitle && <p className="text-xs text-text-muted/50 font-sans mt-0.5 leading-tight">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40 ${
        value ? 'bg-primary' : 'bg-surface-3'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NumInput({
  value,
  onChange,
  min = 0,
  max,
  step,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Paso del input. Necesario para los campos DECIMALES: sin él, el navegador
   *  asume paso 1 y marca como inválido cualquier valor con coma. */
  step?: number;
  /** Para valores estructurales que se muestran pero no se editan (p. ej. el
   *  último tramo de dificultad, que siempre arranca en 0%). */
  disabled?: boolean;
}) {
  /**
   * Lo tecleado mientras el campo tiene el foco. `null` = manda la prop.
   *
   * Hace falta porque el input es controlado y hay estados intermedios que no
   * son un número: la caja vacía al borrar para reescribir, un `-` suelto, un
   * `1e`. Sin esto, `Number('')` es 0 y el campo mandaba un CERO real al
   * borrarlo — en `minParticipants` eso apagaba el suelo anti-farming y el
   * backend lo recortaba a 1 sin que nada avisara.
   */
  const [typed, setTyped] = useState<string | null>(null);

  /**
   * Ajusta al rango. Solo al salir del campo, NUNCA mientras se teclea: con
   * `min=10`, recortar en vivo convertiría el primer `5` de "50" en un 10 y
   * dejaría el valor imposible de escribir.
   */
  const clamp = (n: number): number => {
    const low = Math.max(n, min);
    return max === undefined ? low : Math.min(low, max);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={typed ?? String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        setTyped(raw);
        // Solo se propaga lo que ya es un número: el padre nunca ve un 0
        // fantasma ni un NaN, y la caja puede quedarse vacía mientras escribes.
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onWheel={(e) => e.currentTarget.blur()}
      onBlur={(e) => {
        // Nadie tecleó: pasar por encima con el tabulador NO puede reescribir lo
        // que hay guardado. Sin esto, un valor persistido fuera del rango que
        // declara el JSX se recortaba solo por enfocarlo, ensuciaba el
        // formulario y se colaba en el siguiente guardado sin que nada avisara.
        if (typed === null) return;
        const raw = e.target.value;
        const n = Number(raw);
        // Al soltar el campo se decide: lo válido se ajusta al rango —para no
        // dejar nada fuera de límites esperando a que el backend lo recorte en
        // silencio— y lo que no es un número vuelve al último valor propagado
        // (ojo: el último bueno que se tecleó, no el que había al empezar).
        const next = raw.trim() === '' || !Number.isFinite(n) ? value : clamp(n);
        setTyped(null);
        if (next !== value) onChange(next);
      }}
      className="h-9 w-24 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans transition-colors focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

/** Sub-encabezado dentro de una SectionCard para agrupar campos relacionados. */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 pb-1 first:pt-0">
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans">{children}</span>
    </div>
  );
}
