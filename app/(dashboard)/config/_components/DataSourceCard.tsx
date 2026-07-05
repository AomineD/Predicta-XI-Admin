'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import type { DataSourceConfig, EspnPreviewRow } from './types';

/**
 * Fuente de datos secundaria/fallback ESPN (idea #20) — autocontenida (su propia
 * tabla `data_source_config` con GET/PUT propios). Vive en la pestaña Automatizaciones
 * junto a Sportium. Incluye un preview de la resolución ESPN para validar el linking
 * ANTES de encender "Influir en predicciones" (el fallback solo se ejerce con ambos
 * flags ON y solo cuando Flashscore falla, así que hay que auditarlo antes).
 */
export function DataSourceCard() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: cfg } = useQuery<{ config: DataSourceConfig | null }>({
    queryKey: ['data-source-config'],
    queryFn: () => api.get('/admin/data-source/config'),
  });

  const [form, setForm] = useState<DataSourceConfig | null>(null);
  const initial = useMemo<DataSourceConfig | null>(() => {
    const c = cfg?.config;
    if (!c) return null;
    return {
      enabled: c.enabled ?? false,
      influencePredictions: c.influencePredictions ?? false,
      resultFallbackEnabled: c.resultFallbackEnabled ?? false,
      // la columna numeric llega como string desde la API
      matchConfidenceMin: Number(c.matchConfidenceMin ?? 0.82),
      downtimeErrorThreshold: c.downtimeErrorThreshold ?? 5,
      downtimeWindowMinutes: c.downtimeWindowMinutes ?? 10,
    };
  }, [cfg]);
  const ds = form ?? initial;

  const save = useMutation({
    mutationFn: (body: DataSourceConfig) =>
      api.put('/admin/data-source/config', {
        enabled: body.enabled,
        influencePredictions: body.influencePredictions,
        resultFallbackEnabled: body.resultFallbackEnabled,
        matchConfidenceMin: body.matchConfidenceMin,
        downtimeErrorThreshold: body.downtimeErrorThreshold,
        downtimeWindowMinutes: body.downtimeWindowMinutes,
      }),
    onSuccess: () => {
      setForm(null);
      toast.success('Fuente de datos guardada.');
      qc.invalidateQueries({ queryKey: ['data-source-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Preview bajo demanda (no auto-corre al abrir la config para no pegarle a ESPN
  // en cada carga). El botón dispara el refetch.
  const {
    data: previewData,
    refetch: refetchPreview,
    isFetching: previewLoading,
  } = useQuery<{ preview: EspnPreviewRow[] }>({
    queryKey: ['data-source-espn-preview'],
    queryFn: () => api.get('/admin/data-source/espn-preview'),
    enabled: false,
  });

  const columns: Column<EspnPreviewRow>[] = [
    {
      key: 'match',
      header: 'Partido',
      render: (r) => (
        <div>
          <div className="text-text-primary">{r.label}</div>
          <div className="text-xs text-text-muted/60">{r.competition ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'espn',
      header: 'Evento ESPN resuelto',
      render: (r) =>
        r.resolved && r.espnEvent ? (
          <span className="text-text-primary">
            {r.espnEvent.home} vs {r.espnEvent.away}
          </span>
        ) : (
          <span className="text-text-muted/60">—</span>
        ),
    },
    {
      key: 'confidence',
      header: 'Confianza',
      render: (r) => {
        if (!r.resolved || r.confidence === undefined) return <span className="text-text-muted/60">—</span>;
        const pct = Math.round(r.confidence * 100);
        const color = r.confidence >= 0.9 ? 'text-success' : 'text-warning';
        return <span className={`font-medium ${color}`}>{pct}%</span>;
      },
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      render: (r) => {
        if (!r.resolved) return <span className="text-text-muted/60">—</span>;
        const tag = (ok: boolean, label: string) => (
          <span className={ok ? 'text-success' : 'text-text-muted/40'}>{label}</span>
        );
        return (
          <span className="text-xs flex flex-wrap gap-x-2 gap-y-0.5">
            {tag(r.hasForm, 'Forma')}
            {tag(r.hasH2H, 'H2H')}
            {tag(r.statsCoverage !== 'none', `Stats${r.statsCoverage === 'full' ? '' : r.statsCoverage === 'partial' ? ' (parcial)' : ''}`)}
            {tag(r.hasStandings, 'Tabla')}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => {
        if (!r.supported) return <span className="text-warning text-xs">Sin cobertura ESPN</span>;
        if (r.resolved) return <span className="text-success text-xs">Resuelto</span>;
        return <span className="text-danger text-xs" title={r.error ?? ''}>No resuelto</span>;
      },
    },
  ];

  const rows = previewData?.preview ?? [];

  return (
    <SectionCard
      title="Fuente de datos secundaria (ESPN)"
      subtitle="Respaldo automático cuando Flashscore falla durante el enrichment (forma, H2H, stats y tabla). ESPN es keyless, sin Cloudflare, y cubre las 9 ligas V1 (incluida la Eredivisie). Nace inerte: solo actúa con el interruptor maestro encendido."
    >
      {!ds ? (
        <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
      ) : (
        <>
          <Field
            label="Fallback habilitado"
            subtitle="Interruptor maestro. Apagado = ESPN nunca se consulta. Encendido = el resolver puede caer a ESPN cuando Flashscore está caído."
          >
            <Toggle value={ds.enabled} onChange={(v) => setForm({ ...ds, enabled: v })} />
          </Field>
          <Field
            label="Influir en predicciones"
            subtitle="Valida el preview PRIMERO. Apagado: ESPN no inyecta nada (aunque el fallback esté habilitado). Encendido: el contexto ESPN entra al enrichment cuando Flashscore falla. Requiere el fallback habilitado."
          >
            <Toggle value={ds.influencePredictions} onChange={(v) => setForm({ ...ds, influencePredictions: v })} />
          </Field>
          <Field
            label="Escribir resultado (settlement)"
            subtitle="Fase futura (idea #25): dejar que ESPN escriba el marcador final en el settlement cuando Flashscore está caído. Aún no implementado — se queda apagado."
          >
            <Toggle value={ds.resultFallbackEnabled} onChange={() => {}} disabled />
          </Field>
          <Field
            label="Confianza mínima de emparejamiento"
            subtitle="0–1. ESPN resuelve el evento por nombre + hora de inicio; solo confía en el emparejamiento a partir de este umbral. Default 0.82."
          >
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="w-24"
              value={ds.matchConfidenceMin}
              onChange={(e) => setForm({ ...ds, matchConfidenceMin: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field
            label="Umbral de errores de Flashscore"
            subtitle="Cuántos fallos de Flashscore dentro de la ventana marcan la fuente como caída (1–100). Default 5."
          >
            <Input
              type="number"
              min={1}
              max={100}
              step={1}
              className="w-24"
              value={ds.downtimeErrorThreshold}
              onChange={(e) => setForm({ ...ds, downtimeErrorThreshold: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 5))) })}
            />
          </Field>
          <Field
            label="Ventana de caída (min)"
            subtitle="Ventana deslizante para contar los errores de Flashscore (1–240). Default 10."
          >
            <Input
              type="number"
              min={1}
              max={240}
              step={1}
              className="w-24"
              value={ds.downtimeWindowMinutes}
              onChange={(e) => setForm({ ...ds, downtimeWindowMinutes: Math.min(240, Math.max(1, Math.round(Number(e.target.value) || 10))) })}
            />
          </Field>

          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(ds)}>
              Guardar
            </Button>
            {ds.enabled && !ds.influencePredictions && (
              <span className="text-xs font-sans text-warning">Habilitado en modo validación (aún no afecta las predicciones).</span>
            )}
            {ds.enabled && ds.influencePredictions && (
              <span className="text-xs font-sans text-success">Habilitado e influyendo en las predicciones.</span>
            )}
          </div>

          <div className="pt-6">
            <div className="flex items-center justify-between gap-3 pb-2">
              <div>
                <p className="text-sm text-text-primary font-sans">Preview de resolución ESPN</p>
                <p className="text-xs text-text-muted/60 font-sans">
                  Cómo ESPN resolvería los próximos partidos (evento + confianza + cobertura). Revisa que el evento sea el
                  correcto antes de encender &quot;Influir en predicciones&quot;. No inyecta nada; solo consulta.
                </p>
              </div>
              <Button variant="secondary" size="sm" loading={previewLoading} onClick={() => refetchPreview()}>
                {rows.length ? 'Refrescar' : 'Cargar preview'}
              </Button>
            </div>
            {(rows.length > 0 || previewLoading) && (
              <DataTable
                columns={columns}
                data={rows}
                keyExtractor={(r) => r.matchId}
                loading={previewLoading}
                emptyMessage="No hay próximos partidos V1 para previsualizar."
              />
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
