'use client';

import { SectionCard, Field } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { MultiCheckbox, PredictionEngineCard } from './controls';
import { MODELS, MODEL_DEFAULT_MAX_TOKENS, MARKETS, DATA_FIELDS, REASONING_OPTIONS } from './constants';
import type { PredictionConfig, RecommendationsConfig, SetField } from './types';

const DEFAULT_RECOMMENDATIONS_CONFIG: RecommendationsConfig = { minSample: 20, minWinratePct: 55, topK: 4, windowDays: 90 };
const DEFAULT_SPECIAL_SELECTOR = {
  maxPicks: 3,
  minConfidence: 0.55,
  minEdge: 0.05,
  oddsFloor: 1.5,
  requirePricedOdds: true,
  dedupeEquivalentEvents: true,
  longshotOddsFloor: 2.5,
  minExpectedReturn: 0.85,
  reserveLongshotSlots: 1,
};
const DEFAULT_PLAYER_MARKETS_CONFIG = {
  maxPicks: 2,
  minConfidence: 0.2,
  devigEnabled: true,
  bookTargetSum: 2.4,
};

export function GeneralTab({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  return (
    <div>
      <SectionCard title="Model & Reasoning" subtitle="LLM model configuration for prediction generation">
        <Field label="Active model" subtitle="LLM model used for generating match predictions">
          <Select className="w-64" value={form.model} onChange={(e) => setField('model', e.target.value)}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reasoning effort" info="Depth of reasoning for supported models (DeepSeek R1, GPT Think).">
          <Select
            className="w-64"
            value={form.reasoningEffort ?? ''}
            onChange={(e) => setField('reasoningEffort', e.target.value || null)}
          >
            {REASONING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r || '-- default --'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="LLM Timeout (seconds)" info="Max wait time per LLM call. Increase it for reasoning models like DeepSeek R1.">
          <Input
            type="number"
            min={15}
            max={300}
            className="w-24"
            value={form.llmTimeoutSeconds}
            onChange={(e) => setField('llmTimeoutSeconds', Number(e.target.value))}
          />
        </Field>

        <Field label="Historical context" subtitle="Include past prediction outcomes to improve accuracy">
          <Toggle value={form.historicalContextEnabled} onChange={(v) => setField('historicalContextEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Output Token Limits"
        subtitle="Vacío = default" info="Per-model max output tokens. Raise it when you see prediction_jobs failing with finishReason=length."
      >
        {MODELS.map((model) => {
          const override = form.llmMaxTokens?.[model];
          const fallback = MODEL_DEFAULT_MAX_TOKENS[model];
          const hasOverride = typeof override === 'number';
          return (
            <Field
              key={model}
              label={model}
              subtitle={fallback ? `Default ${fallback.toLocaleString()}` : 'No backend default registered'}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={512}
                  max={65536}
                  step={256}
                  className="w-32"
                  value={hasOverride ? override : ''}
                  placeholder={fallback ? String(fallback) : ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const next = { ...(form.llmMaxTokens ?? {}) };
                    if (raw === '') {
                      delete next[model];
                    } else {
                      const n = Number.parseInt(raw, 10);
                      if (Number.isInteger(n) && n >= 512 && n <= 65536) {
                        next[model] = n;
                      }
                    }
                    setField('llmMaxTokens', next);
                  }}
                />
                {hasOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...(form.llmMaxTokens ?? {}) };
                      delete next[model];
                      setField('llmMaxTokens', next);
                    }}
                    className="text-xs text-text-muted hover:text-text-primary font-sans cursor-pointer"
                  >
                    reset
                  </button>
                )}
              </div>
            </Field>
          );
        })}
      </SectionCard>

      <SectionCard title="Output Markets" subtitle="Betting markets included in each generated prediction">
        <MultiCheckbox options={MARKETS} value={form.outputMarkets} onChange={(v) => setField('outputMarkets', v)} />
        {form.totalsUnifiedEnabled && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-3 text-text-secondary font-sans whitespace-nowrap mt-0.5">
              Total Goals · derived
            </span>
            <p className="text-xs text-text-muted font-sans leading-relaxed">
              Unified totals is ON: the engine replaces <span className="text-text-secondary">O/U 2.5</span> and{' '}
              <span className="text-text-secondary">O/U 1.5</span> with a single derived{' '}
              <span className="text-text-secondary">Total Goals</span> market (best line picked by the Poisson selector).
              That derived market — not the two O/U above — is what users see. Keep O/U 2.5 + O/U 1.5 checked here; they
              feed the engine. This market is not toggled here: its on/off is the &ldquo;Totales unificados&rdquo; switch in
              the calibrated engine card.
            </p>
          </div>
        )}
      </SectionCard>

      <PredictionEngineCard form={form} setField={setField} />

      <SpecialMarketsSelectorCard form={form} setField={setField} />

      <PlayerMarketsCard form={form} setField={setField} />

      <RecommendationsCard form={form} setField={setField} />

      <LowConvictionCard form={form} setField={setField} />

      <SectionCard title="Input Data Fields" subtitle="Data sources the model receives to generate predictions">
        <MultiCheckbox options={DATA_FIELDS} value={form.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>
    </div>
  );
}

/** Recomendaciones por mercado para suscriptores (idea #24): flag maestro + umbrales
 *  del generador. El backend expone /stats/recommendations con el winrate real por
 *  mercado cuando el flag está encendido. */
function LowConvictionCard({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  return (
    <SectionCard
      title="Picks de baja convicción"
      subtitle="Presentación, no cálculo"
      info={
        'Marca los picks binarios simétricos (ambos marcan, over/under, córners, tarjetas) cuya confianza queda por debajo del umbral. La app los muestra como "MUY PAREJO" y enseña el reparto real de probabilidad (p. ej. 46% / 54%) en vez de un único número que aparenta convicción. NO cambia el pick ni la confianza: solo cómo se presenta. Existe porque un "ambos marcan: no" a 53 se veía tan rotundo como uno a 80, y junto a un marcador modal 1-1 se leía como una contradicción (no lo es: el marcador modal es UNA casilla y "ambos marcan" es la suma de todas). No aplica a penalti ni roja, cuyos topes son asimétricos a propósito.'
      }
    >
      <Field
        label="Umbral de confianza"
        subtitle="0–70 · def. 56 · 0 desactiva"
        info="Por debajo de este número el pick se marca como parejo. Subirlo marca más picks; pasado ~60 casi todo queda marcado y la etiqueta deja de significar algo. Ponerlo en 0 apaga la marca por completo y los picks vuelven a verse todos iguales."
      >
        <Input
          type="number"
          min={0}
          max={70}
          className="w-28"
          value={form.lowConvictionThreshold}
          // Clamp explícito: vaciar el input daría Number('') === 0, que apaga la
          // marca en silencio (0 es un valor legítimo), y un valor > 70 pasaría el
          // min/max del HTML para que lo rechace el zod al guardar.
          onChange={(e) =>
            setField(
              'lowConvictionThreshold',
              Math.min(70, Math.max(0, Number(e.target.value) || 0)),
            )
          }
        />
      </Field>
    </SectionCard>
  );
}

/** Selector de mercados exóticos (idea #1): los cuatro parámetros que deciden qué
 *  exóticos llegan al informe, incluidos los dos interruptores anti-relleno. */
function SpecialMarketsSelectorCard({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  const sel = form.specialMarketsSelector ?? DEFAULT_SPECIAL_SELECTOR;
  const setSel = (patch: Partial<NonNullable<PredictionConfig['specialMarketsSelector']>>) =>
    setField('specialMarketsSelector', { ...sel, ...patch });

  return (
    <SectionCard
      title="Selector de mercados exóticos"
      subtitle="Requiere Special markets ON"
      info={
        'Decide cuáles de los mercados exóticos derivados de la matriz Poisson (goles por equipo, portería a cero, gana a cero, combos) llegan al informe. Medido en producción el 2026-08-27 sobre 7 informes: salían SIEMPRE los mismos tres, dos de ellos el mismo suceso ("el local marca" contado como goles del local y como que el visitante no deja la portería a cero), con cuotas de hasta 1.02 pese a que el piso estaba en 1.50 — porque el piso solo se aplicaba a los candidatos con valor y ninguno lo tenía nunca. Estos controles cierran esa puerta.'
      }
    >
      <Field label="Máx. picks por partido" subtitle="0–8 · def. 3" info="Tope de exóticos añadidos a cada informe. Con los filtros de abajo puede emitir MENOS que este número: si nada pasa el filtro se emiten menos exóticos en vez de rellenar con eco barato del favorito.">
        <Input type="number" min={0} max={8} className="w-24" value={sel.maxPicks}
          onChange={(e) => setSel({ maxPicks: Math.min(8, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field label="Cuota mínima" subtitle="1–10 · def. 1.5" info="Piso de cuota. Aplica a TODOS los candidatos, tengan valor o no: por debajo de esto el pick no es un pronóstico, es describir al favorito. Antes solo se aplicaba a los que ya tenían valor y por eso colaban picks a 1.02.">
        <Input type="number" min={1} max={10} step={0.05} className="w-24" value={sel.oddsFloor}
          onChange={(e) => setSel({ oddsFloor: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
      </Field>

      <Field label="Confianza mínima" subtitle="0–0.95 · def. 0.55" info="Piso de confianza para los candidatos SIN valor declarado. Los que sí tienen valor se saltan este piso a propósito: su mérito es el edge, no la probabilidad (un combo a cuota 6 que acierta el 20% es justo lo que busca la feature).">
        <Input type="number" min={0} max={0.95} step={0.05} className="w-24" value={sel.minConfidence}
          onChange={(e) => setSel({ minConfidence: Math.min(0.95, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field label="Edge mínimo" subtitle="0–1 · def. 0.05" info="Edge contra la cuota de Sportium a partir del cual un candidato cuenta como 'con valor' y rankea primero.">
        <Input type="number" min={0} max={1} step={0.01} className="w-24" value={sel.minEdge}
          onChange={(e) => setSel({ minEdge: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field
        label="Exigir cuota conocida"
        subtitle="def. ON"
        info="Descarta los candidatos que Sportium no cotiza. Importa más de lo que parece: de portería a cero y gana a cero, Sportium SOLO publica el lado 'sí', así que el lado 'no' (el más probable, el aburrido) se quedaba sin precio, no se podía valorar y aun así entraba con confianza 80. Encendido, el selector se queda con el lado 'sí' — que además es el que se sale de lo normal. Apagarlo recupera el comportamiento anterior."
      >
        <Toggle value={sel.requirePricedOdds ?? true} onChange={(v) => setSel({ requirePricedOdds: v })} />
      </Field>

      <Field
        label="Unificar eventos equivalentes"
        subtitle="def. ON"
        info="Dos mercados que describen el mismo suceso cuentan como un solo pick. Hoy 'el local marca' y 'el visitante no deja la portería a cero' son la misma cosa y salían las dos en todos los informes. Solo une equivalencias exactas: gana a cero NO se une con portería a cero, porque no son el mismo suceso."
      >
        <Toggle value={sel.dedupeEquivalentEvents ?? true} onChange={(v) => setSel({ dedupeEquivalentEvents: v })} />
      </Field>

      <Field
        label="Cuota de pick no obvio"
        subtitle="1.8–20 · def. 2.5"
        info="Cuota a partir de la cual un candidato entra al informe por lo que PAGA en vez de por lo probable que es. Existe porque el piso de confianza, por definición, elige al favorito: medido en producción, los combos ('ambos marcan y total', 'resultado y ambos marcan') tenían cuota en 112 de 128 partidos y no se emitieron NI UNA VEZ, porque un combo a 2.75 implica un 33% y nunca llegaba al 55% exigido. CUIDADO al bajarlo: esta puerta se salta el piso de confianza, así que acercarlo a la cuota mínima de arriba no relaja el filtro, lo apaga — todo candidato con precio pasaría a ser 'no obvio'. Por eso el servidor no lo deja bajar de 1.8."
      >
        <Input type="number" min={1.8} max={20} step={0.1} className="w-24" value={sel.longshotOddsFloor ?? 2.5}
          onChange={(e) => setSel({ longshotOddsFloor: Math.min(20, Math.max(1.8, Number(e.target.value) || 1.8)) })} />
      </Field>

      <Field
        label="Retorno mínimo del no obvio"
        subtitle="0.5–2 · def. 0.85"
        info="Filtro de calidad del pick no obvio: probabilidad × cuota. NO hay que subirlo por encima de 1 — mientras la probabilidad del motor salga de la matriz anclada al mercado, el retorno de cualquier candidato honesto queda por debajo de 1 por el margen de la casa, así que exigir 1 apagaría la puerta entera. Lo que filtra es la basura: el candidato que el motor ve mucho peor de lo que lo cotiza Sportium. El servidor no lo deja bajar de 0.5, porque en 0 entraría cualquier cosa."
      >
        <Input type="number" min={0.5} max={2} step={0.01} className="w-24" value={sel.minExpectedReturn ?? 0.85}
          onChange={(e) => setSel({ minExpectedReturn: Math.min(2, Math.max(0.5, Number(e.target.value) || 0.5)) })} />
      </Field>

      <Field
        label="Plazas reservadas a no obvios"
        subtitle="0–8 · def. 1"
        info="Cuántas de las plazas de arriba se guardan para un pick no obvio. Sin reserva el favorito gana igual: ordenar por retorno esperado premia al barato (un 1.60 al 60% rinde 0.96; un 5.50 al 17% rinde 0.94), así que el chalk se llevaba las tres plazas. Si no hay ningún no obvio admisible no reserva nada — nunca hace que salgan menos picks. En 0 vuelve al comportamiento anterior."
      >
        <Input type="number" min={0} max={8} className="w-24" value={sel.reserveLongshotSlots ?? 1}
          onChange={(e) => setSel({ reserveLongshotSlots: Math.min(8, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>
    </SectionCard>
  );
}

/** Umbrales del inyector de mercados de jugador (idea #1, Fase C), incluida la
 *  corrección del margen del libro de goleador. */
function PlayerMarketsCard({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  const pm = form.playerMarketsConfig ?? DEFAULT_PLAYER_MARKETS_CONFIG;
  const setPm = (patch: Partial<NonNullable<PredictionConfig['playerMarketsConfig']>>) =>
    setField('playerMarketsConfig', { ...pm, ...patch });

  return (
    <SectionCard
      title="Mercados de jugador"
      subtitle="Requiere Player markets ON"
      info={
        'Controla los picks de goleador y asistencia. El ajuste importante es la corrección del margen: el libro de goleador de Sportium lista unos 40 jugadores cuyas probabilidades implícitas suman entre 4.7 y 8.6, cuando la suma honesta ronda 2.4. Tomarlas crudas inflaba la confianza: medido sobre 180 picks ya liquidados con el settlement arreglado, declaraban un 41.5% de acierto y acertaban el 29.4% — el peor mercado del catálogo.'
      }
    >
      <Field label="Máx. picks por partido" subtitle="0–6 · def. 2" info="Tope de picks de jugador por informe (como mucho uno por mercado: goleador y asistencia).">
        <Input type="number" min={0} max={6} className="w-24" value={pm.maxPicks}
          onChange={(e) => setPm({ maxPicks: Math.min(6, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field label="Confianza mínima" subtitle="0–0.95 · def. 0.2" info="Piso de confianza para emitir un pick de jugador, ya corregido el margen. Con la corrección encendida las confianzas bajan bastante, así que un piso alto deja de emitir picks de jugador — que es el comportamiento correcto cuando el mercado no da para más.">
        <Input type="number" min={0} max={0.95} step={0.05} className="w-24" value={pm.minConfidence}
          onChange={(e) => setPm({ minConfidence: Math.min(0.95, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field
        label="Corregir margen del libro"
        subtitle="def. ON"
        info="Reparte el margen del libro entre todos los jugadores antes de calibrar, en vez de tomar 1/cuota tal cual. Apagarlo recupera el comportamiento anterior, que está medido en ROI −30.8%."
      >
        <Toggle value={pm.devigEnabled ?? true} onChange={(v) => setPm({ devigEnabled: v })} />
      </Field>

      <Field
        label="Goleadores esperados"
        subtitle="0.5–10 · def. 2.4"
        info="Suma objetivo del libro, en goleadores DISTINTOS esperados por partido. No es una probabilidad y no debe valer 1: el mercado no es excluyente (varios jugadores pueden marcar en el mismo partido), así que su suma justa se parece al número de goleadores que se espera ver. Bajarlo hace la corrección más agresiva; subirlo, más suave. Nunca escala hacia arriba: si un libro ya suma menos que esto, se deja intacto."
      >
        <Input type="number" min={0.5} max={10} step={0.1} className="w-24" value={pm.bookTargetSum ?? 2.4}
          onChange={(e) => setPm({ bookTargetSum: Math.min(10, Math.max(0.5, Number(e.target.value) || 0.5)) })} />
      </Field>
    </SectionCard>
  );
}

function RecommendationsCard({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  const rc = form.recommendationsConfig ?? DEFAULT_RECOMMENDATIONS_CONFIG;
  const setRc = (patch: Partial<RecommendationsConfig>) => setField('recommendationsConfig', { ...rc, ...patch });

  return (
    <SectionCard
      title="Recomendaciones por mercado (idea #24)"
      subtitle="Solo PRO/CLUB" info="Muestra a los suscriptores, dentro de la sección de estadísticas/winrate, los mercados en los que el motor viene acertando más. Se calcula del winrate real por mercado (prediction_pick_stats), sin nada inventado. Apagado = el endpoint /stats/recommendations no expone nada."
    >
      <Field
        label="Recomendaciones habilitadas"
        subtitle="recommendationsEnabled" info="Apagado = la app no muestra el bloque de recomendaciones."
      >
        <Toggle value={form.recommendationsEnabled} onChange={(v) => setField('recommendationsEnabled', v)} />
      </Field>

      <Field
        label="Muestra mínima"
        subtitle="def. 20" info="Mínimo de picks liquidados de un mercado para que sea recomendable. Evita recomendar con una muestra ridícula."
      >
        <Input
          type="number"
          min={1}
          max={100000}
          className="w-28"
          value={rc.minSample}
          onChange={(e) => setRc({ minSample: Number(e.target.value) })}
        />
      </Field>

      <Field
        label="Winrate mínimo (%)"
        subtitle="0–100 · def. 55" info="Winrate mínimo para que un mercado se recomiende."
      >
        <Input
          type="number"
          min={0}
          max={100}
          className="w-28"
          value={rc.minWinratePct}
          onChange={(e) => setRc({ minWinratePct: Number(e.target.value) })}
        />
      </Field>

      <Field label="Máximo de mercados (topK)" subtitle="Cuántos mercados recomendar como máximo (0–20). Default 4.">
        <Input
          type="number"
          min={0}
          max={20}
          className="w-28"
          value={rc.topK}
          onChange={(e) => setRc({ topK: Number(e.target.value) })}
        />
      </Field>

      <Field
        label="Ventana (días)"
        subtitle="1–365 · def. 90" info="Días hacia atrás sobre los que se mide el rendimiento por mercado."
      >
        <Input
          type="number"
          min={1}
          max={365}
          className="w-28"
          value={rc.windowDays}
          onChange={(e) => setRc({ windowDays: Number(e.target.value) })}
        />
      </Field>
    </SectionCard>
  );
}
