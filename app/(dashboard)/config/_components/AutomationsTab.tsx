'use client';

import { SectionCard, Field, SubHeading, Toggle } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { SportiumCard } from './SportiumCard';
import type { CompetitionLite, PredictionConfig, SetField } from './types';

export function AutomationsTab({
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
      <SectionCard title="Automations" subtitle="Scheduled tasks for predictions, match syncing, and result syncing">
        <SubHeading>Predictions</SubHeading>

        <Field label="Enabled" subtitle="When off, predictions must be triggered manually">
          <Toggle value={form.automationEnabled} onChange={(v) => setField('automationEnabled', v)} />
        </Field>

        <Field label="Batch size" subtitle="Maximum matches processed per scheduler run">
          <Input type="number" min={1} max={100} className="w-24" value={form.batchSize} onChange={(e) => setField('batchSize', Number(e.target.value))} />
        </Field>

        <Field label="Prediction window (min)" subtitle="Only predict matches kicking off within this many minutes. 0 = predict up to 72h ahead">
          <Input type="number" min={0} max={1440} className="w-24" value={form.predictionWindowMinutes} onChange={(e) => setField('predictionWindowMinutes', Number(e.target.value))} />
        </Field>

        <SubHeading>Match Sync</SubHeading>

        <Field label="Enabled" subtitle="Automatically sync upcoming matches from API-Football">
          <Toggle value={form.matchSyncEnabled} onChange={(v) => setField('matchSyncEnabled', v)} />
        </Field>

        <Field label="Interval (hours)" subtitle="How often to sync upcoming week matches">
          <Select className="w-24" value={form.matchSyncIntervalHours} onChange={(e) => setField('matchSyncIntervalHours', Number(e.target.value))}>
            {[6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </Select>
        </Field>

        <SubHeading>Result Queue</SubHeading>

        <Field label="Enabled" subtitle="Create and process result-check jobs for predicted matches">
          <Toggle value={form.resultSyncEnabled} onChange={(v) => setField('resultSyncEnabled', v)} />
        </Field>

        <Field label="Initial delay (minutes)" subtitle="First result check runs this long after kickoff when a prediction creates the queue job">
          <Input type="number" min={30} max={600} className="w-24" value={form.resultSyncInitialDelayMinutes} onChange={(e) => setField('resultSyncInitialDelayMinutes', Number(e.target.value))} />
        </Field>

        <Field label="Retry interval (minutes)" subtitle="If the match is not finished yet, retry the queue job after this delay">
          <Input type="number" min={1} max={30} className="w-24" value={form.resultSyncRetryIntervalMinutes} onChange={(e) => setField('resultSyncRetryIntervalMinutes', Number(e.target.value))} />
        </Field>

        <Field label="Max retry window (hours)" subtitle="Stop retrying after this many hours if the match still is not finished">
          <Input type="number" min={1} max={72} className="w-24" value={form.resultSyncMaxRetryHours} onChange={(e) => setField('resultSyncMaxRetryHours', Number(e.target.value))} />
        </Field>

        <SubHeading>Enrichment Queue</SubHeading>

        <Field label="Enabled" subtitle="Enqueue matches for enrichment when approaching kickoff">
          <Toggle value={form.enrichmentSyncEnabled} onChange={(v) => setField('enrichmentSyncEnabled', v)} />
        </Field>

        <Field label="Enrichment mode" subtitle="Early: enrich all today's matches at configured hour. Pre-match: enrich 60 min before kickoff. Both: early + pre-match (V1 + V2 predictions)">
          <Select className="w-56" value={form.enrichmentMode ?? 'pre_match'} onChange={(e) => setField('enrichmentMode', e.target.value)}>
            <option value="pre_match">Pre-match only</option>
            <option value="early">Early only</option>
            <option value="both">Both (early + pre-match)</option>
          </Select>
        </Field>

        {(form.enrichmentMode === 'early' || form.enrichmentMode === 'both') && (
          <Field label="Early enrichment hour (UTC)" subtitle="When to enrich all today's matches (0-23). Generates V1 predictions without lineups.">
            <Input type="number" min={0} max={23} className="w-24" value={form.earlyEnrichmentHourUtc ?? 7} onChange={(e) => setField('earlyEnrichmentHourUtc', Number(e.target.value))} />
          </Field>
        )}

        <Field label="Minutes before kickoff" subtitle="How early before kickoff to trigger enrichment">
          <Input type="number" min={15} max={180} className="w-24" value={form.enrichmentQueueMinutesBefore ?? 60} onChange={(e) => setField('enrichmentQueueMinutesBefore', Number(e.target.value))} />
        </Field>

        <Field label="Max retries" subtitle="How many times to retry if enrichment fails">
          <Input type="number" min={1} max={10} className="w-24" value={form.enrichmentQueueMaxRetries ?? 5} onChange={(e) => setField('enrichmentQueueMaxRetries', Number(e.target.value))} />
        </Field>

        <Field label="Retry interval (minutes)" subtitle="Wait time between retry attempts">
          <Input type="number" min={1} max={10} className="w-24" value={form.enrichmentQueueRetryMinutes ?? 2} onChange={(e) => setField('enrichmentQueueRetryMinutes', Number(e.target.value))} />
        </Field>

        <SubHeading>Post-match Refresh</SubHeading>

        <Field label="Enabled" subtitle="Re-sync team form, squad, and league standings after each settled match">
          <Toggle value={form.teamRefreshEnabled ?? false} onChange={(v) => setField('teamRefreshEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Quiniela IA — llaves de eliminatoria"
        subtitle="Genera las picks de eliminatorias de la quiniela de la IA ronda por ronda, de forma automática."
      >
        <Field label="Automatización de llaves (quiniela IA)" subtitle="Genera las picks de eliminatorias ronda por ronda automáticamente.">
          <Toggle value={form.quinielaKnockoutAutomationEnabled} onChange={(v) => setField('quinielaKnockoutAutomationEnabled', v)} />
        </Field>
        <Field label="Motor de generación de llaves" subtitle="Quién genera cada ronda: el routine de Claude (recomendado) o el modelo LLM configurado.">
          <Select className="w-44" value={form.quinielaKnockoutEngine} onChange={(e) => setField('quinielaKnockoutEngine', e.target.value as 'llm' | 'claude_routine')}>
            <option value="claude_routine">Routine de Claude</option>
            <option value="llm">LLM configurado</option>
          </Select>
        </Field>
      </SectionCard>

      <SportiumCard competitions={competitions} />
    </div>
  );
}
