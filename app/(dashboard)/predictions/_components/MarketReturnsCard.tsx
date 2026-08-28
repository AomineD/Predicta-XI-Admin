'use client';

import { useState } from 'react';
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
 * Acierto vs retorno por mercado.
 *
 * Existe porque el winrate a secas premia el sesgo conservador: a cuota media
 * 1.40 el punto de equilibrio está en ~71% de acierto, así que un motor que solo
 * emite favoritos "acierta mucho" y aun así devuelve menos de lo que arriesga.
 * La columna que importa es la distancia entre `winratePct` y `breakEvenPct`.
 */
export function MarketReturnsCard() {
  const [days, setDays] = useState<number>(90);

  const { data, isLoading, error } = useQuery<MarketReturns>({
    queryKey: ['market-returns', days],
    queryFn: () => api.get(`/admin/stats/market-returns?days=${days}`) as Promise<MarketReturns>,
  });

  const rows = data?.items ?? [];

  return (
    <div className="rounded-2xl border border-border bg-surface mb-6">
      <div className="flex items-center justify-between gap-3 p-5 pb-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-text-primary font-sans">Acierto vs retorno por mercado</h2>
          <InfoPopover label="Cómo leer esta tabla">
            El winrate por sí solo premia el sesgo conservador: cuanto más baja la cuota, más alto sale
            sin que el motor aporte nada. La vara real es <strong>Equilibrio</strong>, el acierto mínimo
            que exige la cuota media de ese mercado (100 / cuota). Si el acierto no lo supera, el mercado
            resta aunque luzca bien. <strong>Retorno</strong> es lo que devuelve a stake plano de 1 por
            pick: negativo significa que devuelve menos de lo que se le pone. Solo entran picks liquidados
            CON cuota — los anulados devuelven el stake y los mercados inferidos no tienen precio, así que
            quedan fuera.
          </InfoPopover>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`px-2.5 h-8 rounded-lg text-xs font-sans transition-colors ${
                days === w
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-3 text-text-secondary hover:text-text-primary'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {isLoading && <p className="text-xs text-text-muted font-sans py-3">Cargando…</p>}
        {error && <p className="text-xs text-danger font-sans py-3">{(error as Error).message}</p>}

        {!isLoading && !error && rows.length === 0 && (
          <p className="text-xs text-text-muted font-sans py-3">
            Todavía no hay picks liquidados con cuota en esta ventana.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className="py-2 pr-3 font-medium">Mercado</th>
                  <th className="py-2 px-3 font-medium text-right">Picks</th>
                  <th className="py-2 px-3 font-medium text-right">Acierto</th>
                  <th className="py-2 px-3 font-medium text-right">Equilibrio</th>
                  <th className="py-2 px-3 font-medium text-right">Cuota media</th>
                  <th className="py-2 pl-3 font-medium text-right">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {data?.overall && <ReturnRow row={data.overall} label="TODOS" emphasis />}
                {rows.map((r) => (
                  <ReturnRow key={r.market} row={r} label={r.market.replace(/_/g, ' ')} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnRow({ row, label, emphasis }: { row: MarketReturn; label: string; emphasis?: boolean }) {
  // Verde solo cuando el acierto supera lo que la cuota exige. Es el único
  // juicio que importa aquí: acertar por debajo del equilibrio es perder.
  const beatsBreakEven = row.winratePct >= row.breakEvenPct;
  return (
    <tr className={`border-t border-border ${emphasis ? 'bg-surface-2' : ''}`}>
      <td className={`py-2 pr-3 ${emphasis ? 'font-semibold text-text-primary' : 'text-text-primary'}`}>
        {label}
      </td>
      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{row.priced}</td>
      <td
        className={`py-2 px-3 text-right tabular-nums ${beatsBreakEven ? 'text-success' : 'text-danger'}`}
      >
        {row.winratePct}%
      </td>
      <td className="py-2 px-3 text-right text-text-muted tabular-nums">{row.breakEvenPct}%</td>
      <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{row.avgOdds.toFixed(2)}</td>
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
