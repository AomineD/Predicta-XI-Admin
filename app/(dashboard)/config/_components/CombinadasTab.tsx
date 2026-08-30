'use client';

import { useMutation } from '@tanstack/react-query';
import { SectionCard, Field, SubHeading, Toggle } from '@/components/ui/form-controls';
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
            'Filtro de valor del pool premium. OJO con subirlo: mientras el modelo independiente esté apagado, ese “edge” se calcula como (confianza/100) × cuota − 1, y con la calibración activa (que solo BAJA la confianza) más el anclaje a la probabilidad de mercado, la confianza tiende a 1/cuota — así que la fórmula acaba midiendo el margen de la casa con signo negativo, no valor. Medido sobre 100 combinadas el 2026-08-27: edge medio de pata −7,7 % y 96 % negativos. Pedir +3 % vaciaba el pool y dejó CERO combinadas premium desde el 5 de julio. Ahora, si este filtro deja el pool vacío, el pool se rearma sin él (manteniendo la cuota mínima por pata) y queda anotado en las notas del job.'
          }
        >
          <Input type="number" min={0} max={50} step={0.5} className="w-24" value={form.combinadasPremiumMinEdgePct ?? 3} onChange={(e) => setField('combinadasPremiumMinEdgePct', Number(e.target.value))} />
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
          info="En cuantas combinadas premium distintas puede aparecer un mismo partido. Evita que todas las premium del dia giren alrededor del mismo partido ancla. Es un limite blando: el builder lo relaja a valor+1 si respetarlo dejaria el dia en cero combinadas premium, y lo anota en las notas del job."
        >
          <Input type="number" min={1} max={5} className="w-24" value={form.combinadasMaxPremiumPerMatch ?? 1} onChange={(e) => setField('combinadasMaxPremiumPerMatch', Number(e.target.value))} />
        </Field>
        <Field label="Equipos excluidos (premium)" subtitle="Salta cualquier combinada premium con estos equipos">
          <TeamBlacklistPicker value={form.combinadasPremiumExcludedTeams ?? []} onChange={(v) => setField('combinadasPremiumExcludedTeams', v)} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Combinada semanal"
        subtitle="Producto aparte de la diaria, con winrate propio"
        info="Una combinada de 3-6 patas escogidas entre los mejores partidos de toda la semana (lunes a domingo, horario de Caracas): una gratis y una premium. Se mide en un winrate separado del de las diarias, porque tiene mas patas y muchisima menos muestra (una por semana). Son DOS corridas: el estudio enriquece los partidos de la semana y la construccion arma la combinada con ese pool. Las patas quedan congeladas al generarse: aunque despues mejore la prediccion de un partido, la combinada publicada no se regenera."
      >
        <SubHeading>Estudio de la semana</SubHeading>
        <Field
          label="Enabled"
          subtitle="Enriquece todos los partidos de la semana"
          info="Sin este pase, la combinada semanal solo podria elegir entre los partidos ya enriquecidos (los de hoy), que es justo lo que hace la diaria. Sube el horizonte de alineaciones probables en la pestana Automations si quieres que alcance al fin de semana."
        >
          <Toggle value={form.weeklyStudyEnabled ?? false} onChange={(v) => setField('weeklyStudyEnabled', v)} />
        </Field>
        <Field label="Dia" subtitle="Dia (en Caracas) en que corre el estudio">
          <Select className="w-40" value={String(form.weeklyStudyDayOfWeek ?? 1)} onChange={(e) => setField('weeklyStudyDayOfWeek', Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field
          label="Hora (Caracas)"
          subtitle="0-23 - def. 2"
          info="El dia y la hora se interpretan en horario de Caracas, la misma zona en la que se define la semana (lunes a domingo). Debe ir por delante de la hora de construccion para que el builder encuentre predicciones ya generadas."
        >
          <Input type="number" min={0} max={23} className="w-24" value={form.weeklyStudyHourCaracas ?? 2} onChange={(e) => setField('weeklyStudyHourCaracas', Number(e.target.value))} />
        </Field>

        <SubHeading>Construccion</SubHeading>
        <Field label="Enabled" subtitle="Genera la combinada de la semana">
          <Toggle value={form.weeklyCombinadasEnabled ?? false} onChange={(v) => setField('weeklyCombinadasEnabled', v)} />
        </Field>
        <Field label="Dia" subtitle="Dia (en Caracas) en que se construye">
          <Select className="w-40" value={String(form.weeklyCombinadasDayOfWeek ?? 1)} onChange={(e) => setField('weeklyCombinadasDayOfWeek', Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
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
          label="Minimo de predicciones V1"
          subtitle="def. 12"
          info="Cuantas predicciones de la semana debe haber antes de construir. Sin este minimo, una corrida que se adelante al estudio armaria la combinada de la semana con los pocos partidos ya enriquecidos, que ademas serian todos del mismo dia. Si no se alcanza, se reintenta en el siguiente minuto."
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
            persistida. El estudio tarda (un scrape por partido); construye despues.
          </span>
        </div>
      </SectionCard>
    </div>
  );
}
