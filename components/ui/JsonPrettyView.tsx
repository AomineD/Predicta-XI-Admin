'use client';

import { useMemo, useState, type ReactNode } from 'react';

/**
 * Visor legible de un JSON arbitrario.
 *
 * Existe porque el enrichment de un partido es un objeto de miles de líneas —
 * h2h, forma reciente, plantillas, bajas, cuotas, stats profundas— y leerlo en
 * crudo obliga a contar llaves para saber si un dato llegó. Aquí cada sección
 * se pliega, los arrays de objetos planos se pintan como tabla y los valores se
 * formatean según lo que son.
 *
 * Es deliberadamente GENÉRICO y no un renderizador a medida del enrichment: esa
 * estructura cambia cada vez que se añade una fuente, y una vista acoplada a su
 * forma exacta se rompería en silencio (mostrando menos de lo que hay) justo
 * cuando más falta hace mirarla.
 */

type Json = unknown;

/** Nodos abiertos de entrada. Más profundo obligaría a plegar todo a mano. */
const DEFAULT_OPEN_DEPTH = 1;

/** A partir de aquí un array se pinta resumido con un "ver todos". */
const ARRAY_PREVIEW = 12;

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Un array de objetos con las mismas claves planas se lee mucho mejor como tabla. */
function tableColumnsOf(value: Json[]): string[] | null {
  if (value.length < 2) return null;
  const columns = new Set<string>();
  for (const row of value) {
    if (!isObject(row)) return null;
    for (const [k, v] of Object.entries(row)) {
      // Una columna que a su vez es objeto o array no cabe en una celda.
      if (isObject(v) || Array.isArray(v)) return null;
      columns.add(k);
    }
  }
  // Demasiadas columnas se leen peor en tabla que plegadas.
  if (columns.size === 0 || columns.size > 8) return null;
  return [...columns];
}

/** `homeTeam` → `Home team`. Los datos vienen en camelCase del backend. */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Una fecha ISO se lee mejor como fecha; lo demás se deja intacto. */
function formatScalar(value: Json): { text: string; tone: string } {
  if (value === null) return { text: '—', tone: 'text-text-muted' };
  if (value === undefined) return { text: '—', tone: 'text-text-muted' };
  if (typeof value === 'boolean') {
    return { text: value ? 'sí' : 'no', tone: value ? 'text-success' : 'text-text-muted' };
  }
  if (typeof value === 'number') {
    return { text: String(value), tone: 'text-secondary' };
  }
  const s = String(value);
  if (s === '') return { text: '(vacío)', tone: 'text-text-muted' };
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return { text: d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }), tone: 'text-text-primary' };
    }
  }
  return { text: s, tone: 'text-text-primary' };
}

/** Resumen de una rama plegada: dice si hay algo dentro sin tener que abrirla. */
function summaryOf(value: Json): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? 'vacío' : `${value.length} ${value.length === 1 ? 'elemento' : 'elementos'}`;
  }
  if (isObject(value)) {
    const n = Object.keys(value).length;
    return n === 0 ? 'vacío' : `${n} ${n === 1 ? 'campo' : 'campos'}`;
  }
  return '';
}

function Scalar({ value }: { value: Json }) {
  const { text, tone } = formatScalar(value);
  return <span className={`${tone} break-words`}>{text}</span>;
}

function Row({ label, children, depth }: { label: string; children: ReactNode; depth: number }) {
  return (
    <div
      className="flex gap-3 py-1 text-xs font-sans leading-relaxed"
      style={{ paddingLeft: depth * 12 }}
    >
      <span className="text-text-muted shrink-0 min-w-[9rem] max-w-[14rem] truncate" title={label}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function FlatTable({ rows, columns, depth }: { rows: Json[]; columns: string[]; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, ARRAY_PREVIEW);
  return (
    <div style={{ paddingLeft: depth * 12 }} className="py-1">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs font-sans">
          <thead>
            <tr className="text-left text-text-muted bg-surface-2">
              {columns.map((c) => (
                <th key={c} className="py-1.5 px-2.5 font-medium whitespace-nowrap">
                  {humanize(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {columns.map((c) => (
                  <td key={c} className="py-1.5 px-2.5 align-top whitespace-nowrap">
                    <Scalar value={isObject(row) ? row[c] : null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ARRAY_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-sans text-secondary hover:underline"
        >
          {expanded ? 'Ver menos' : `Ver los ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function Branch({ label, value, depth }: { label: string; value: Json; depth: number }) {
  const [open, setOpen] = useState(depth < DEFAULT_OPEN_DEPTH);
  const empty = Array.isArray(value) ? value.length === 0 : Object.keys(value as object).length === 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => !empty && setOpen((v) => !v)}
        disabled={empty}
        className={`flex w-full items-center gap-2 py-1 text-xs font-sans text-left ${
          empty ? 'cursor-default' : 'hover:bg-surface-2 rounded'
        }`}
        style={{ paddingLeft: depth * 12 }}
      >
        <span className={`w-3 shrink-0 text-text-muted ${empty ? 'opacity-0' : ''}`}>
          {open ? '▾' : '▸'}
        </span>
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-muted">{summaryOf(value)}</span>
      </button>
      {open && !empty && <Node value={value} depth={depth + 1} />}
    </div>
  );
}

function Node({ value, depth }: { value: Json; depth: number }) {
  if (Array.isArray(value)) {
    const columns = tableColumnsOf(value);
    if (columns) return <FlatTable rows={value} columns={columns} depth={depth} />;
    return (
      <div>
        {value.map((item, i) =>
          isObject(item) || Array.isArray(item) ? (
            <Branch key={i} label={`#${i + 1}`} value={item} depth={depth} />
          ) : (
            <Row key={i} label={`#${i + 1}`} depth={depth}>
              <Scalar value={item} />
            </Row>
          ),
        )}
      </div>
    );
  }

  if (isObject(value)) {
    return (
      <div>
        {Object.entries(value).map(([key, child]) =>
          isObject(child) || Array.isArray(child) ? (
            <Branch key={key} label={humanize(key)} value={child} depth={depth} />
          ) : (
            <Row key={key} label={humanize(key)} depth={depth}>
              <Scalar value={child} />
            </Row>
          ),
        )}
      </div>
    );
  }

  return (
    <Row label="" depth={depth}>
      <Scalar value={value} />
    </Row>
  );
}

/**
 * Filtra el árbol dejando solo las ramas que contienen la búsqueda, en la clave
 * o en el valor. Un JSON de miles de líneas sin búsqueda obliga a abrir ramas al
 * azar hasta dar con el dato.
 */
function filterJson(value: Json, needle: string): Json | undefined {
  if (needle === '') return value;
  const hit = (s: string): boolean => s.toLowerCase().includes(needle);

  if (Array.isArray(value)) {
    const kept = value.map((v) => filterJson(v, needle)).filter((v) => v !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  if (isObject(value)) {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) {
      // Una clave que coincide arrastra su subárbol entero: si buscas "odds"
      // quieres ver todo lo que hay bajo `odds`, no solo lo que repite la
      // palabra dentro.
      if (hit(k)) {
        out[k] = v;
        continue;
      }
      const child = filterJson(v, needle);
      if (child !== undefined) out[k] = child;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value !== null && hit(String(value)) ? value : undefined;
}

export function JsonPrettyView({ data }: { data: Json }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => filterJson(data, needle), [data, needle]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar campo o valor…"
        className="w-full mb-3 px-3 h-9 rounded-lg bg-surface-2 border border-border text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:border-secondary"
      />
      {filtered === undefined ? (
        <p className="text-xs text-text-muted font-sans py-3">
          Ningún campo coincide con “{query.trim()}”.
        </p>
      ) : (
        <Node value={filtered} depth={0} />
      )}
    </div>
  );
}
