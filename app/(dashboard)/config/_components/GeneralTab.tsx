'use client';

import { SectionCard, Field } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { MultiCheckbox, PredictionEngineCard } from './controls';
import { MODELS, MODEL_DEFAULT_MAX_TOKENS, MARKETS, DATA_FIELDS, REASONING_OPTIONS } from './constants';
import type { PredictionConfig, SetField } from './types';

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

        <Field label="Reasoning effort" subtitle="Depth of reasoning for supported models (DeepSeek R1, GPT Think)">
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

        <Field label="LLM Timeout (seconds)" subtitle="Max wait time per LLM call (increase for reasoning models like DeepSeek R1)">
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
        subtitle="Per-model max output tokens. Leave blank to use the backend default. Raise when you see prediction_jobs failing with finishReason=length."
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

      <SectionCard title="Input Data Fields" subtitle="Data sources the model receives to generate predictions">
        <MultiCheckbox options={DATA_FIELDS} value={form.inputDataFields} onChange={(v) => setField('inputDataFields', v)} />
      </SectionCard>
    </div>
  );
}
