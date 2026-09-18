'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { Input, Select, Textarea } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { MultiCheckbox } from './controls';
import type { CompetitionLite, OnexbetConfig } from './types';

/** Mercados que sabe leer el backend (`ONEXBET_MARKETS` en onexbet-odds-normalizer.ts). */
const ONEXBET_MARKET_OPTIONS = [
  'match_result',
  'double_chance',
  'over_under',
  'btts',
  'asian_handicap',
  'correct_score',
  'first_goal',
  'corners',
  'cards_over_under',
  'penalty',
  'red_card',
  'red_card_by_team',
  'team_total_goals',
  'team_goals_odd_even',
  'team_clean_sheet',
  'win_to_nil',
  'result_and_total',
  'double_chance_and_total',
  'btts_and_total',
  'result_and_btts',
  'anytime_scorer',
];

interface OnexbetConfigResponse {
  config: (Omit<OnexbetConfig, 'matchConfidenceMin'> & { matchConfidenceMin: string | number }) | null;
  envEnabled: boolean;
}

interface LeagueProposal {
  competitionId: number;
  competitionName: string;
  ligaId: number;
  onexbetName: string;
  confidence: number;
}

/**
 * Cuotas de respaldo de 1xBet (plan motor-sesgos, fase 9). Autocontenida: su propia
 * tabla `onexbet_config` con GET/PUT. Va justo después de la card de Sportium porque
 * cumple su mismo papel, solo donde Sportium y Flashscore no traen el mercado.
 */
export function OnexbetCard({ competitions }: { competitions: CompetitionLite[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isError } = useQuery<OnexbetConfigResponse>({
    queryKey: ['onexbet-config'],
    queryFn: () => api.get('/admin/onexbet/config'),
  });

  const [draft, setDraft] = useState<OnexbetConfig | null>(null);
  // Nombre de la liga de 1xBet de cada ligaId detectado, solo para enseñarlo junto a la fila.
  const [detectedNames, setDetectedNames] = useState<Record<number, string>>({});

  const initial = useMemo<OnexbetConfig | null>(() => {
    const c = data?.config;
    if (!c) return null;
    return {
      enabled: c.enabled ?? false,
      influencePredictions: c.influencePredictions ?? false,
      captureV1: c.captureV1 ?? true,
      captureV2: c.captureV2 ?? true,
      // La columna numeric llega como texto.
      matchConfidenceMin: Number(c.matchConfidenceMin ?? 0.9),
      baseUrls: Array.isArray(c.baseUrls) ? c.baseUrls : [],
      fcountry: c.fcountry ?? '91',
      leagueMap: Array.isArray(c.leagueMap) ? c.leagueMap : [],
      marketsEnabled: Array.isArray(c.marketsEnabled) ? c.marketsEnabled : [],
      requestDelayMs: c.requestDelayMs ?? 4000,
      maxRequestsPerHour: c.maxRequestsPerHour ?? 120,
      requestTimeoutMs: c.requestTimeoutMs ?? 15000,
    };
  }, [data]);
  const form = draft ?? initial;
  const set = (patch: Partial<OnexbetConfig>) => form && setDraft({ ...form, ...patch });

  const save = useMutation({
    mutationFn: (body: OnexbetConfig) =>
      api.put('/admin/onexbet/config', { ...body, baseUrls: body.baseUrls.map((u) => u.trim()).filter((u) => u !== '') }),
    onSuccess: () => {
      setDraft(null);
      toast.success('Cuotas de respaldo guardadas.');
      qc.invalidateQueries({ queryKey: ['onexbet-config'] });
      qc.invalidateQueries({ queryKey: ['onexbet-health'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const detect = useMutation({
    mutationFn: () => api.post('/admin/onexbet/detect-leagues', {}) as Promise<{ proposals: LeagueProposal[]; unmatched: string[] }>,
    onSuccess: (result) => {
      if (!form) return;
      const byCompetition = new Map(form.leagueMap.map((l) => [l.competitionId, { ...l }]));
      for (const p of result.proposals) byCompetition.set(p.competitionId, { competitionId: p.competitionId, ligaId: p.ligaId });
      setDraft({ ...form, leagueMap: [...byCompetition.values()] });
      setDetectedNames((prev) => ({ ...prev, ...Object.fromEntries(result.proposals.map((p) => [p.ligaId, p.onexbetName])) }));
      const missing = result.unmatched.length ? ` Sin liga en 1xBet (fuera de temporada o no ofrecida): ${result.unmatched.join(', ')}.` : '';
      toast.success(`${result.proposals.length} liga(s) detectada(s) y aplicadas abajo. Revisa y guarda.${missing}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * Lo que el backend rechazaría, dicho aquí y en claro antes de enviar. Antes, una fila
   * de liga sin id se descartaba al guardar y el panel decía "guardado".
   */
  const problems = (cfg: OnexbetConfig): string[] => {
    const out: string[] = [];
    const incomplete = cfg.leagueMap.filter((l) => !(l.competitionId > 0 && Number.isInteger(l.ligaId) && l.ligaId > 0)).length;
    if (incomplete > 0) out.push(`${incomplete} liga(s) sin id de 1xBet: complétalas o quítalas.`);
    const domains = cfg.baseUrls.map((u) => u.trim()).filter((u) => u !== '').length;
    if (domains < 1 || domains > 3) out.push('Pon entre 1 y 3 dominios.');
    if (!/^\d{1,4}$/.test(cfg.fcountry)) out.push('El código de país del feed es un número de 1 a 4 cifras.');
    return out;
  };

  const trySave = () => {
    if (!form) return;
    const found = problems(form);
    if (found.length > 0) {
      toast.error(found.join(' '));
      return;
    }
    save.mutate(form);
  };

  const setLeague = (i: number, patch: Partial<{ competitionId: number; ligaId: number }>) =>
    form && set({ leagueMap: form.leagueMap.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });

  return (
    <SectionCard
      title="Cuotas de respaldo (1xBet)"
      subtitle="Nace inerte"
      info="Lee las cuotas del feed público de 1xBet durante el enriquecimiento (V1/V2) y SOLO rellena los mercados que Sportium y Flashscore no traen: nunca pisa una cuota existente. Requiere también ONEXBET_ENABLED en Backend y Worker. El nombre de la casa nunca aparece en la app."
    >
      {isError ? (
        <p className="text-danger text-sm font-sans py-3">No se pudo leer la config de 1xBet. Recarga la página.</p>
      ) : !form ? (
        <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
      ) : (
        <>
          {data && !data.envEnabled && (
            <p className="text-xs font-sans text-warning pb-2">
              ONEXBET_ENABLED está apagado en este servidor: se puede configurar, pero no captura ni detecta ligas.
            </p>
          )}
          <Field label="Módulo activo" subtitle="def. apagado" info="Interruptor maestro. Apagado = no se pide nada al feed.">
            <Toggle value={form.enabled} onChange={(v) => set({ enabled: v })} />
          </Field>
          <Field
            label="Influir en predicciones"
            subtitle="def. apagado"
            info="Apagado: solo guarda snapshots para validar el casado y medir el margen frente a Sportium (2 semanas recomendadas). Encendido: las cuotas rellenan lo que falte en el contexto de predicción y dan cuota a esos picks."
          >
            <Toggle value={form.influencePredictions} onChange={(v) => set({ influencePredictions: v })} />
          </Field>
          <Field label="Capturar en V1" subtitle="Enriquecimiento temprano">
            <Toggle value={form.captureV1} onChange={(v) => set({ captureV1: v })} />
          </Field>
          <Field label="Capturar en V2" subtitle="Con alineaciones confirmadas">
            <Toggle value={form.captureV2} onChange={(v) => set({ captureV2: v })} />
          </Field>
          <Field
            label="Confianza mínima de casado"
            subtitle="0.80–1 · def. 0.90"
            info="Desde este valor el partido se enlaza solo; justo por debajo va a la cola de revisión. El kickoff tiene que cuadrar a 30 minutos. Por debajo de 0.80 se enlazaría cualquier partido con el mejor candidato de la liga."
          >
            <NumInput value={form.matchConfidenceMin} min={0.8} max={1} step={0.01} onChange={(v) => set({ matchConfidenceMin: Math.min(1, Math.max(0.8, v)) })} />
          </Field>
          <Field
            label="Dominios (espejos)"
            subtitle="1–3 · uno por línea · https"
            info="Se prueban en orden y se salta al siguiente si uno redirige, bloquea o se cae. Solo se aceptan dominios https de 1xBet sin puerto ni ruta, y el servidor nunca se conecta a una dirección interna."
          >
            <Textarea
              aria-label="Dominios de 1xBet, uno por línea"
              className="max-w-md font-mono"
              rows={2}
              value={form.baseUrls.join('\n')}
              onChange={(e) => set({ baseUrls: e.target.value.split('\n') })}
            />
          </Field>
          <Field label="Código de país del feed" subtitle="def. 91">
            <Input
              className="w-24"
              aria-label="Código de país del feed"
              value={form.fcountry}
              onChange={(e) => set({ fcountry: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              // Vacío no es un valor válido: al salir del campo vuelve al último guardado.
              onBlur={() => form.fcountry === '' && set({ fcountry: initial?.fcountry ?? '91' })}
            />
          </Field>
          <Field label="Pausa entre peticiones (ms)" subtitle="1000–60000 · def. 4000">
            <NumInput value={form.requestDelayMs} min={1000} max={60000} step={500} onChange={(v) => set({ requestDelayMs: v })} />
          </Field>
          <Field
            label="Máx. peticiones por hora"
            subtitle="1–2000 · def. 120"
            info="Tope único entre Backend y Worker (se cuenta en Redis), con los reintentos en otros dominios incluidos. Al llegar al tope se deja de pedir hasta que pase la hora; el partido sigue sin esas cuotas."
          >
            <NumInput value={form.maxRequestsPerHour} min={1} max={2000} onChange={(v) => set({ maxRequestsPerHour: v })} />
          </Field>
          <Field label="Timeout (ms)" subtitle="2000–30000 · def. 15000" info="Una petición, sumando los cambios de dominio, nunca pasa de 1,5 veces este valor.">
            <NumInput value={form.requestTimeoutMs} min={2000} max={30000} step={500} onChange={(v) => set({ requestTimeoutMs: v })} />
          </Field>
          <Field
            label="Mercados habilitados"
            info="Solo se captura y se rellena lo marcado. El goleador (anytime scorer) nace fuera: 1xBet da el nombre completo del jugador y el casado con las incidencias no está probado."
          >
            <MultiCheckbox options={ONEXBET_MARKET_OPTIONS} value={form.marketsEnabled} onChange={(v) => set({ marketsEnabled: v })} />
          </Field>
          <Field label="Ligas" subtitle="Vacío = no captura" info="Cada competición nuestra con su liga de 1xBet (id del feed). Detectar ligas lee el menú de 1xBet y propone sin guardar.">
            <div className="space-y-2 w-full">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" loading={detect.isPending} onClick={() => detect.mutate()}>
                  Detectar ligas
                </Button>
              </div>
              {form.leagueMap.length === 0 && (
                <p className="text-xs text-text-muted/60 font-sans">Sin ligas: el módulo no captura nada.</p>
              )}
              {form.leagueMap.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    className="w-44 flex-none"
                    aria-label={`Competición de la fila ${i + 1}`}
                    value={row.competitionId}
                    onChange={(e) => setLeague(i, { competitionId: Number(e.target.value) })}
                  >
                    {!competitions.some((c) => c.id === row.competitionId) && <option value={row.competitionId}>#{row.competitionId}</option>}
                    {competitions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    className="w-32"
                    value={row.ligaId || ''}
                    placeholder="id de liga"
                    aria-label={`Id de la liga de 1xBet de la fila ${i + 1}`}
                    onChange={(e) => setLeague(i, { ligaId: Number(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-text-muted font-sans flex-1 truncate">{detectedNames[row.ligaId] ?? ''}</span>
                  <button
                    type="button"
                    onClick={() => set({ leagueMap: form.leagueMap.filter((_, idx) => idx !== i) })}
                    className="text-text-muted hover:text-danger px-2 cursor-pointer"
                    aria-label="Quitar liga"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                disabled={competitions.length === 0}
                onClick={() => set({ leagueMap: [...form.leagueMap, { competitionId: competitions[0]?.id ?? 0, ligaId: 0 }] })}
              >
                Añadir liga
              </Button>
            </div>
          </Field>
          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={save.isPending} onClick={trySave}>
              Guardar 1xBet
            </Button>
            {form.enabled && !form.influencePredictions && (
              <span className="text-xs font-sans text-warning">Solo captura (aún no toca las predicciones).</span>
            )}
            {form.enabled && form.influencePredictions && (
              <span className="text-xs font-sans text-success">Activo y rellenando cuotas en las predicciones.</span>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
