/**
 * Shared form primitives for admin config screens (Credits, Social Quiniela,
 * Config, …). Un solo juego de controles para que todas las pantallas de ajustes
 * rendericen idéntico. Usan los tokens del theme (no hex inline).
 */

import { Card } from './Card';

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle} className="mb-4">
      {children}
    </Card>
  );
}

export function Field({ label, subtitle, children }: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-0">
      <div className="w-52 flex-none">
        <span className="text-sm text-text-muted font-sans pt-0.5">{label}</span>
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
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-24 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans transition-colors focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
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
