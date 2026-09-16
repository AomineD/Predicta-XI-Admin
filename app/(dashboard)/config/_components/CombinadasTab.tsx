'use client';

import { useMutation } from '@tanstack/react-query';
import { SectionCard, Field, SubHeading, Toggle, NumInput } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { LeagueMultiSelect, TeamBlacklistPicker } from './controls';
import type { CompetitionLite, PredictionConfig, SetField } from './types';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
];

// Dia de corte de la semana: solo martes..sabado (domingo y lunes dejarian una
// ventana vacia; el backend los rechaza). 0 = sin corte, una sola ventana.
const SPLIT_DAYS = [
  { value: 0, label: 'Sin corte (semana entera)' },
  ...WEEKDAYS.filter((d) => d.value >= 2 && d.value <= 6),
];

// Dias validos para la PRIMERA corrida: con corte, solo de lunes al dia anterior
// al corte (un dia del corte en adelante, o el domingo, ya es la segunda
// ventana y la primera se quedaria sin estudiar ni combinada, sin aviso). El
// backend rechaza el guardado con la misma regla; esto evita llegar a ese error.
function firstRunDays(splitDay: number) {
  if (!splitDay) return WEEKDAYS;
  return WEEKDAYS.filter((d) => d.value >= 1 && d.value < splitDay);
}

function isValidFirstRunDay(day: number, splitDay: number) {
  return !splitDay || (day >= 1 && day < splitDay);
}

/** Acota al rango: el input vacio da Number('') === 0, que para un minimo > 0
 *  se colaria hasta que el zod lo rechazara al guardar. */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Par min/max dentro de un solo Field, con el aviso en linea cuando el minimo
 *  supera al maximo. El backend RECHAZA el guardado en ese caso (refine con
 *  path en la clave Max), y el consumidor, si le llegara, se quedaria con el
 *  maximo y avisaria en el log: nunca un cero silencioso. */
function MinMaxPair({
  min,
  max,
  onMin,
  onMax,
  lo,
  hi,
  step,
}: {
  min: number;
  max: number;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
  lo: number;
  hi: number;
  step?: number;
}) {
  // Los pares DECIMALES (cuotas) van con NumInput: un Input controlado con
  // Number() en cada tecla convierte el "1." intermedio en 1 y no deja escribir
  // 1.55. Los enteros siguen el patron de los pares ya existentes.
  const decimal = step != null && step < 1;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {decimal ? (
          <NumInput value={min} onChange={(v) => onMin(clamp(v, lo, hi))} min={lo} max={hi} step={step} />
        ) : (
          <Input type="number" min={lo} max={hi} className="w-20" value={min} onChange={(e) => onMin(clamp(Number(e.target.value) || lo, lo, hi))} />
        )}
        <span className="text-xs text-text-muted">a</span>
        {decimal ? (
          <NumInput value={max} onChange={(v) => onMax(clamp(v, lo, hi))} min={lo} max={hi} step={step} />
        ) : (
          <Input type="number" min={lo} max={hi} className="w-20" value={max} onChange={(e) => onMax(clamp(Number(e.target.value) || lo, lo, hi))} />
        )}
      </div>
      {min > max && (
        <span className="text-xs font-sans text-warning">El mínimo supera al máximo: el guardado se rechaza.</span>
      )}
    </div>
  );
}

export function CombinadasTab({
  form,
  setField,
  competitions,
}: {
  form: PredictionConfig;
  setField: SetField;
  competitions: CompetitionLite[];
}) {
  // Los disparos manuales entran POR DEBAJO del gate de dia/hora del scheduler,
  // pero NO por debajo del flag: el backend rechaza ambos con 400 si su switch
  // esta apagado. Aqui se deshabilita el boton para no gastar el viaje.
  const runWeeklyStudy = useMutation({
    mutationFn: () => api.post('/admin/combinadas/weekly/study', {}),
  });
  const runWeeklyBuild = useMutation({
    mutationFn: () => api.post('/admin/combinadas/weekly/generate', {}),
  });

  return (
    <div>
      <SectionCard
        title="User combinadas — Predicta opinion"
        info="Kill-switch for the paid AI opinion on user-built parlays (queued to the worker). Off = the app hides the 'Pedir opinión' button and no opinion can be requested."
      >
        <Field label="Opinions enabled" info="When off, users cannot request a Predicta opinion, which stops all opinion LLM spend.">
          <Toggle value={form.userCombinadaOpinionsEnabled ?? true} onChange={(v) => setField('userCombinadaOpinionsEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard title="Combinadas" subtitle="Multi-match parlay predictions generated daily">
        <Field label="Enabled" subtitle="Generate combinadas automatically each morning">
          <Toggle value={form.combinadasEnabled ?? false} onChange={(v) => setField('combinadasEnabled', v)} />
        </Field>
        <Field label="Base prediction hour (UTC)" subtitle="When to run early predictions for all matches (0-23)">
          <Input type="number" min={0} max={23} className="w-24" value={form.combinadasBasePredictionHourUtc ?? 8} onChange={(e) => setField('combinadasBasePredictionHourUtc', Number(e.target.value))} />
        </Field>
        <Field label="Max legs" subtitle="Maximum matches per combinada (2-5)">
          <Input type="number" min={2} max={5} className="w-24" value={form.combinadasMaxLegs ?? 5} onChange={(e) => setField('combinadasMaxLegs', Number(e.target.value))} />
        </Field>
        <Field
          label="Max attempts per day"
          subtitle="Failed attempts before giving up for the day (1-50)"
          info="The cron ticks every minute and only a completed run closes the day, so a long outage retries forever. On 2026-08-30 a DeepSeek balance error produced 428 attempts (957 rejected LLM calls) between 08:30 and 15:07 UTC. This cap bounds the worst case whatever the cause. Also applies to the weekly combinada."
        >
          <Input type="number" min={1} max={50} className="w-24" value={form.combinadasMaxDailyAttempts ?? 5} onChange={(e) => setField('combinadasMaxDailyAttempts', Number(e.target.value))} />
        </Field>
        <Field
          label="Retry spacing (minutes)"
          subtitle="Minimum gap between two attempts (1-240)"
          info="Backoff between retries. The cron itself runs every minute because the hour gate lives inside the tick, so without this a retry means hammering the provider 60 times an hour. Default 15 min: 5 attempts cover ~1 h of transient failure before the day closes."
        >
          <Input type="number" min={1} max={240} className="w-24" value={form.combinadasRetryMinutes ?? 15} onChange={(e) => setField('combinadasRetryMinutes', Number(e.target.value))} />
        </Field>
        <Field label="Risk mode" info="Precise = conservative picks. Bold = avoids ultra-safe odds (under 1.30).">
          <Select className="w-32" value={form.combinadasRiskMode ?? 'precise'} onChange={(e) => setField('combinadasRiskMode', e.target.value)}>
            <option value="precise">Precise</option>
            <option value="bold">Bold</option>
          </Select>
        </Field>

        <SubHeading>Regular combinadas</SubHeading>
        <Field label="Count" subtitle="Total regular combinadas to generate (0-10)">
          <Input type="number" min={0} max={10} className="w-24" value={form.combinadasCountRegular ?? 3} onChange={(e) => setField('combinadasCountRegular', Number(e.target.value))} />
        </Field>
        <Field label="Min confidence (regular)" subtitle="Minimum pick confidence for regular combinadas (1-95)">
          <Input type="number" min={1} max={95} className="w-24" value={form.combinadasMinConfidenceRegular ?? 55} onChange={(e) => setField('combinadasMinConfidenceRegular', Number(e.target.value))} />
        </Field>
        <Field label="Leagues (regular)" subtitle="Vacío = todas las V1" info="Which leagues regular combinadas can cover.">
          <LeagueMultiSelect
            leagues={competitions}
            value={form.combinadasRegularLeagues ?? []}
            onChange={(v) => setField('combinadasRegularLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (regular)" subtitle="1.5–20" info="Reject regular combinadas whose product of odds exceeds this.">
          <Input type="number" min={1.5} max={20} step={0.1} className="w-24" value={form.combinadasRegularMaxOdds ?? 6.0} onChange={(e) => setField('combinadasRegularMaxOdds', Number(e.target.value))} />
        </Field>
        <Field
          label="Cuota mínima por pata (regular y Segura)"
          subtitle="0–3 · 0 = apagado · def. 1.20"
          info="Ninguna pata de la regular diaria, de la semanal ni de las Seguras paga menos que esto. Se aplica al armar el pool, así que ningún relleno posterior lo salta: antes salían combinadas a cuota 1.11 con patas a 1.03 que no le aportan nada al usuario. Subirlo deja menos candidatos entre semana (el pool ya es corto); si un día no sale regular, bájalo a 1.15 antes de apagarlo. Las Seguras usan el mayor entre este valor y su piso propio de 1.15."
        >
          <Input type="number" min={0} max={3} step={0.05} className="w-24" value={form.combinadasRegularLegOddsFloor ?? 1.2} onChange={(e) => {
            // Vaciar el campo NO lo apaga: `Number('')` es 0, y aquí 0 significa apagado.
            if (e.target.value.trim() === '') return;
            setField('combinadasRegularLegOddsFloor', Number(e.target.value));
          }} />
        </Field>
        <Field label="Excluded teams (regular)" subtitle="Skip any regular combinada involving these teams">
          <TeamBlacklistPicker value={form.combinadasRegularExcludedTeams ?? []} onChange={(v) => setField('combinadasRegularExcludedTeams', v)} />
        </Field>

        <SubHeading>Premium combinadas</SubHeading>
        <Field label="Count" subtitle="Total premium combinadas to generate (0-10)">
          <Input type="number" min={0} max={10} className="w-24" value={form.combinadasCountPremium ?? 2} onChange={(e) => setField('combinadasCountPremium', Number(e.target.value))} />
        </Field>
        <Field label="Min confidence (premium)" subtitle="Minimum pick confidence for premium combinadas (1-95)">
          <Input type="number" min={1} max={95} className="w-24" value={form.combinadasMinConfidencePremium ?? 45} onChange={(e) => setField('combinadasMinConfidencePremium', Number(e.target.value))} />
        </Field>
        <Field label="Leagues (premium)" subtitle="Vacío = todas las V1" info="Which leagues premium combinadas can cover.">
          <LeagueMultiSelect
            leagues={competitions}
            value={form.combinadasPremiumLeagues ?? []}
            onChange={(v) => setField('combinadasPremiumLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (premium)" subtitle="1.5–20" info="Reject premium combinadas whose product of odds exceeds this.">
          <Input type="number" min={1.5} max={20} step={0.1} className="w-24" value={form.combinadasPremiumMaxOdds ?? 6.0} onChange={(e) => setField('combinadasPremiumMaxOdds', Number(e.target.value))} />
        </Field>

        <Field
          label="Cuota mínima por pata (premium)"
          subtitle="1–10 · def. 1.35"
          info="Cada pata de una combinada premium debe pagar al menos esto. Es lo que hace premium a una combinada de verdad y, a diferencia del edge de abajo, no depende de superar al mercado: una pata a 1.05 no aporta nada a una combinada ambiciosa. Este piso se mantiene SIEMPRE, incluso en la segunda pasada del pool."
        >
          <Input type="number" min={1} max={10} step={0.05} className="w-24" value={form.combinadasPremiumOddsFloor ?? 1.35} onChange={(e) => setField('combinadasPremiumOddsFloor', Number(e.target.value))} />
        </Field>

        <Field
          label="Edge mínimo (premium)"
          subtitle="0–50 % · def. 3"
          info={
            'Filtro de valor del pool premium. OJO con subirlo: mientras el modelo independiente esté apagado, ese “edge” se calcula como (confianza/100) × cuota − 1, y con la calibración activa (que solo BAJA la confianza) más el anclaje a la probabilidad de mercado, la confianza tiende a 1/cuota — así que la fórmula acaba midiendo el margen de la casa con signo negativo, no valor. Medido sobre 100 combinadas el 2026-08-27: edge medio de pata −7,7 % y 96 % negativos. Pedir +3 % vaciaba el pool y dejó CERO combinadas premium desde el 5 de julio. Ahora, si este filtro deja el pool vacío, el pool se rearma sin él (manteniendo la cuota mínima por pata) y queda anotado en las notas del job. Con el modo máxima probabilidad activo (sección de abajo) este filtro NO se aplica.'
          }
        >
          <Input type="number" min={0} max={50} step={0.5} className="w-24" value={form.combinadasPremiumMinEdgePct ?? 3} onChange={(e) => setField('combinadasPremiumMinEdgePct', Number(e.target.value))} />
        </Field>

        <SubHeading>Premium: máxima probabilidad con cuota mínima</SubHeading>
        <Field
          label="Modo máxima probabilidad"
          subtitle="def. activado"
          info="Cada premium es la combinación de partidos distintos con MAYOR probabilidad de acierto cuya cuota combinada cae entre el mínimo y el máximo de abajo, usando solo patas en las que la confianza del modelo no va por encima de lo que paga la cuota. Backtest sobre producción (68 días, 2026-04-20 a 2026-09-10): elegir por máxima confianza daba 35 % de acierto en combinadas de cuota ~2.0; este modo, 47-49 %. Con cuota 2.0 el techo realista está en torno a 50 %: ninguna regla probada lo superó. Con el modo activo el 'Edge mínimo (premium)' no se aplica, el piso de calibración viejo (confianza × winrate) tampoco, y no hay pasada relajada: un día sin combinación que quepa en la ventana no publica premium y lo anota en las notas del job. Apagado = selector clásico por confianza."
        >
          <Toggle value={form.combinadasPremiumQualityMode ?? true} onChange={(v) => setField('combinadasPremiumQualityMode', v)} />
        </Field>
        <Field
          label="Cuota combinada mínima (premium)"
          subtitle="def. 2.00"
          info="La premium elige la combinación de MENOR cuota que alcanza este mínimo, porque es la de mayor probabilidad: cada punto de cuota de más es acierto de menos. Subirlo da más pago por acierto y menos aciertos."
        >
          <Input type="number" min={1.1} max={20} step={0.05} className="w-24" value={form.combinadasPremiumMinCombinedOdds ?? 2.0} onChange={(e) => setField('combinadasPremiumMinCombinedOdds', Number(e.target.value))} />
        </Field>
        <Field
          label="Cuota combinada máxima (premium)"
          subtitle="def. 2.60"
          info="Tope de seguridad: en un día flaco evita publicar una premium de cuota 3+ (acierto ~30 %) solo porque no había nada mejor. Si queda por debajo del mínimo, el backend lo ignora y usa un ancho de +30 % sobre el mínimo, para que la premium no se quede muda."
        >
          <div className="flex flex-col gap-1">
            <Input type="number" min={1.1} max={50} step={0.05} className="w-24" value={form.combinadasPremiumMaxCombinedOdds ?? 2.6} onChange={(e) => setField('combinadasPremiumMaxCombinedOdds', Number(e.target.value))} />
            {(form.combinadasPremiumMaxCombinedOdds ?? 2.6) < (form.combinadasPremiumMinCombinedOdds ?? 2.0) && (
              <span className="text-xs font-sans text-warning">Está por debajo del mínimo: se ignora.</span>
            )}
          </div>
        </Field>
        <Field
          label="Confianza vs cuota (pts, min/max)"
          subtitle="def. −12 a −3"
          info="Una pata solo entra en la premium si su confianza queda dentro de esta banda respecto a la probabilidad que paga la cuota (100 / cuota). −12 a −3 = entre 3 y 12 puntos POR DEBAJO del mercado. Medido sobre patas de predicciones oficiales a cuota 1.30-1.65: a partir de −3 la pata acierta un 9 % menos de lo que paga (cuando el modelo 'sabe más' que la cuota, suele equivocarse); por debajo, todas las franjas rinden al precio. El mínimo no gana acierto: evita patas con confianza de 50 a cuota 1.43, que hundirían la confianza que ve el usuario sin aportar nada. Si el mínimo queda por encima del máximo, se ignora el mínimo."
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input type="number" min={-60} max={20} step={0.5} className="w-20" value={form.combinadasPremiumMinConfOverImplied ?? -12} onChange={(e) => setField('combinadasPremiumMinConfOverImplied', Number(e.target.value))} />
              <span className="text-xs text-text-muted">a</span>
              <Input type="number" min={-30} max={20} step={0.5} className="w-20" value={form.combinadasPremiumMaxConfOverImplied ?? -3} onChange={(e) => setField('combinadasPremiumMaxConfOverImplied', Number(e.target.value))} />
            </div>
            {(form.combinadasPremiumMinConfOverImplied ?? -12) > (form.combinadasPremiumMaxConfOverImplied ?? -3) && (
              <span className="text-xs font-sans text-warning">El mínimo está por encima del máximo: se ignora el mínimo.</span>
            )}
          </div>
        </Field>

        <SubHeading>Confianza que ve el usuario</SubHeading>
        <Field
          label="Confianza anclada al precio"
          subtitle="def. apagado · todas las combinadas"
          info="Cada pata de una combinada (regular, premium, semanal y Seguras) muestra 100/cuota × el A/E de su selección en los últimos 90 días, sin pasar nunca de lo que paga la cuota ni bajar de ese valor × el suelo de abajo. Además, nunca muestra más que su confianza del informe + la subida máxima: la cifra no exagera lo que el usuario leyó en la predicción. La confianza combinada es el producto de esas patas. El ajuste del LLM de la combinada deja de entrar en el número (queda guardado en la pata solo para auditar) y el prompt le pide marcar el riesgo en el razonamiento en vez de restar puntos. Caso real: la premium del 2026-09-15 mostró 26 con una cuota que implicaba 38.6; con esto sale 35. Apagado = la fórmula de siempre. No reescribe combinadas ya emitidas."
        >
          <Toggle value={form.combinadasPriceAnchoredConfidence ?? false} onChange={(v) => setField('combinadasPriceAnchoredConfidence', v)} />
        </Field>
        <Field
          label="Suelo de la confianza (× implícita)"
          subtitle="0.50–1 · def. 0.88"
          info="Una pata nunca queda por debajo de 100/cuota × este valor, por mal que vaya su selección. 0.88 = como mucho un 12 % por debajo del precio. Si choca con la subida máxima, gana la subida máxima. Sin muestra de la selección se usa un A/E de 0.95, el global medido. Solo actúa con la confianza anclada encendida."
        >
          <NumInput min={0.5} max={1} step={0.01} value={form.combinadasConfidenceMinPriceRatio ?? 0.88} onChange={(v) => setField('combinadasConfidenceMinPriceRatio', v)} />
        </Field>
        <Field
          label="Subida máxima sobre el informe (pts)"
          subtitle="0–20 · def. 8"
          info="Una pata nunca muestra más que su confianza del informe + este valor. Con 8 solo muerde en los picks muy prudentes: una pata con 40 en el informe a cuota 1.55 (implícita 64.5) muestra 48, no 57. 0 = nunca por encima del informe. Solo actúa con la confianza anclada encendida."
        >
          <NumInput min={0} max={20} step={1} value={form.combinadasConfidenceMaxRisePts ?? 8} onChange={(v) => setField('combinadasConfidenceMaxRisePts', Math.round(v))} />
        </Field>

        <SubHeading>Conteo adaptativo</SubHeading>
        <Field
          label="Conteo adaptativo"
          subtitle="def. apagado"
          info="El número de combinadas deja de ser un objetivo fijo (los «Count» de arriba) y sale del pool elegible de cada ventana: partidos distintos disponibles × usos por partido ÷ patas mínimas, acotado entre el mínimo y el máximo de abajo, por tier y por scope. Corrige el acantilado medido en 22 días: seis sin ninguna combinada y días flacos con 0 regular + 1 premium, porque el modo calidad premium se saltaba el techo del pool mientras la regular lo respetaba; con esto el techo aplica a las dos. Apagado, mandan los «Count» de siempre: el rollback es este switch. Si el mínimo supera al máximo, el guardado se rechaza (y en el motor ganaría el máximo con aviso en el log, nunca un cero silencioso). Si el pool corto vuelve, sube el máximo; no bajes el mínimo, que es el que evita el acantilado. Cada combinada es una llamada al LLM: mide el gasto en Consumo antes y después."
        >
          <Toggle value={form.combinadasAdaptiveCounts ?? false} onChange={(v) => setField('combinadasAdaptiveCounts', v)} />
        </Field>
        <Field
          label="Regular diaria min/max"
          subtitle="def. 0 a 2"
          info="Rango del conteo adaptativo de la regular diaria (0-10). Un mínimo 0 permite emitir cero en un día flaco en vez de raspar el fondo del pool."
        >
          <MinMaxPair
            lo={0}
            hi={10}
            min={form.combinadasMinRegular ?? 0}
            max={form.combinadasMaxRegular ?? 2}
            onMin={(v) => setField('combinadasMinRegular', v)}
            onMax={(v) => setField('combinadasMaxRegular', v)}
          />
        </Field>
        <Field
          label="Premium diaria min/max"
          subtitle="def. 0 a 2"
          info="Rango del conteo adaptativo de la premium diaria (0-10). Con 3-4 premium por ventana, las combinaciones siguientes serán peores que la primera (el selector ya se llevó la de mayor probabilidad): vigila la liquidación por tier semana a semana y baja el máximo si el acierto cae."
        >
          <MinMaxPair
            lo={0}
            hi={10}
            min={form.combinadasMinPremium ?? 0}
            max={form.combinadasMaxPremium ?? 2}
            onMin={(v) => setField('combinadasMinPremium', v)}
            onMax={(v) => setField('combinadasMaxPremium', v)}
          />
        </Field>

        <SubHeading>Combinada del día</SubHeading>
        <Field
          label="Una combinada nueva cada día"
          subtitle="def. apagado"
          info="Una combinada nueva cada día dentro de la ventana semanal, armada con la predicción oficial que ya existe (no se regenera nada), la cuota más reciente disponible y las alineaciones confirmadas como FILTRO de patas. Es la palanca de retención: una razón de abrir la app hoy. El aviso push sale una vez al día (dedupe por día) y el candado se suelta si el envío falla; un aviso al día es el límite que la gente tolera antes de silenciar la app. Con el flag apagado la diaria sigue como hoy, a la hora UTC de arriba."
        >
          <Toggle value={form.combinadasDailyRelease ?? false} onChange={(v) => setField('combinadasDailyRelease', v)} />
        </Field>
        <Field
          label="Hora (Caracas)"
          subtitle="0–19 · def. 10"
          info="Hora de Caracas (0-19) a la que se arma la combinada del día cuando el flag está encendido. El tope es 19 porque el día de la corrida se cierra a las 20:00 de Caracas (medianoche UTC): una hora mayor abriría la puerta en un día que ya cambió, y el backend rechaza valores por encima de 19. Moverla a después de las alineaciones cambia la hora a la que llega el push, que ya es un hábito: decídelo aparte y mira primero la consulta de partidos repetidos."
        >
          <Input type="number" min={0} max={19} className="w-24" value={form.combinadasDailyHourCaracas ?? 10} onChange={(e) => setField('combinadasDailyHourCaracas', clamp(Number(e.target.value) || 0, 0, 19))} />
        </Field>
        <Field
          label="Evitar partidos ya usados en la ventana"
          subtitle="def. apagado"
          info="El pool del día excluye los partidos que la ventana semanal en curso (la del día de corte) ya usó en otros días del mismo scope, para que la combinada de hoy traiga partidos nuevos. Repetir un partido en otro día no cuenta como combinada duplicada: solo consume su tope de uso por partido. Si la lectura falla, no excluye nada y la corrida sigue (fallo abierto, con aviso en el log). Nace apagado para que el deploy no cambie el pool sin que lo decidas. El rollout del plan es encender ESTE switch primero, una semana, y mirar la consulta de partidos repetidos antes de encender «Una combinada nueva cada día»."
        >
          <Toggle value={form.combinadasDailyAvoidWindowReuse ?? false} onChange={(v) => setField('combinadasDailyAvoidWindowReuse', v)} />
        </Field>

        <SubHeading>Rango de patas y anti-solapamiento</SubHeading>
        <Field label="Patas min/max (regular)" subtitle="Dentro del tope global de arriba">
          <div className="flex items-center gap-2">
            <Input type="number" min={2} max={8} className="w-20" value={form.combinadasRegularMinLegs ?? 2} onChange={(e) => setField('combinadasRegularMinLegs', Number(e.target.value))} />
            <span className="text-xs text-text-muted">a</span>
            <Input type="number" min={2} max={8} className="w-20" value={form.combinadasRegularMaxLegs ?? 3} onChange={(e) => setField('combinadasRegularMaxLegs', Number(e.target.value))} />
          </div>
        </Field>
        <Field label="Patas min/max (premium)" subtitle="Dentro del tope global de arriba">
          <div className="flex items-center gap-2">
            <Input type="number" min={2} max={8} className="w-20" value={form.combinadasPremiumMinLegs ?? 2} onChange={(e) => setField('combinadasPremiumMinLegs', Number(e.target.value))} />
            <span className="text-xs text-text-muted">a</span>
            <Input type="number" min={2} max={8} className="w-20" value={form.combinadasPremiumMaxLegs ?? 4} onChange={(e) => setField('combinadasPremiumMaxLegs', Number(e.target.value))} />
          </div>
        </Field>
        <Field
          label="Max. premium por partido"
          subtitle="def. 1"
          info="En cuantas combinadas premium distintas puede aparecer un mismo partido. Evita que todas las premium del dia giren alrededor del mismo partido ancla. Es un limite blando: el builder lo relaja a valor+1 si respetarlo dejaria el dia en cero combinadas premium, y lo anota en las notas del job. En modo maxima probabilidad NO se relaja: repetir un partido entre dos premium ata sus resultados."
        >
          <Input type="number" min={1} max={5} className="w-24" value={form.combinadasMaxPremiumPerMatch ?? 1} onChange={(e) => setField('combinadasMaxPremiumPerMatch', Number(e.target.value))} />
        </Field>
        <Field
          label="Max. regular por partido"
          subtitle="def. 1 · 0 = sin tope"
          info="En cuantas combinadas regular distintas puede aparecer un mismo partido. Hasta ahora el tier regular NO tenia tope y ese era el agujero: el 2026-09-07 seis combinadas salieron de siete picks distintos y un solo pick fallido (Cagliari over 1.5, presente en cinco de las seis) las mato todas a la vez. El conteo cubre la semana entera y cruza los dos productos, asi que la combinada semanal ya no puede volver a anclarse en un partido que la diaria uso esos dias (y al reves). Cada tier cuenta el suyo: una pata premium no recorta el pool regular. Ojo: con el tope activo el numero de combinadas queda limitado por los partidos distintos disponibles, asi que en dias flacos se generan menos, a proposito. Con 2, las dos patas del mismo partido tienen que ser de FAMILIAS de mercado distintas (goles / resultado / tarjetas / corners / jugador): es una regla dura que no se relaja, para que 'mas de 2.5 goles' y 'ambos marcan' del mismo partido no se presenten como diversificacion. Es lo que le da pool a la ventana de lunes a jueves (4 partidos y 2 patas: techo 2 con un uso, 4 con dos). Sube a 2 solo despues de desplegar esa regla."
        >
          <Input type="number" min={0} max={5} className="w-24" value={form.combinadasMaxRegularPerMatch ?? 1} onChange={(e) => setField('combinadasMaxRegularPerMatch', Number(e.target.value))} />
        </Field>

        <SubHeading>Diversidad de mercado</SubHeading>
        <Field
          label="Familias de mercado distintas"
          subtitle="def. activado"
          info="Cada partido aporta al pool picks de familias distintas (goles / resultado / tarjetas / corners / jugador), no solo de mercados distintos. Sin esto, el pool se queda con los 3 picks de mayor confianza de cada partido — y como la confianza esta anclada al mercado (tiende a 1/cuota), ordenar por confianza es ordenar por cuota corta. Medido en 14 dias: 321 picks de btts pasaban todos los filtros y se usaron CERO; corners 219 y cero; asian_handicap 118 y cero. No los excluia ningun criterio de calidad, perdian el empate contra total_goals (confianza media 71) y double_chance (72). Esto ordena, no filtra: si un dia solo hay una familia disponible, el pool no se queda corto."
        >
          <Toggle value={form.combinadasMarketFamilyDiversity ?? true} onChange={(v) => setField('combinadasMarketFamilyDiversity', v)} />
        </Field>
        <Field
          label="Max. patas de la misma familia"
          subtitle="def. 2 · 0 = sin tope"
          info="Tope de patas del mismo eje DENTRO de una combinada. Tres 'mas de 1.5 goles' en tres partidos distintos parecen tres apuestas pero comparten el factor comun de la jornada (partidos cerrados, arbitraje, clima): no diversifican. Medido: 17 de las 28 patas premium eran del eje de goles. Los mercados hibridos (resultado + total, win to nil) cuentan como goles a proposito, para que el tope no se pueda esquivar."
        >
          <Input type="number" min={0} max={8} className="w-24" value={form.combinadasMaxLegsSameFamily ?? 2} onChange={(e) => setField('combinadasMaxLegsSameFamily', Number(e.target.value))} />
        </Field>
        <Field
          label="Cuota que exime del piso de calibracion"
          subtitle="0 = apagado · sugerido 1.80"
          info="Un pick con cuota igual o mayor que esta se salta el filtro de calibracion. Ese filtro puntua confianza/100 x winrates historicos contra un piso de 0,45, asi que castiga exactamente a la confianza baja — y la confianza baja es lo que producen las cuotas largas: un pick a confianza 50 con winrate 0,85 da 0,425 y muere, aunque su cuota este bien pagada. Ya existe una exencion para los picks respaldados por el modelo de valor, pero es letra muerta mientras el modelo independiente este apagado. Empieza bajo y mide: sin muestras historicas de estos mercados en combinadas, subirlo mucho es cambiar un sesgo por otro."
        >
          <Input type="number" min={0} max={10} step={0.05} className="w-24" value={form.combinadasCalibrationOddsExempt ?? 0} onChange={(e) => setField('combinadasCalibrationOddsExempt', Number(e.target.value))} />
        </Field>

        <SubHeading>Calibración por selección</SubHeading>
        <Field
          label="A/E mínimo por selección"
          subtitle="def. 0.90 · 0 = apagado"
          info="Saca del pool, en las DOS tiers, las selecciones (mercado + lado + línea, p. ej. 'total_goals under 3.5') que en los últimos 90 días acertaron menos de lo que pagaba su cuota. A/E = aciertos reales / aciertos esperados por la cuota; a precio justo ronda 0.95 porque el margen de la casa va dentro. La calibración de siempre agrupa por mercado entero y promedia lados opuestos: 'under 3.5' acertaba 54 % con la cuota exigiendo 68 % mientras 'over 2.5' iba al 84 %, y juntos parecían sanos. Es un filtro de exclusión, no de valor: en el backtest, las selecciones con A/E previo bajo 0.90 siguieron perdiendo (0.88 fuera de muestra), pero las que 'iban bien' volvieron al precio."
        >
          <Input type="number" min={0} max={1.5} step={0.01} className="w-24" value={form.combinadasSelectionMinAe ?? 0.9} onChange={(e) => setField('combinadasSelectionMinAe', Number(e.target.value))} />
        </Field>
        <Field
          label="Muestra mínima por selección"
          subtitle="def. 30 picks"
          info="Picks liquidados que necesita una selección en la ventana de 90 días para que el filtro de arriba la juzgue. Por debajo, no se excluye nada: la falta de historia no es evidencia de que pierda."
        >
          <Input type="number" min={5} max={2000} className="w-24" value={form.combinadasSelectionMinSample ?? 30} onChange={(e) => setField('combinadasSelectionMinSample', Number(e.target.value))} />
        </Field>

        <SubHeading>Coherencia con la forma goleadora</SubHeading>
        <Field
          label="Filtrar patas de goles contra la forma"
          subtitle="def. activado"
          info="Saca del pool, en las DOS tiers, la pata de goles totales que va contra la forma goleadora de los dos equipos: 'más de' cuando los equipos marcan poco y 'menos de' cuando marcan mucho. La forma es la media de goles por partido de cada equipo en sus últimos 10 partidos oficiales (sin amistosos), promediada entre los dos; si a alguno le faltan 5 partidos, esa pata no se juzga. Medido sobre las predicciones oficiales: 'más de 2.5' con forma por debajo de 2.8 acierta un 12-20 % menos de lo que paga, y 'menos de 3.5' con forma de 2.8 o más, un 20-30 % menos. Es un filtro de exclusión: no premia rachas, quita contradicciones."
        >
          <Toggle value={form.combinadasGoalFormFilter ?? true} onChange={(v) => setField('combinadasGoalFormFilter', v)} />
        </Field>
        <Field
          label="Umbral de forma (goles por partido)"
          subtitle="def. 2.80"
          info="Media de goles por partido de los dos equipos a partir de la cual se considera que el cruce es goleador. Por debajo, fuera los 'más de'; en o por encima, fuera los 'menos de'. 2.80 es el corte con el que se midió el efecto."
        >
          <Input type="number" min={0.5} max={8} step={0.05} className="w-24" value={form.combinadasGoalFormThreshold ?? 2.8} onChange={(e) => setField('combinadasGoalFormThreshold', Number(e.target.value))} />
        </Field>

        <SubHeading>Track record en la app</SubHeading>
        <Field
          label="Liquidadas mínimas para mostrarlo"
          subtitle="def. 30 · 0 = siempre"
          info="La app solo muestra el acierto y el retorno de una tier (regular / premium, diaria / semanal) cuando reúne al menos estas combinadas liquidadas en la ventana. Se aplica igual a las dos tiers y sin mirar si el número es bueno o malo. Con 12 muestras, un 17 % es compatible con un acierto real de entre 5 % y 45 %: no informa, asusta. Este panel sigue viéndolo todo."
        >
          <Input type="number" min={0} max={1000} className="w-24" value={form.trackRecordPublicMinSettled ?? 30} onChange={(e) => setField('trackRecordPublicMinSettled', Number(e.target.value))} />
        </Field>

        <Field label="Equipos excluidos (premium)" subtitle="Salta cualquier combinada premium con estos equipos">
          <TeamBlacklistPicker value={form.combinadasPremiumExcludedTeams ?? []} onChange={(v) => setField('combinadasPremiumExcludedTeams', v)} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Combinadas temáticas"
        subtitle="Otra ventana de cuota sobre la misma maquinaria, sin competir por las patas de la del día"
        info="Una combinada temática es la misma selección de máxima probabilidad de la premium con otra ventana de cuota y patas fijas, y se guarda con su tema. Cada día se arma PRIMERO la Segura premium, con la combinación de mayor probabilidad de la ventana, y DESPUÉS la gratis, con lo que queda y sin repetir ningún partido de la premium. Si el pool solo alcanza para una, se la queda la premium y el job lo anota como «premium_took_pool». Por defecto las temáticas se arman DESPUÉS de las del día y no usan sus partidos; con «Armar la Segura antes que las del día» se arman ANTES, compiten por el pool completo y son las del día las que no pueden usar sus partidos. La semanal sigue con UNA sola Segura: la gratis si su conteo es mayor que 0 y, si no, la premium. El teaser de Telegram sigue publicando la del día, no la temática."
      >
        <SubHeading>Tema Segura</SubHeading>
        <Field
          label="Tema Segura"
          subtitle="def. apagado"
          info="Arma cada día una combinada de pocas patas con cuota combinada corta (la ventana de abajo), eligiendo la combinación de MAYOR probabilidad con la misma maquinaria que la premium de máxima probabilidad. NO es una garantía de acierto y la app no puede presentarla como tal: con cuota 1.5-1.8 el objetivo realista ronda el 60 %, y con 2-3 unidades por semana no se puede concluir nada antes de tres semanas. El track record público sigue oculto bajo el mínimo de liquidadas de «Track record en la app», que es lo correcto. Con el pool corto no sale nada en vez de salirse de la ventana."
        >
          <Toggle value={form.combinadasThemeSafeEnabled ?? false} onChange={(v) => setField('combinadasThemeSafeEnabled', v)} />
        </Field>
        <Field
          label="Segura premium por día"
          subtitle="0–2 · def. 0"
          info="Seguras para suscriptores que salen cada día. Se arman ANTES que las gratis, así que se llevan la combinación de mayor probabilidad de la ventana. Cuenta en el track record premium y en el de la Segura premium. 0 = sin Segura premium."
        >
          <NumInput min={0} max={2} step={1} value={form.combinadasThemeSafeCountPremium ?? 0} onChange={(v) => setField('combinadasThemeSafeCountPremium', clamp(Math.round(v), 0, 2))} />
        </Field>
        <Field
          label="Segura gratis por día"
          subtitle="0–2 · def. 1"
          info="Seguras gratis que salen cada día, armadas con el pool que dejan las premium y sin repetir sus partidos. Un día flaco puede quedarse sin gratis porque la premium se llevó la única combinación: vigílalo en las notas del job («premium_took_pool»). Si pasa más de un 30 % de los días, baja la premium a 0. 0 = sin Segura gratis."
        >
          <NumInput min={0} max={2} step={1} value={form.combinadasThemeSafeCountRegular ?? 1} onChange={(v) => setField('combinadasThemeSafeCountRegular', clamp(Math.round(v), 0, 2))} />
        </Field>
        <Field
          label="Armar la Segura antes que las del día"
          subtitle="def. apagado"
          info="Encendido, las Seguras se arman ANTES que la regular y la premium del día: compiten por el pool completo y las del día salen sin sus partidos (un pool más flaco para ellas). Apagado, las Seguras se arman DESPUÉS y no usan los partidos de las del día. Solo afecta a la diaria: la semanal siempre arma su Segura después de las suyas."
        >
          <Toggle value={form.combinadasThemeSafeFirst ?? false} onChange={(v) => setField('combinadasThemeSafeFirst', v)} />
        </Field>
        <Field
          label="Cuota combinada min/max"
          subtitle="def. 1.50 a 1.80"
          info="Ventana de cuota combinada del tema (1.1-5). La Segura elige la combinación de mayor probabilidad cuya cuota combinada cae dentro. Un mínimo por encima del máximo no se guarda."
        >
          <MinMaxPair
            lo={1.1}
            hi={5}
            step={0.05}
            min={form.combinadasThemeSafeMinOdds ?? 1.5}
            max={form.combinadasThemeSafeMaxOdds ?? 1.8}
            onMin={(v) => setField('combinadasThemeSafeMinOdds', v)}
            onMax={(v) => setField('combinadasThemeSafeMaxOdds', v)}
          />
        </Field>
        <Field
          label="Patas"
          subtitle="2–3 · def. 2"
          info="Número FIJO de patas del tema (2 o 3). Dos patas a cuota 1.5-1.8 es el diseño medido; con tres la cuota se estira y la probabilidad baja."
        >
          <Input type="number" min={2} max={3} className="w-24" value={form.combinadasThemeSafeLegs ?? 2} onChange={(e) => setField('combinadasThemeSafeLegs', clamp(Number(e.target.value) || 2, 2, 3))} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Combinada semanal"
        subtitle="Producto aparte de la diaria, con winrate propio"
        info="Una combinada de 3-6 patas escogidas entre los mejores partidos de la ventana semanal (horario de Caracas): una gratis y una premium. La semana se parte en dos ventanas por el dia de corte (por defecto lunes-jueves y viernes-domingo), y el estudio y la construccion corren una vez al inicio de cada ventana; con la prediccion oficial unica, estudiar la semana entera el lunes dejaba el fin de semana con 4-6 dias de antelacion. Se mide en un winrate separado del de las diarias, porque tiene mas patas y muchisima menos muestra. Son DOS corridas: el estudio enriquece los partidos de la ventana y la construccion arma la combinada con ese pool. Las patas quedan congeladas al generarse: aunque despues mejore la prediccion de un partido, la combinada publicada no se regenera."
      >
        <Field
          label="Dia de corte"
          subtitle="def. Viernes"
          info="Parte la semana de Caracas en dos ventanas: de lunes al dia anterior al corte, y del corte al domingo. El estudio y la construccion corren el dia configurado abajo (primera ventana) Y el dia de corte (segunda ventana), cada uno solo sobre los partidos de su ventana, con la misma hora. La app muestra la combinada de la ventana en curso y el push dice que dias cubre. 'Sin corte' vuelve a una sola ventana de lunes a domingo. El cupo semanal de puntos de las quinielas no cambia: las dos ventanas comparten la semana ISO. Cambialo ENTRE semanas (domingo), no a mitad de semana: las claves de idempotencia y del push se anclan al inicio de la ventana vigente, y mover el corte con la semana en marcha puede generar otra combinada y mandar otro aviso a todos los usuarios."
        >
          <Select
            className="w-56"
            value={String(form.weeklySplitDayOfWeek ?? 5)}
            onChange={(e) => {
              const split = Number(e.target.value);
              setField('weeklySplitDayOfWeek', split);
              // Si el dia de alguna corrida deja de caber en la primera ventana,
              // vuelve al lunes: el backend rechazaria el guardado igual.
              if (!isValidFirstRunDay(form.weeklyStudyDayOfWeek ?? 1, split)) setField('weeklyStudyDayOfWeek', 1);
              if (!isValidFirstRunDay(form.weeklyCombinadasDayOfWeek ?? 1, split)) setField('weeklyCombinadasDayOfWeek', 1);
            }}
          >
            {SPLIT_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>

        <SubHeading>Estudio de la ventana</SubHeading>
        <Field
          label="Enabled"
          subtitle="Enriquece todos los partidos de la ventana"
          info="Sin este pase, la combinada semanal solo podria elegir entre los partidos ya enriquecidos (los de hoy), que es justo lo que hace la diaria. Sube el horizonte de alineaciones probables en la pestana Automations si quieres que alcance al final de la ventana."
        >
          <Toggle value={form.weeklyStudyEnabled ?? false} onChange={(v) => setField('weeklyStudyEnabled', v)} />
        </Field>
        <Field label="Dia" subtitle="Primera corrida (Caracas); la segunda es el dia de corte" info="Con corte solo se ofrecen los dias de la primera ventana (de lunes al dia anterior al corte): un dia posterior haria que las dos corridas cayeran en la segunda ventana y la primera se quedara sin estudiar.">
          <Select className="w-40" value={String(form.weeklyStudyDayOfWeek ?? 1)} onChange={(e) => setField('weeklyStudyDayOfWeek', Number(e.target.value))}>
            {firstRunDays(form.weeklySplitDayOfWeek ?? 5).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field
          label="Hora (Caracas)"
          subtitle="0-23 - def. 2"
          info="El dia y la hora se interpretan en horario de Caracas, la misma zona en la que se definen las ventanas. La misma hora vale para las dos corridas. Debe ir por delante de la hora de construccion para que el builder encuentre predicciones ya generadas."
        >
          <Input type="number" min={0} max={23} className="w-24" value={form.weeklyStudyHourCaracas ?? 2} onChange={(e) => setField('weeklyStudyHourCaracas', Number(e.target.value))} />
        </Field>

        <SubHeading>Construccion</SubHeading>
        <Field label="Enabled" subtitle="Genera la combinada de cada ventana">
          <Toggle value={form.weeklyCombinadasEnabled ?? false} onChange={(v) => setField('weeklyCombinadasEnabled', v)} />
        </Field>
        <Field label="Dia" subtitle="Primera corrida (Caracas); la segunda es el dia de corte" info="Mismo criterio que el dia del estudio: con corte, solo los dias de la primera ventana.">
          <Select className="w-40" value={String(form.weeklyCombinadasDayOfWeek ?? 1)} onChange={(e) => setField('weeklyCombinadasDayOfWeek', Number(e.target.value))}>
            {firstRunDays(form.weeklySplitDayOfWeek ?? 5).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Hora (Caracas)" subtitle="0-23 - def. 6" info="En horario de Caracas, igual que el estudio.">
          <Input type="number" min={0} max={23} className="w-24" value={form.weeklyCombinadasHourCaracas ?? 6} onChange={(e) => setField('weeklyCombinadasHourCaracas', Number(e.target.value))} />
        </Field>
        <Field label="Patas min/max" subtitle="def. 3 a 6">
          <div className="flex items-center gap-2">
            <Input type="number" min={2} max={8} className="w-20" value={form.weeklyCombinadasMinLegs ?? 3} onChange={(e) => setField('weeklyCombinadasMinLegs', Number(e.target.value))} />
            <span className="text-xs text-text-muted">a</span>
            <Input type="number" min={2} max={8} className="w-20" value={form.weeklyCombinadasMaxLegs ?? 6} onChange={(e) => setField('weeklyCombinadasMaxLegs', Number(e.target.value))} />
          </div>
        </Field>
        <Field label="Cuantas generar" subtitle="Gratis / premium - def. 1 y 1">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={5} className="w-20" value={form.weeklyCombinadasCountRegular ?? 1} onChange={(e) => setField('weeklyCombinadasCountRegular', Number(e.target.value))} />
            <span className="text-xs text-text-muted">/</span>
            <Input type="number" min={0} max={5} className="w-20" value={form.weeklyCombinadasCountPremium ?? 1} onChange={(e) => setField('weeklyCombinadasCountPremium', Number(e.target.value))} />
          </div>
        </Field>
        <Field
          label="Regular semanal min/max"
          subtitle="def. 1 a 4"
          info="Rango del conteo adaptativo de la regular semanal (0-8), por ventana. Solo actúa con «Conteo adaptativo» (card Combinadas) encendido; si no, manda «Cuantas generar». Con el fin de semana lleno (45-60 partidos con predicción) el pool da para 3-4 por tier; la ventana de lunes a jueves casi nunca pasa de 1. Enciéndelo dejando 1 a 1 la primera semana y sube después."
        >
          <MinMaxPair
            lo={0}
            hi={8}
            min={form.weeklyCombinadasMinRegular ?? 1}
            max={form.weeklyCombinadasMaxRegular ?? 4}
            onMin={(v) => setField('weeklyCombinadasMinRegular', v)}
            onMax={(v) => setField('weeklyCombinadasMaxRegular', v)}
          />
        </Field>
        <Field
          label="Premium semanal min/max"
          subtitle="def. 1 a 4"
          info="Rango del conteo adaptativo de la premium semanal (0-8), por ventana. Mismo criterio que la regular; con varias premium por ventana las siguientes combinaciones son peores que la primera, así que vigila la liquidación de la semanal antes de subir el máximo. El «Minimo de predicciones V1» sigue siendo la puerta de entrada de la ventana."
        >
          <MinMaxPair
            lo={0}
            hi={8}
            min={form.weeklyCombinadasMinPremium ?? 1}
            max={form.weeklyCombinadasMaxPremium ?? 4}
            onMin={(v) => setField('weeklyCombinadasMinPremium', v)}
            onMax={(v) => setField('weeklyCombinadasMaxPremium', v)}
          />
        </Field>
        <Field
          label="Minimo de predicciones V1"
          subtitle="def. 12"
          info="Cuantas predicciones de la ventana debe haber antes de construir. Sin este minimo, una corrida que se adelante al estudio armaria la combinada con los pocos partidos ya enriquecidos, que ademas serian todos del mismo dia. Si no se alcanza, se reintenta en el siguiente minuto. Ojo con la ventana de lunes a jueves en semanas sin Champions: solo tiene los partidos del lunes, y si no llega al minimo simplemente no sale combinada esa ventana (cuentan solo las ligas V1)."
        >
          <Input type="number" min={2} max={200} className="w-24" value={form.weeklyCombinadasMinV1 ?? 12} onChange={(e) => setField('weeklyCombinadasMinV1', Number(e.target.value))} />
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Button
            variant="secondary"
            loading={runWeeklyStudy.isPending}
            disabled={!form.weeklyStudyEnabled}
            onClick={() => runWeeklyStudy.mutate()}
          >
            Run study now
          </Button>
          <Button
            variant="danger"
            loading={runWeeklyBuild.isPending}
            disabled={!form.weeklyCombinadasEnabled}
            onClick={() => runWeeklyBuild.mutate()}
          >
            Build weekly now
          </Button>
          <span className="text-xs font-sans text-text-muted">
            Guarda los cambios antes de disparar: los botones leen la config ya
            persistida y trabajan sobre la ventana en curso. El estudio tarda (un
            scrape por partido); construye despues.
          </span>
        </div>
      </SectionCard>
    </div>
  );
}
