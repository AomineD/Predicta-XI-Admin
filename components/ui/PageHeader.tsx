import { InfoPopover } from './InfoPopover';

interface PageHeaderProps {
  title: string;
  /** Una línea que identifica la página. Lo largo va en `info`. */
  description?: string;
  /** Cómo funciona la pantalla: detrás del ⓘ junto al título. */
  info?: React.ReactNode;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, info, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-text-primary font-sans">{title}</h1>
          {info && <InfoPopover label={`Cómo funciona ${title}`}>{info}</InfoPopover>}
        </div>
        {description && <p className="mt-1 text-sm text-text-muted font-sans">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
