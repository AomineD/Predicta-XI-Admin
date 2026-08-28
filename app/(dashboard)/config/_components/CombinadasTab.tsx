'use client';

import { SectionCard, Field, SubHeading, Toggle } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { LeagueMultiSelect, TeamBlacklistPicker } from './controls';
import type { CompetitionLite, PredictionConfig, SetField } from './types';

export function CombinadasTab({
  form,
  setField,
  competitions,
}: {
  form: PredictionConfig;
  setField: SetField;
  competitions: CompetitionLite[];
}) {
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
      </SectionCard>
    </div>
  );
}
