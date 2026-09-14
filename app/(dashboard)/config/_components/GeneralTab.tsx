'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionCard, Field, SubHeading } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { cn, formatDateTime } from '@/lib/utils';
import {
  ENGINE_STUDY_QUERY_KEY,
  RATE_LIMIT_NOTICE,
  WEEKDAY_LABELS,
  describeVerdict,
  fetchEngineStudy,
  isRateLimitError,
  runEngineStudy,
  triggerLabel,
  verdictLabel,
  verdictTone,
  type EngineStudyRun,
} from '@/app/(dashboard)/engine-study/_components/engine-study-api';
import { MultiCheckbox, PredictionEngineCard } from './controls';
import { MODELS, MODEL_LABELS, MODEL_DEFAULT_MAX_TOKENS, MARKETS, DATA_FIELDS, REASONING_OPTIONS } from './constants';
import type { PredictionConfig, RecommendationsConfig, SetField } from './types';

/** Acota un número al rango: el input vacío da `Number('') === 0`, y para los
 *  campos con mínimo > 0 ese cero se colaría hasta que el zod lo rechazara. */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  minCoherence: 0.5,
  narrativeMinConfidence: 0.55,
  midDoorEnabled: true,
  midDoorMinCoherence: 0.8,
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
                {MODEL_LABELS[m] ?? m}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reasoning effort" subtitle="none = thinking off on DeepSeek" info="Depth of reasoning for supported models. Reasoning tokens are billed at the OUTPUT rate and currently make up ~85% of what a prediction emits, so this is the main cost lever. On DeepSeek, none turns thinking off outright and cuts the bill roughly in half, at the cost of shallower analysis. The GPT models have no off switch: there none just omits the setting and the model falls back to its own default effort, which is not necessarily cheaper than low. Leave empty to use the provider default.">
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

      <PredictionEngineCard form={form} setField={setField}>
        <EngineStudyControls form={form} setField={setField} />
      </PredictionEngineCard>

      <SpecialMarketsSelectorCard form={form} setField={setField} />

      <PlayerMarketsCard form={form} setField={setField} />

      <RecommendationsCard form={form} setField={setField} />

      <LowConvictionCard form={form} setField={setField} />

      <SectionCard title="Input Data Fields" subtitle="Data sources the model receives to generate predictions">
        <MultiCheckbox options={DATA_FIELDS} value={form.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>

      <SectionCard
        title="Auxiliary processing"
        subtitle="Choose where translations and team-news extraction run"
        info="These controls apply to auxiliary content processing. They do not change the model used to generate predictions."
      >
        <Field
          label="Preview translation"
          subtitle="English match previews → Spanish"
          info="Google Cloud NMT translates without a generative LLM call. Legacy LLM keeps the previous behavior for rollback. Disabled leaves the English original visible when no matching cached translation exists."
        >
          <Select
            className="w-64"
            value={form.previewTranslationMode}
            onChange={(e) =>
              setField('previewTranslationMode', e.target.value as PredictionConfig['previewTranslationMode'])
            }
          >
            <option value="google_nmt">Google Cloud NMT</option>
            <option value="llm">Legacy LLM</option>
            <option value="disabled">Disabled</option>
          </Select>
        </Field>

        <Field
          label="News extraction"
          subtitle="Classify and structure team news"
          info="Shadow validation compares deterministic rules with the LLM while keeping the LLM result authoritative. Hybrid uses rules for clear cases and sends only ambiguous items to the LLM. Rules only never calls the LLM."
        >
          <Select
            className="w-64"
            value={form.newsExtractionMode}
            onChange={(e) => setField('newsExtractionMode', e.target.value as PredictionConfig['newsExtractionMode'])}
          >
            <option value="shadow">Shadow validation</option>
            <option value="hybrid">Hybrid</option>
            <option value="llm">LLM only</option>
            <option value="rules_only">Rules only</option>
            <option value="disabled">Disabled</option>
          </Select>
        </Field>

        <div className="mt-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs leading-relaxed text-text-muted font-sans">
            The <span className="font-medium text-text-secondary">team_news</span> input field only controls whether
            news is synchronized and included before prediction generation. Home curation and explicit manual syncs use
            their own gates.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * Estudio del motor (plan "motor que aprende", fase A) y veto por selección con
 * boletín numérico (fase B). Va DENTRO de la card "Motor Predicta calibrado",
 * debajo de las capas: es la reconstrucción del mapa que consume la capa
 * "Confidence calibration", y el texto de ayuda de esa capa apunta aquí.
 */
function EngineStudyControls({ form, setField }: { form: PredictionConfig; setField: SetField }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [lastManualRun, setLastManualRun] = useState<EngineStudyRun | null>(null);

  const overview = useQuery({
    queryKey: ENGINE_STUDY_QUERY_KEY,
    queryFn: fetchEngineStudy,
    staleTime: 30_000,
  });

  const runNow = useMutation({
    mutationFn: runEngineStudy,
    onSuccess: (run) => {
      setLastManualRun(run);
      toast.success(describeVerdict(run));
      qc.invalidateQueries({ queryKey: ENGINE_STUDY_QUERY_KEY });
    },
    onError: (err: Error) => {
      // El 429 no es un fallo: es el límite de 2 corridas cada 5 minutos.
      if (isRateLimitError(err)) toast.info(RATE_LIMIT_NOTICE);
      else toast.error(err.message);
    },
  });

  const latest = lastManualRun ?? overview.data?.latest ?? null;
  const map = overview.data?.map;
  const day = form.engineStudyDayOfWeek ?? 1;

  return (
    <>
      <SubHeading>Estudio del motor</SubHeading>
      <Field
        label="Recalibrar cada semana"
        subtitle="def. apagado"
        info="Reconstruye el mapa de calibración una vez por semana (día y hora de abajo, en horario de Caracas) por mercado, por selección (mercado + lado + línea) y por el modelo activo, entrenando con la confianza declarada de los picks liquidados y recuperándola de los registros del LLM cuando el pick no la guardó. Es una recalibración CON GUARDA: parte las observaciones en entrenamiento y validación (los últimos «Días de validación»), construye el candidato solo con el entrenamiento y lo puntúa contra el mapa vigente. El candidato SOLO sustituye al mapa vigente si no empeora en validación (log-loss con un margen de 0.002); si es peor, se rechaza y el vigente se queda. Si la validación no llega a 300 observaciones, el veredicto es «muestra insuficiente» y el mapa vigente queda intacto: es lo que verás las primeras semanas, y es la prueba de que la guarda funciona. Sin esa guarda, la primera corrida con las 14 observaciones utilizables de hoy habría borrado el mapa de 8422. Cada corrida queda registrada en la página Estudio del motor. Apagado, nada corre solo; el botón «Recalibrar ahora» dispara la misma corrida con las mismas consecuencias: si el candidato pasa la validación (applied) sustituye el mapa vigente de producción; con insufficient_sample o rejected el mapa no se toca."
      >
        <Toggle value={form.engineStudyEnabled ?? false} onChange={(v) => setField('engineStudyEnabled', v)} />
      </Field>
      <Field
        label="Día (Caracas)"
        subtitle="0-6 · def. lunes"
        info="Convención de Date.getUTCDay(): 0 = domingo, 1 = lunes … 6 = sábado, interpretado en horario de Caracas (entre las 00:00 y las 04:00 UTC del lunes todavía es domingo). Por defecto lunes, después de liquidar el fin de semana. Una vez por semana: la corrida programada es idempotente por semana en la base de datos."
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={6}
            className="w-24"
            value={day}
            onChange={(e) => setField('engineStudyDayOfWeek', clamp(Number(e.target.value) || 0, 0, 6))}
          />
          <span className="text-xs text-text-muted font-sans">{WEEKDAY_LABELS[day] ?? ''}</span>
        </div>
      </Field>
      <Field
        label="Hora (Caracas)"
        subtitle="0-23 · def. 8"
        info="Hora de Caracas (0-23) de la corrida semanal. Por defecto 8, con el settlement del domingo ya cerrado."
      >
        <Input
          type="number"
          min={0}
          max={23}
          className="w-24"
          value={form.engineStudyHourCaracas ?? 8}
          onChange={(e) => setField('engineStudyHourCaracas', clamp(Number(e.target.value) || 0, 0, 23))}
        />
      </Field>
      <Field
        label="Días de validación"
        subtitle="7-60 · def. 21"
        info="Cuántos días finales se reservan como validación (holdout) del walk-forward. El candidato se entrena con todo lo anterior y se puntúa solo sobre estos días, que no vio. Más días: veredicto más fiable, menos datos para entrenar; menos días: al revés. Por debajo de 300 observaciones en la validación el veredicto es «muestra insuficiente» y el mapa no se toca."
      >
        <Input
          type="number"
          min={7}
          max={60}
          className="w-24"
          value={form.engineStudyHoldoutDays ?? 21}
          onChange={(e) => setField('engineStudyHoldoutDays', clamp(Number(e.target.value) || 7, 7, 60))}
        />
      </Field>
      <Field
        label="Recalibrar ahora"
        subtitle="Corrida manual · lee la config guardada"
        info="Corre el estudio ahora aunque la recalibración semanal esté apagada, con la configuración YA GUARDADA (guarda antes si cambiaste algo arriba). No es una simulación: si el candidato pasa la validación (applied) sustituye el mapa vigente de producción; con insufficient_sample o rejected el mapa no se toca. Con la muestra actual el resultado esperado es insufficient_sample. Corre de forma síncrona y puede tardar unos segundos. Límite: 2 corridas cada 5 minutos."
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" loading={runNow.isPending} onClick={() => runNow.mutate()}>
              Recalibrar ahora
            </Button>
            <span className="text-xs text-text-muted font-sans">
              {runNow.isPending ? 'Corriendo el estudio… puede tardar unos segundos.' : 'Guarda los cambios antes de disparar.'}
            </span>
          </div>
          {lastManualRun && (
            <p className="text-xs font-sans text-text-secondary">
              <VerdictPill run={lastManualRun} /> <span className="ml-1">{describeVerdict(lastManualRun)}</span>
            </p>
          )}
        </div>
      </Field>
      <Field label="Última reconstrucción" subtitle="Lo que dice engine_study_runs">
        {overview.isLoading ? (
          <span className="text-xs text-text-muted font-sans">Cargando…</span>
        ) : overview.isError ? (
          <span className="text-xs text-danger font-sans">No se pudo leer el estudio del motor.</span>
        ) : (
          <div className="flex flex-col gap-1 text-xs font-sans text-text-secondary">
            {latest ? (
              <>
                <span>
                  Corrida <span className="text-text-primary">{latest.weekKey}</span> · {formatDateTime(latest.startedAt)} ·{' '}
                  {triggerLabel(latest.trigger)} · modelo {latest.model ?? '—'}
                </span>
                <span>
                  Observaciones: <span className="text-text-primary">{latest.observations.toLocaleString()}</span>{' '}
                  (recuperadas del LLM: {latest.recoveredObservations.toLocaleString()} · validación:{' '}
                  {latest.holdoutObservations.toLocaleString()}) · vetadas: {latest.vetoedSelections}
                </span>
                <span className="flex items-center gap-2">
                  Veredicto: <VerdictPill run={latest} /> <span>{describeVerdict(latest)}</span>
                </span>
              </>
            ) : (
              <span>Todavía no se ha corrido el estudio del motor.</span>
            )}
            {map && (
              <span>
                Mapa vigente: <span className="text-text-primary">{map.observations.toLocaleString()}</span> observaciones ·
                actualizado {formatDateTime(map.updatedAt)} · {map.hasSelectionBins ? 'con bins por selección' : 'sin bins por selección todavía'}
                {map.missingMarkets.length > 0 && ` · sin bin: ${map.missingMarkets.join(', ')}`}
              </span>
            )}
            <Link href="/engine-study" className="text-primary hover:underline w-fit">
              Ver el estudio completo →
            </Link>
          </div>
        )}
      </Field>

      <SubHeading>Selecciones que pierden</SubHeading>
      <Field
        label="Marcar selecciones que pierden"
        subtitle="def. apagado"
        info="Marca (no quita) los picks cuya selección (mercado + lado + línea) rinde por debajo del piso de A/E en la última corrida del estudio del motor. El pick se sigue emitiendo en el informe, marcado como selección débil, y deja de entrar en combinadas, en el canal de Telegram y en las notificaciones. Se marca en vez de quitar porque los créditos se cobran ANTES de filtrar por tier: un tier de un solo mercado se quedaría vacío y el usuario pagaría por nada. Los umbrales son propios de la predicción, no los de combinadas: allí una pata mala mata el billete entero y el piso puede ser más duro. Si el estudio no se puede leer, no se marca nada (fallo abierto, con aviso en el log). Los números de cada veto quedan en predictions.meta.weakSelections para auditarlos. La app publicada no pinta la marca todavía: el valor de hoy es que esos picks dejen de propagarse."
      >
        <Toggle
          value={form.predictionWeakSelectionFilter ?? false}
          onChange={(v) => setField('predictionWeakSelectionFilter', v)}
        />
      </Field>
      <Field
        label="A/E mínimo por selección (predicción)"
        subtitle="0–1.5 · def. 0.90"
        info="A/E = aciertos reales / aciertos que pagaba la cuota, encogido hacia 0.95 con peso 15 (a precio justo ronda 0.95 porque el margen de la casa va dentro). Por debajo de este piso la selección se marca. Con 0.90 y muestra 50 se marcan exactamente las tres medidas el 2026-09-12 (córners más de 9.5, hándicap asiático local −0.5 y menos de 3.5 goles) y ninguna sana. 0 apaga el filtro. Es un umbral distinto del de la pestaña Combinadas a propósito."
      >
        <Input
          type="number"
          min={0}
          max={1.5}
          step={0.01}
          className="w-24"
          value={form.predictionSelectionMinAe ?? 0.9}
          onChange={(e) => setField('predictionSelectionMinAe', clamp(Number(e.target.value) || 0, 0, 1.5))}
        />
      </Field>
      <Field
        label="Muestra mínima por selección (predicción)"
        subtitle="5–2000 · def. 50"
        info="Picks liquidados que necesita una selección en los últimos 90 días para que el piso la juzgue. Por debajo no se marca nada: la falta de historia no es evidencia de que pierda."
      >
        <Input
          type="number"
          min={5}
          max={2000}
          className="w-24"
          value={form.predictionSelectionMinSample ?? 50}
          onChange={(e) => setField('predictionSelectionMinSample', clamp(Number(e.target.value) || 5, 5, 2000))}
        />
      </Field>
      <Field
        label="Boletín numérico en el prompt"
        subtitle="def. apagado"
        info="Añade al prompt del scheduler un bloque de NÚMEROS con muestra: winrate y A/E por mercado, A/E por selección con picks y aciertos, la lista literal de selecciones vetadas y los topes de confianza. Nunca lecciones en prosa: solo números y una nota fija que pide bajar la confianza donde el histórico falla, sin invitar a subirla en ningún sitio (premiar lo que va bien empeora: está medido). Sin muestra suficiente no se manda nada. Es texto que se repite en cada partido del lote: mide el coste en tokens (Consumo) una semana antes de dejarlo encendido."
      >
        <Toggle
          value={form.predictionCalibrationBulletinEnabled ?? false}
          onChange={(v) => setField('predictionCalibrationBulletinEnabled', v)}
        />
      </Field>
    </>
  );
}

function VerdictPill({ run }: { run: EngineStudyRun }) {
  const label = verdictLabel(run);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-sans uppercase tracking-wide',
        verdictTone(run.verdict, run.status),
      )}
    >
      {label}
    </span>
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

      <Field
        label="Coherencia mínima con el informe"
        subtitle="0–1 · def. 0.5"
        info="Fracción de la probabilidad del exótico que debe caber dentro de lo que el LLM ya afirmó con confianza (resultado, doble oportunidad, totales, ambos marcan, hándicaps). Se mide sobre la misma matriz Poisson de la que salen los exóticos. Existe por Valencia–Barcelona (2026-09-06): el informe decía 0-3, visitante -1.5 y más de 1.5 goles al 87%, y el selector añadía 'Barcelona marca menos de 1.5' (26%) y 'empate o visitante con menos de 2.5' (29%) porque pagaban bien. Con 0.5, más de la mitad de su probabilidad tiene que vivir en el guion. En 0 la puerta se apaga; aun así el motor NUNCA emite un exótico incompatible de plano con un pick del LLM de 60 o más (cinturón fijo)."
      >
        <Input type="number" min={0} max={1} step={0.05} className="w-24" value={sel.minCoherence ?? 0.5}
          onChange={(e) => setSel({ minCoherence: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field
        label="Confianza que define el informe"
        subtitle="0–0.95 · def. 0.55"
        info="Confianza desde la que un pick del LLM cuenta como parte del guion contra el que se miden los exóticos. Por debajo, el informe no lo afirma con fuerza suficiente como para descartar exóticos por él. El marcador exacto nunca cuenta (es la casilla más densa, no una restricción), ni tampoco los picks marcados como parejos o secundarios."
      >
        <Input type="number" min={0} max={0.95} step={0.05} className="w-24" value={sel.narrativeMinConfidence ?? 0.55}
          onChange={(e) => setSel({ narrativeMinConfidence: Math.min(0.95, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>

      <Field
        label="Puerta intermedia"
        subtitle="def. ON"
        info="Admite el candidato con cuota entre la 'Cuota mínima' y la 'Cuota de pick no obvio', confianza bajo el piso, que sea MUY coherente con el informe (ver control de abajo) y con retorno esperado que aguante. Cierra el hueco por donde se caía el pick que refuerza el guion: en Valencia–Barcelona, 'visitante gana sin recibir goles' (41% @2.35), exactamente el 0-3 del informe, no tenía puerta — ni llegaba al 55 ni a la cuota 2.5. Los picks que entran por aquí se marcan como secundarios (no cuentan para el grado), igual que los no obvios."
      >
        <Toggle value={sel.midDoorEnabled ?? true} onChange={(v) => setSel({ midDoorEnabled: v })} />
      </Field>

      <Field
        label="Coherencia de la puerta intermedia"
        subtitle="0.5–1 · def. 0.8"
        info="Cuánto tiene que reforzar el guion un candidato para entrar por la puerta intermedia. Es más exigente que la coherencia general a propósito: esta puerta se salta el piso de confianza y su única justificación es que el pick cuente la misma historia que el informe. El servidor no lo deja bajar de 0.5."
      >
        <Input type="number" min={0.5} max={1} step={0.05} className="w-24" value={sel.midDoorMinCoherence ?? 0.8}
          onChange={(e) => setSel({ midDoorMinCoherence: Math.min(1, Math.max(0.5, Number(e.target.value) || 0.5)) })} />
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
