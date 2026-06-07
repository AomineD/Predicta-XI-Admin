/**
 * Shared form primitives for admin config screens (Credits, Social Quiniela, …).
 * Extracted from the Credits page so both screens render identical controls.
 */

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 font-sans">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted/60 font-sans mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

export function Field({ label, subtitle, children }: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="w-52 flex-none">
        <span className="text-sm text-text-muted font-sans pt-0.5">{label}</span>
        {subtitle && <p className="text-xs text-text-muted/50 font-sans mt-0.5 leading-tight">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-surface-3'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}
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
      className="h-9 w-24 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
    />
  );
}
