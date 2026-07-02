import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Estilo base compartido por Input/Select/Textarea, alineado con NumInput de
// form-controls (mismos tokens: surface-2 + border) + focus ring visible.
const base =
  'w-full rounded-xl bg-surface-2 border border-border text-text-primary font-sans text-sm placeholder:text-text-muted/60 transition-colors focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, 'h-9 px-3', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'px-3 py-2 min-h-[80px] resize-y leading-relaxed', className)} {...props} />;
}

/** `className` se aplica al contenedor (controla el ancho); el `<select>` interno llena el ancho. */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative w-full', className)}>
      <select className={cn(base, 'h-9 pl-3 pr-9 cursor-pointer appearance-none')} {...props}>
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}
