import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, data, keyExtractor, loading, emptyMessage }: DataTableProps<T>) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-surface">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider', col.width)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                {emptyMessage ?? 'No data'}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-border/70 last:border-0 transition-colors hover:bg-surface-3"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-text-primary">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
