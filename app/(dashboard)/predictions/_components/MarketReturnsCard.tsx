'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InfoPopover } from '@/components/ui/InfoPopover';

/** Una fila: cómo le fue a un mercado por acierto Y por retorno. */
interface MarketReturn {
  market: string;
  priced: number;
  won: number;
  winratePct: number;
  avgOdds: number;
  breakEvenPct: number;
  returnPct: number;
}

interface MarketReturns {
  items: MarketReturn[];
  overall: MarketReturn | null;
  windowDays: number;
  generatedAt: string;
}

const WINDOWS = [30, 90, 365] as const;

/**
 * Muestra por debajo de la cual una fila es ruido, no señal.
 *
 * Con 1 pick un mercado sale a "+170 % de retorno" y se cuela arriba del todo
 * empujando fuera de la vista a los que mueven el negocio. No se ocultan —a
 * veces se quiere ver justo eso— pero se separan del resto.
 */
const SAMPLE_FLOORS = [0, 25, 100] as const;

/** Clave de `localStorage` donde se recuerda si el desglose queda abierto. */
const BREAKDOWN_PREF_KEY = 'predicta.marketReturns.breakdownOpen';
/** Evento propio: `storage` solo avisa a las OTRAS pestañas, no a la que escribe. */
const BREAKDOWN_EVENT = 'predicta:marketReturnsBreakdown';

/**
 * La preferencia vive en `localStorage` y se lee con `useSyncExternalStore`, no con
 * un `useState` + `useEffect`.
 *
 * En el servidor `localStorage` no existe, así que el snapshot de servidor es
 * siempre `false` (colapsada, que es el default) y el de cliente el valor guardado:
 * React reconcilia la diferencia sin avisar de hidratación y sin un `setState`
 * dentro de un efecto. De paso, dos pestañas abiertas quedan sincronizadas.
 */
function subscribeBreakdownPref(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(BREAKDOWN_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(BREAKDOWN_EVENT, onChange);
  };
}

function readBreakdownPref(): boolean {
  try {
    return localStorage.getItem(BREAKDOWN_PREF_KEY) === '1';
  } catch {
    // Modo privado o cookies bloqueadas: se queda colapsada, que es el default.
    return false;
  }
}

function writeBreakdownPref(open: boolean): void {
  try {
    localStorage.setItem(BREAKDOWN_PREF_KEY, open ? '1' : '0');
  } catch {
    // Sin persistencia la tarjeta sigue funcionando; solo se olvida al recargar.
  }
  window.dispatchEvent(new Event(BREAKDOWN_EVENT));
}

type SortKey = 'edge' | 'return' | 'picks' | 'winrate';

const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'edge', label: 'Ventaja' },
  { key: 'return', label: 'Retorno' },
  { key: 'picks', label: 'Picks' },
  { key: 'winrate', label: 'Acierto' },
];

/** Acierto menos equilibrio: el único número que dice si el mercado aporta. */
function edgeOf(row: MarketReturn): number {
  return row.winratePct - row.breakEvenPct;
}

/**
 * Acierto vs retorno por mercado.
 *
 * Existe porque el winrate a secas premia el sesgo conservador: a cuota media
 * 1.40 el punto de equilibrio está en ~71% de acierto, así que un motor que solo
 * emite favoritos "acierta mucho" y aun así devuelve menos de lo que arriesga.
 * La columna que importa es la distancia entre `winratePct` y `breakEvenPct`.
 *
 * La tabla creció hasta ~20 mercados y con veinte filas de cifras sueltas no se
 * ve nada: por eso el total sube a una tira de KPIs, la ventaja se pinta como
 * barra divergente (a un lado suma, al otro resta) y las filas de muestra corta
 * se agrupan aparte en vez de mezclarse con las que deciden.
 */
export function MarketReturnsCard() {
  const [days, setDays] = useState<number>(90);
  const [minPicks, setMinPicks] = useState<number>(25);
  const [sort, setSort] = useState<SortKey>('edge');
  // Colapsada por defecto: al entrar a Predictions lo que se viene a ver es la LISTA.
  // La tira de cuatro KPIs se queda siempre visible porque es el resumen del motor
  // entero; el desglose de ~20 mercados empujaba la tabla fuera de la pantalla y solo
  // se consulta cuando se viene a mirar justo eso. La preferencia se recuerda por
  // navegador para no volver a abrirla en cada visita.
  const open = useSyncExternalStore(subscribeBreakdownPref, readBreakdownPref, () => false);
  const toggle = (): void => writeBreakdownPref(!open);

  const { data, isLoading, error } = useQuery<MarketReturns>({
    queryKey: ['market-returns', days],
    queryFn: () => api.get(`/admin/stats/market-returns?days=${days}`) as Promise<MarketReturns>,
  });

  const { strong, weak, maxEdge, best, worst } = useMemo(() => {
    const rows = data?.items ?? [];
    const by = (a: MarketReturn, b: MarketReturn): number => {
      switch (sort) {
        case 'return':
          return b.returnPct - a.returnPct;
        case 'picks':
          return b.priced - a.priced;
        case 'winrate':
          return b.winratePct - a.winratePct;
        default:
          return edgeOf(b) - edgeOf(a);
      }
    };
    const strong = rows.filter((r) => r.priced >= minPicks).sort(by);
    const weak = rows.filter((r) => r.priced < minPicks).sort(by);
    // La escala de la barra sale solo de las filas con muestra: si la fijara un
    // mercado de 1 pick con +38 puntos, el resto quedaría aplastado contra cero.
    const maxEdge = Math.max(10, ...strong.map((r) => Math.abs(edgeOf(r))));
    // Extremos por VENTAJA (no por retorno): el retorno de una muestra corta lo mueve
    // un solo pick, y la ventaja es la cifra que dice si el mercado aporta. Se calculan
    // sobre `strong` para no coronar ni condenar un mercado de tres picks. El suelo de
    // muestra lo elige el usuario, así que "Todo" puede volver a colar filas flojas:
    // ese es su problema, no el default.
    const byEdge = [...strong].sort((a, b) => edgeOf(b) - edgeOf(a));
    const best = byEdge[0] ?? null;
    const worst = byEdge.length > 1 ? byEdge[byEdge.length - 1] : null;
    return { strong, weak, maxEdge, best, worst };
  }, [data, minPicks, sort]);

  const total = data?.items.length ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-surface mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-text-primary font-sans">
            Acierto vs retorno por mercado
          </h2>
          <InfoPopover label="Cómo leer esta tabla">
            El winrate por sí solo premia el sesgo conservador: cuanto más baja la cuota, más alto sale
            sin que el motor aporte nada. La vara real es <strong>Equilibrio</strong>, el acierto mínimo
            que exige la cuota media de ese mercado (100 / cuota). <strong>Ventaja</strong> es la resta
            de los dos: positiva = el mercado aporta, negativa = resta aunque luzca bien.{' '}
            <strong>Retorno</strong> es lo que devuelve a stake plano de 1 por pick. Solo entran picks
            liquidados CON cuota — los anulados devuelven el stake y los mercados inferidos no tienen
            precio, así que quedan fuera.
          </InfoPopover>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            options={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
            value={days}
            onChange={setDays}
          />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="market-returns-breakdown"
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-sans bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            {open ? 'Ocultar' : 'Ver'} desglose
            {total > 0 && <span className="text-text-muted">({total})</span>}
            <svg
              className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        {isLoading && <p className="text-xs text-text-muted font-sans py-3">Cargando…</p>}
        {error && <p className="text-xs text-danger font-sans py-3">{(error as Error).message}</p>}

        {!isLoading && !error && total === 0 && (
          <p className="text-xs text-text-muted font-sans py-3">
            Todavía no hay picks liquidados con cuota en esta ventana.
          </p>
        )}

        {data?.overall && <OverallStrip row={data.overall} markets={total} days={days} />}

        {/* Colapsada, la tarjeta seguiría escondiendo lo único que se acciona: qué mercado
            hay que tocar. Los dos extremos con muestra suficiente caben en una línea. */}
        {!open && (best || worst) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3">
            {best && <Extreme label="Mejor" row={best} tone="good" />}
            {worst && <Extreme label="Peor" row={worst} tone="bad" />}
          </div>
        )}

        {/* Los controles del desglose viajan CON el desglose: colapsado no hay nada que
            ordenar ni ninguna muestra que acotar, y en la cabecera solo hacían ruido. */}
        {open && total > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Segmented
              label="Muestra mín."
              options={SAMPLE_FLOORS.map((n) => ({ value: n, label: n === 0 ? 'Todo' : `${n}+` }))}
              value={minPicks}
              onChange={setMinPicks}
            />
            <Segmented
              label="Ordenar"
              options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
              value={sort}
              onChange={setSort}
            />
          </div>
        )}

        {open && total > 0 && (
          <div id="market-returns-breakdown" className="overflow-x-auto mt-4">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className="py-2 pr-3 font-medium">Mercado</th>
                  <th className="py-2 px-3 font-medium text-right">Picks</th>
                  <th className="py-2 px-3 font-medium text-right">Acierto</th>
                  <th className="py-2 px-3 font-medium text-right">Equilibrio</th>
                  <th className="py-2 px-3 font-medium w-[24%]">Ventaja</th>
                  <th className="py-2 px-3 font-medium text-right">Cuota</th>
                  <th className="py-2 pl-3 font-medium text-right">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {strong.map((r) => (
                  <ReturnRow key={r.market} row={r} maxEdge={maxEdge} />
                ))}

                {weak.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={7} className="pt-5 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wide text-text-muted font-sans">
                            Muestra corta · menos de {minPicks} picks
                          </span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        <p className="text-[11px] text-text-muted font-sans mt-1">
                          Sus porcentajes se mueven varios puntos con un solo pick. No sirven para
                          decidir nada todavía.
                        </p>
                      </td>
                    </tr>
                    {weak.map((r) => (
                      <ReturnRow key={r.market} row={r} maxEdge={maxEdge} muted />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * El total, promovido de fila a tira de KPIs.
 *
 * Era la primera fila de la tabla y se leía como un mercado más entre veinte.
 * Es la única cifra que resume el motor entero, así que se saca de la lista.
 */
function OverallStrip({ row, markets, days }: { row: MarketReturn; markets: number; days: number }) {
  const edge = edgeOf(row);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden bg-border border border-border">
      <Kpi label="Picks liquidados" value={row.priced.toLocaleString('es-ES')} note={`${markets} mercados · ${days}d`} />
      <Kpi
        label="Acierto"
        value={`${row.winratePct}%`}
        note={`equilibrio ${row.breakEvenPct}%`}
        tone={row.winratePct >= row.breakEvenPct ? 'good' : 'bad'}
      />
      <Kpi
        label="Ventaja"
        value={`${edge >= 0 ? '+' : ''}${edge.toFixed(1)} pts`}
        note="acierto − equilibrio"
        tone={edge >= 0 ? 'good' : 'bad'}
      />
      <Kpi
        label="Retorno"
        value={`${row.returnPct >= 0 ? '+' : ''}${row.returnPct}%`}
        note={`cuota media ${row.avgOdds.toFixed(2)}`}
        tone={row.returnPct >= 0 ? 'good' : 'bad'}
      />
    </div>
  );
}

/**
 * El mercado que más aporta y el que más resta, en una línea.
 *
 * Es lo que se venía a buscar al desplegar la tabla, así que se adelanta al estado
 * colapsado: con esto la vista por defecto ya dice qué hay que arreglar.
 */
function Extreme({ label, row, tone }: { label: string; row: MarketReturn; tone: 'good' | 'bad' }) {
  const edge = edgeOf(row);
  const color = tone === 'good' ? 'text-success' : 'text-danger';
  return (
    <span className="text-[11px] font-sans text-text-muted">
      {label}:{' '}
      <span className="text-text-secondary">{row.market.replace(/_/g, ' ')}</span>{' '}
      <span className={`tabular-nums ${color}`}>
        {edge >= 0 ? '+' : ''}
        {edge.toFixed(1)} pts
      </span>{' '}
      <span className="text-text-muted">· {row.priced} picks</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'good' | 'bad';
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-text-primary';
  return (
    <div className="bg-surface-2 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-sans">{label}</p>
      <p className={`text-xl font-semibold tabular-nums font-sans mt-0.5 ${color}`}>{value}</p>
      <p className="text-[11px] text-text-muted font-sans mt-0.5">{note}</p>
    </div>
  );
}

function ReturnRow({
  row,
  maxEdge,
  muted,
}: {
  row: MarketReturn;
  maxEdge: number;
  muted?: boolean;
}) {
  const edge = edgeOf(row);
  const beats = edge >= 0;
  const dim = muted ? 'opacity-55' : '';
  return (
    <tr className={`border-t border-border ${dim} hover:bg-surface-2/60 transition-colors`}>
      <td className="py-2 pr-3 text-text-primary whitespace-nowrap">
        {row.market.replace(/_/g, ' ')}
      </td>
      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{row.priced}</td>
      <td className={`py-2 px-3 text-right tabular-nums ${beats ? 'text-success' : 'text-danger'}`}>
        {row.winratePct}%
      </td>
      <td className="py-2 px-3 text-right text-text-muted tabular-nums">{row.breakEvenPct}%</td>
      <td className="py-2 px-3">
        <EdgeBar edge={edge} max={maxEdge} />
      </td>
      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">
        {row.avgOdds.toFixed(2)}
      </td>
      <td
        className={`py-2 pl-3 text-right tabular-nums font-medium ${
          row.returnPct >= 0 ? 'text-success' : 'text-danger'
        }`}
      >
        {row.returnPct >= 0 ? '+' : ''}
        {row.returnPct}%
      </td>
    </tr>
  );
}

/**
 * Barra divergente desde el centro: a la derecha el mercado supera su
 * equilibrio, a la izquierda se queda corto.
 *
 * El signo se ve antes de leer el número, que es justo lo que se pierde en una
 * columna de veinte porcentajes seguidos.
 */
function EdgeBar({ edge, max }: { edge: number; max: number }) {
  const pct = Math.min(100, (Math.abs(edge) / max) * 100);
  const positive = edge >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-4 flex-1 min-w-[60px]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span
          className={`absolute top-1/2 -translate-y-1/2 h-2 rounded-sm ${
            positive ? 'bg-success/70 left-1/2' : 'bg-danger/70 right-1/2'
          }`}
          style={{ width: `${pct / 2}%` }}
        />
      </div>
      <span
        className={`text-xs tabular-nums w-12 text-right ${
          positive ? 'text-success' : 'text-danger'
        }`}
      >
        {positive ? '+' : ''}
        {edge.toFixed(1)}
      </span>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px] text-text-muted font-sans">{label}</span>}
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-2.5 h-8 rounded-lg text-xs font-sans transition-colors ${
              value === o.value
                ? 'bg-primary/15 text-primary'
                : 'bg-surface-3 text-text-secondary hover:text-text-primary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
