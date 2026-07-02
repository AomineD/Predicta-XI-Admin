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
        subtitle="Kill-switch for the paid AI opinion on user-built parlays (queued to the worker). Off = the app hides the 'Pedir opinión' button and no opinion can be requested."
      >
        <Field label="Opinions enabled" subtitle="When off, users cannot request a Predicta opinion (stops all opinion LLM spend)">
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
        <Field label="Risk mode" subtitle="Precise = conservative picks, Bold = avoids ultra-safe odds (<1.30)">
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
        <Field label="Leagues (regular)" subtitle="Which leagues regular combinadas can cover. Empty = all V1 leagues.">
          <LeagueMultiSelect
            leagues={competitions}
            value={form.combinadasRegularLeagues ?? []}
            onChange={(v) => setField('combinadasRegularLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (regular)" subtitle="Reject regular combinadas whose product of odds exceeds this (1.5–20)">
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
        <Field label="Leagues (premium)" subtitle="Which leagues premium combinadas can cover. Empty = all V1 leagues.">
          <LeagueMultiSelect
            leagues={competitions}
            value={form.combinadasPremiumLeagues ?? []}
            onChange={(v) => setField('combinadasPremiumLeagues', v)}
            emptyLabel="All V1 leagues allowed"
          />
        </Field>
        <Field label="Max combined odds (premium)" subtitle="Reject premium combinadas whose product of odds exceeds this (1.5–20)">
          <Input type="number" min={1.5} max={20} step={0.1} className="w-24" value={form.combinadasPremiumMaxOdds ?? 6.0} onChange={(e) => setField('combinadasPremiumMaxOdds', Number(e.target.value))} />
        </Field>
      </SectionCard>
    </div>
  );
}
