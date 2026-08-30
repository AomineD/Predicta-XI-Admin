'use client';

import { SectionCard, Field, SubHeading, Toggle } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { SportiumCard } from './SportiumCard';
import { DataSourceCard } from './DataSourceCard';
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
      <SectionCard title="Automations" info="Scheduled tasks for predictions, match syncing, and result syncing.">
        <SubHeading>Predictions</SubHeading>

        <Field label="Enabled" subtitle="When off, predictions must be triggered manually">
          <Toggle value={form.automationEnabled} onChange={(v) => setField('automationEnabled', v)} />
        </Field>

        <Field label="Batch size" subtitle="Maximum matches processed per scheduler run">
          <Input type="number" min={1} max={100} className="w-24" value={form.batchSize} onChange={(e) => setField('batchSize', Number(e.target.value))} />
        </Field>

        <Field label="Prediction window (min)" subtitle="0 = hasta 72 h" info="Only predict matches kicking off within this many minutes.">
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

        <Field label="Initial delay (minutes)" info="First result check runs this long after kickoff when a prediction creates the queue job.">
          <Input type="number" min={30} max={600} className="w-24" value={form.resultSyncInitialDelayMinutes} onChange={(e) => setField('resultSyncInitialDelayMinutes', Number(e.target.value))} />
        </Field>

        <Field label="Retry interval (minutes)" info="If the match is not finished yet, retry the queue job after this delay.">
          <Input type="number" min={1} max={30} className="w-24" value={form.resultSyncRetryIntervalMinutes} onChange={(e) => setField('resultSyncRetryIntervalMinutes', Number(e.target.value))} />
        </Field>

        <Field label="Max retry window (hours)" info="Stop retrying after this many hours if the match still is not finished.">
          <Input type="number" min={1} max={72} className="w-24" value={form.resultSyncMaxRetryHours} onChange={(e) => setField('resultSyncMaxRetryHours', Number(e.target.value))} />
        </Field>

        <SubHeading>Enrichment Queue</SubHeading>

        <Field label="Enabled" subtitle="Enqueue matches for enrichment when approaching kickoff">
          <Toggle value={form.enrichmentSyncEnabled} onChange={(v) => setField('enrichmentSyncEnabled', v)} />
        </Field>

        <Field label="Enrichment mode" info="Early: enrich all today's matches at the configured hour. Pre-match: enrich 60 min before kickoff. Both: early + pre-match (V1 + V2 predictions).">
          <Select className="w-56" value={form.enrichmentMode ?? 'pre_match'} onChange={(e) => setField('enrichmentMode', e.target.value)}>
            <option value="pre_match">Pre-match only</option>
            <option value="early">Early only</option>
            <option value="both">Both (early + pre-match)</option>
          </Select>
        </Field>

        {(form.enrichmentMode === 'early' || form.enrichmentMode === 'both') && (
          <>
            <Field label="Early enrichment hour (UTC)" subtitle="0–23" info="Hora a partir de la cual corre el pase temprano. Genera predicciones V1 (sin alineación confirmada), que son las que alimentan las combinadas.">
              <Input type="number" min={0} max={23} className="w-24" value={form.earlyEnrichmentHourUtc ?? 7} onChange={(e) => setField('earlyEnrichmentHourUtc', Number(e.target.value))} />
            </Field>

            <Field
              label="Día que estudia"
              subtitle="Relativo a hoy, en horario de Caracas"
              info="Qué día enriquece el pase temprano. «Mañana» combinado con una hora temprana deja las predicciones del día siguiente listas antes de la noche del usuario LATAM, en vez de empezar a generarlas de madrugada. OJO: cuanto más lejos se estudie, menos casas tienen cuotas publicadas, y sin cuotas la predicción no se genera. Verifica la cobertura antes de mover esto a «pasado mañana»."
            >
              <Select className="w-48" value={String(form.earlyEnrichmentTargetDayOffset ?? 0)} onChange={(e) => setField('earlyEnrichmentTargetDayOffset', Number(e.target.value))}>
                <option value="0">Hoy</option>
                <option value="1">Mañana</option>
                <option value="2">Pasado mañana</option>
              </Select>
            </Field>
          </>
        )}

        <Field
          label="Horizonte de alineaciones probables (h)"
          subtitle="6–168 · def. 48"
          info="Cuántas horas antes del partido se intenta traer la alineación PROBABLE de Flashscore en la fase 2. Flashscore la publica días antes, pero no para todos los partidos: más allá de este tope el scrape sale en balde y cuesta una navegación por partido y por reintento. La combinada semanal necesita subirlo (mira hasta 7 días vista); 168 = una semana completa."
        >
          <Input type="number" min={6} max={168} className="w-24" value={form.earlyLineupsMaxHoursBeforeKickoff ?? 48} onChange={(e) => setField('earlyLineupsMaxHoursBeforeKickoff', Number(e.target.value))} />
        </Field>

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

        <Field label="Enabled" info="Re-sync team form, squad, and league standings after each settled match.">
          <Toggle value={form.teamRefreshEnabled ?? false} onChange={(v) => setField('teamRefreshEnabled', v)} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Quiniela IA — llaves de eliminatoria"
        info="Genera las picks de eliminatorias de la quiniela de la IA ronda por ronda, de forma automática."
      >
        <Field label="Automatización de llaves (quiniela IA)" info="Genera las picks de eliminatorias ronda por ronda automáticamente.">
          <Toggle value={form.quinielaKnockoutAutomationEnabled} onChange={(v) => setField('quinielaKnockoutAutomationEnabled', v)} />
        </Field>
        <Field label="Motor de generación de llaves" info="Quién genera cada ronda: el routine de Claude (recomendado) o el modelo LLM configurado.">
          <Select className="w-44" value={form.quinielaKnockoutEngine} onChange={(e) => setField('quinielaKnockoutEngine', e.target.value as 'llm' | 'claude_routine')}>
            <option value="claude_routine">Routine de Claude</option>
            <option value="llm">LLM configurado</option>
          </Select>
        </Field>
      </SectionCard>

      <SportiumCard competitions={competitions} />

      <DataSourceCard />
    </div>
  );
}
