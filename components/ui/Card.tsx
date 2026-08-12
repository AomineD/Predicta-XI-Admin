import { cn } from '@/lib/utils';
import { InfoPopover } from './InfoPopover';

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Explicación larga de la sección: va detrás del ⓘ junto al título. */
  info?: React.ReactNode;
  action?: React.ReactNode;
  /** Padding interno (por defecto true). Ponlo en false para tablas u otros hijos que gestionan su propio padding. */
  padded?: boolean;
  bodyClassName?: string;
}

/**
 * Contenedor "card" genérico del panel. Reemplaza el patrón copiado a mano
 * `style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}`
 * por los tokens del theme (`bg-surface` / `border-border`). Opcionalmente pinta
 * un encabezado con título (label pequeño en mayúsculas), subtítulo y una acción
 * a la derecha — el mismo layout que el viejo SectionCard.
 */
export function Card({
  title,
  subtitle,
  info,
  action,
  padded = true,
  className,
  bodyClassName,
  children,
  ...props
}: CardProps) {
  const hasHeader = title != null || action != null || subtitle != null || info != null;
  return (
    <div className={cn('rounded-2xl border border-border bg-surface', padded && 'p-5', className)} {...props}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {(title || info) && (
              <div className="flex items-center gap-1.5">
                {title && (
                  <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
                    {title}
                  </h2>
                )}
                {info && <InfoPopover label={typeof title === 'string' ? `Qué hace "${title}"` : 'Más información'}>{info}</InfoPopover>}
              </div>
            )}
            {subtitle && <p className="text-xs text-text-muted/70 font-sans mt-1 leading-snug">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
