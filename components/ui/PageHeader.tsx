interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary font-sans">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted font-sans">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
