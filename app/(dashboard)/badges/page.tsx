'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, SectionCard, SubHeading, Toggle, NumInput } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import { BadgeChipPreview } from './_components/BadgeChipPreview';
import { BadgeEditor } from './_components/BadgeEditor';
import {
  BADGE_CATEGORIES,
  emptyDraft,
  type BadgeDefinition,
  type BadgeDraft,
  type BadgeMetric,
  type BadgesConfig,
} from './_components/types';

interface MaintenanceConfig {
  badgesEnabled: boolean;
  badgesConfig: BadgesConfig;
}

const CATEGORY_LABEL = Object.fromEntries(BADGE_CATEGORIES.map((c) => [c.value, c.label]));

/**
 * System → Badges.
 *
 * Reúne en un sitio lo que estaba partido en dos: la configuración global vivía
 * en Config → Maintenance y el catálogo no existía —las 18 insignias estaban
 * escritas en el código de la app, así que corregir una errata o estrenar una
 * obligaba a publicar una versión en las tiendas y esperar a que la aprobaran.
 *
 * Ahora el catálogo es una tabla que la app lee del API: lo que se guarda aquí
 * llega al usuario sin AAB.
 */
export default function BadgesPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery<{ items: BadgeDefinition[] }>({
    queryKey: ['admin-badges'],
    queryFn: () => api.get('/admin/badges') as Promise<{ items: BadgeDefinition[] }>,
  });

  const { data: metricsData } = useQuery<{ metrics: BadgeMetric[] }>({
    queryKey: ['admin-badge-metrics'],
    queryFn: () => api.get('/admin/badges/metrics') as Promise<{ metrics: BadgeMetric[] }>,
    // El catálogo de métricas solo cambia con un despliegue del backend.
    staleTime: 30 * 60 * 1000,
  });

  const { data: maintCfg } = useQuery<MaintenanceConfig>({
    queryKey: ['credits-config'],
    queryFn: () => api.get('/admin/credits-config') as Promise<MaintenanceConfig>,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const metrics = metricsData?.metrics ?? [];

  // ── Editor ────────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<BadgeDraft | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingBuiltin, setEditingBuiltin] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BadgeDefinition | null>(null);

  const closeEditor = (): void => {
    setDraft(null);
    setEditingKey(null);
    setSaveError(null);
  };

  const save = useMutation({
    mutationFn: (d: BadgeDraft) =>
      editingKey ? api.patch(`/admin/badges/${editingKey}`, d) : api.post('/admin/badges', d),
    onSuccess: () => {
      toast.success(editingKey ? 'Insignia actualizada.' : 'Insignia creada.');
      closeEditor();
      void qc.invalidateQueries({ queryKey: ['admin-badges'] });
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const remove = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/badges/${key}`),
    onSuccess: () => {
      toast.success('Insignia borrada.');
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ['admin-badges'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const recompute = useMutation<{ evaluated: number; granted: number; revoked: number }, Error>({
    mutationFn: () =>
      api.post('/admin/badges/recompute', {}) as Promise<{
        evaluated: number;
        granted: number;
        revoked: number;
      }>,
    onSuccess: (r) =>
      toast.success(
        `Barrido hecho: ${r.evaluated} usuarios evaluados, ${r.granted} insignias activas, ${r.revoked} retiradas.`,
      ),
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Ajustes globales (venían de Config → Maintenance) ──────────────────────
  const [cfgForm, setCfgForm] = useState<MaintenanceConfig | null>(null);
  const cfg = cfgForm ?? maintCfg ?? null;

  const saveCfg = useMutation({
    mutationFn: (body: MaintenanceConfig) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setCfgForm(null);
      toast.success('Ajustes de insignias guardados.');
      void qc.invalidateQueries({ queryKey: ['credits-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setThreshold = (key: keyof BadgesConfig['thresholds'], value: number): void => {
    if (!cfg) return;
    setCfgForm({
      ...cfg,
      badgesConfig: {
        ...cfg.badgesConfig,
        thresholds: { ...cfg.badgesConfig.thresholds, [key]: value },
      },
    });
  };
  const setCfgField = (patch: Partial<BadgesConfig>): void => {
    if (!cfg) return;
    setCfgForm({ ...cfg, badgesConfig: { ...cfg.badgesConfig, ...patch } });
  };

  return (
    <div>
      <PageHeader
        title="Insignias"
        description="Catálogo, aspecto y reglas. Lo que guardes aquí llega a la app sin publicar una versión nueva."
        info={
          <>
            Las insignias las otorga el sistema solo: nadie elige las suyas. Se muestran como chips en
            el perfil y la de más peso aparece junto al nombre en las tablas. Las que dependen de una
            foto que cambia (tu puesto, tu estilo reciente) se recalculan cada hora y se retiran
            cuando dejas de cumplirlas; las de hazaña son <strong>para siempre</strong>.
            <br />
            <br />
            Las <strong>18 originales</strong> conservan su lógica en el servidor, así que puedes
            cambiarles el icono, los textos, el color y el peso, pero no cómo se ganan. Las que crees
            aquí se otorgan comparando métricas del usuario contra los umbrales que definas, sin
            desplegar nada.
          </>
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              <RefreshCw size={15} />
              Recalcular ahora
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const next = (items.at(-1)?.sortOrder ?? 0) + 10;
                setDraft(emptyDraft(next));
                setEditingKey(null);
                setEditingBuiltin(false);
                setSaveError(null);
              }}
            >
              <Plus size={15} />
              Nueva insignia
            </Button>
          </div>
        }
      />

      {/* ── Ajustes generales ────────────────────────────────────────────── */}
      <SectionCard
        title="Ajustes generales"
        subtitle="Valen para todas las insignias"
        info="El interruptor maestro y las reglas que no pertenecen a ninguna insignia en concreto: cuántas caben en un perfil y qué defensas se exigen para que una quiniela pueda repartir hazañas."
      >
        {!cfg ? (
          <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
        ) : (
          <>
            <Field
              label="Insignias habilitadas"
              info="Apagado = no se otorga ninguna, el perfil no las devuelve y la app se ve como antes. Apagarlo después de haberlas repartido las esconde, no las borra: al volver a encenderlo siguen ahí."
            >
              <Toggle
                value={cfg.badgesEnabled}
                onChange={(v) => setCfgForm({ ...cfg, badgesEnabled: v })}
              />
            </Field>
            <Field
              label="Máximo visible"
              subtitle="def. 10"
              info="Cuántas insignias como mucho se muestran en un perfil. Se eligen por peso, después de descartar las redundantes (quien tiene 'Podio global' no ve además 'Top 100')."
            >
              <NumInput
                value={cfg.badgesConfig.maxVisible}
                min={1}
                max={20}
                onChange={(v) => setCfgField({ maxVisible: v })}
              />
            </Field>
            <Field
              label="Muestra mínima del ranking global de combinadas"
              subtitle="def. 10 liquidadas"
              info="Combinadas ya liquidadas que hacen falta para entrar en el ranking mundial de combinadas. Sin este suelo, quien acertó una sola combinada de cuota alta sale en el podio por delante de quien lleva cien. Si lo subes demasiado el ranking global se queda vacío."
            >
              <NumInput
                value={cfg.badgesConfig.combinadaGlobalMinScored}
                min={1}
                max={500}
                onChange={(v) => setCfgField({ combinadaGlobalMinScored: v })}
              />
            </Field>
            <Field
              label="Exigir App Check en el anti-farming"
              subtitle="def. activado"
              info="Para contar como participante real de una quiniela que otorga insignias, el miembro tiene que haber entrado desde una instalación verificada de la app (Play Integrity / App Attest). Sin esto, lo único que separa a un amigo de una segunda cuenta es el identificador de dispositivo, que lo manda el propio cliente y un script puede cambiar a voluntad: tres cuentas bastarían para desbloquear Campeón, Perfecto y, repitiendo dos semanas, Perfección — todas permanentes. ⚠️ Con esto activado, un miembro solo cuenta si su entrada al grupo quedó verificada. Eso incluye a los que YA estaban: quien entró antes de que la app atestara figura como no verificado y no contará, aunque la app empiece a atestar hoy. Antes de encender las insignias, revisa cuántos miembros tienen la verificación puesta; si no la tiene casi nadie, ninguna quiniela otorgará insignias de hazaña. El log del backend lo avisa (badges.gate.attestation) cuando descarta miembros por este motivo."
            >
              <Toggle
                value={cfg.badgesConfig.requireAttestedMembers}
                onChange={(v) => setCfgField({ requireAttestedMembers: v })}
              />
            </Field>

            <SubHeading>Umbrales de las 18 originales</SubHeading>
            <Field
              label="Participantes mínimos"
              subtitle="def. 3"
              info="Cuánta gente tiene que haber competido de verdad (enviaron picks y quedaron clasificados) para que una quiniela otorgue insignias. Es la defensa anti-farming: sin ella, crear una quiniela en solitario y 'ganarla' regala la insignia de Campeón por unos pocos créditos."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.minParticipants}
                min={1}
                max={100}
                onChange={(v) => setThreshold('minParticipants', v)}
              />
            </Field>
            <Field
              label="Partidos mínimos por semana"
              subtitle="def. 5"
              info="Partidos que tiene que tener una jornada para que cuente como pleno. Sin este suelo, acertar el marcador de una quiniela de un solo partido otorgaba 'Perfecto' y 'Maestro' a la vez."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.minFixturesPerWeek}
                min={1}
                max={50}
                onChange={(v) => setThreshold('minFixturesPerWeek', v)}
              />
            </Field>
            <Field label="Cazacuotas: cuota mínima" subtitle="def. 8.00">
              <NumInput
                value={cfg.badgesConfig.thresholds.cazacuotasMinOdds}
                min={1.01}
                max={1000}
                step={0.5}
                onChange={(v) => setThreshold('cazacuotasMinOdds', v)}
              />
            </Field>
            <Field label="Vidente de llaves: rondas seguidas" subtitle="def. 4">
              <NumInput
                value={cfg.badgesConfig.thresholds.videnteLlavesMinStreak}
                min={1}
                max={20}
                onChange={(v) => setThreshold('videnteLlavesMinStreak', v)}
              />
            </Field>
            <Field label="Marcador clavado: exactos acumulados" subtitle="def. 25">
              <NumInput
                value={cfg.badgesConfig.thresholds.marcadorClavadoMinExact}
                min={1}
                max={1000}
                onChange={(v) => setThreshold('marcadorClavadoMinExact', v)}
              />
            </Field>
            <Field label="Veterano: quinielas jugadas" subtitle="def. 50">
              <NumInput
                value={cfg.badgesConfig.thresholds.veteranoMinGroups}
                min={1}
                max={1000}
                onChange={(v) => setThreshold('veteranoMinGroups', v)}
              />
            </Field>
            <Field
              label="Ventana de estilo (días)"
              subtitle="def. 90"
              info="Cuánto hacia atrás se mira para juzgar los rasgos de estilo. Una ventana corta reacciona rápido pero es injusta con una mala racha; una larga tarda en soltar a quien ya mejoró."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.riskWindowDays}
                min={7}
                max={365}
                onChange={(v) => setThreshold('riskWindowDays', v)}
              />
            </Field>
            <Field label="Riesgos innecesarios: picks mínimos" subtitle="def. 10">
              <NumInput
                value={cfg.badgesConfig.thresholds.riskMinPicks}
                min={1}
                max={500}
                onChange={(v) => setThreshold('riskMinPicks', v)}
              />
            </Field>
            <Field
              label="Riesgos innecesarios: acierto máximo"
              subtitle="0 a 1 · def. 0.25"
              info="Se otorga cuando la tasa de acierto en riesgos queda POR DEBAJO de este valor. 0.25 = acierta menos de uno de cada cuatro."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.riskMaxHitRate}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setThreshold('riskMaxHitRate', v)}
              />
            </Field>
            <Field label="Uno de más: patas mínimas" subtitle="def. 4">
              <NumInput
                value={cfg.badgesConfig.thresholds.unoDeMasMinLegs}
                min={2}
                max={20}
                onChange={(v) => setThreshold('unoDeMasMinLegs', v)}
              />
            </Field>
            <Field label="Uno de más: combinadas mínimas" subtitle="def. 5">
              <NumInput
                value={cfg.badgesConfig.thresholds.unoDeMasMinCombinadas}
                min={1}
                max={500}
                onChange={(v) => setThreshold('unoDeMasMinCombinadas', v)}
              />
            </Field>
            <Field
              label="Uno de más: proporción"
              subtitle="0 a 1 · def. 0.5"
              info="Qué parte de sus combinadas perdidas tienen que haberse caído por una sola pata. 0.5 = la mitad o más."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.unoDeMasMinShare}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setThreshold('unoDeMasMinShare', v)}
              />
            </Field>
            <Field label="Sin puntería: picks mínimos" subtitle="def. 30">
              <NumInput
                value={cfg.badgesConfig.thresholds.sinPunteriaMinPicks}
                min={1}
                max={5000}
                onChange={(v) => setThreshold('sinPunteriaMinPicks', v)}
              />
            </Field>
            <Field
              label="Sin puntería: fracción del promedio"
              subtitle="0 a 1 · def. 0.6"
              info="Se otorga cuando la precisión del usuario cae por debajo de esta fracción del promedio de toda la comunidad. 0.6 = acierta menos del 60 % de lo que acierta el jugador medio. Bájalo para que sea más difícil de ganar."
            >
              <NumInput
                value={cfg.badgesConfig.thresholds.sinPunteriaMaxRatio}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setThreshold('sinPunteriaMaxRatio', v)}
              />
            </Field>

            <div className="flex items-center gap-3 pt-3">
              <Button variant="primary" loading={saveCfg.isPending} onClick={() => saveCfg.mutate(cfg)}>
                Guardar ajustes
              </Button>
              {cfgForm && (
                <button
                  type="button"
                  onClick={() => setCfgForm(null)}
                  className="text-xs text-text-muted hover:text-text-primary font-sans"
                >
                  Descartar cambios
                </button>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Catálogo ─────────────────────────────────────────────────────── */}
      <SectionCard
        title="Catálogo"
        subtitle={`${items.length} insignias`}
        info="Cada fila es una insignia tal como la verá el usuario. El orden de esta lista es solo del panel; el que decide qué entra en un perfil es el peso."
      >
        {isLoading && <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>}
        {error && <p className="text-danger text-sm font-sans py-3">{(error as Error).message}</p>}

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className="py-2 pr-3 font-medium">Insignia</th>
                  <th className="py-2 px-3 font-medium">Clave</th>
                  <th className="py-2 px-3 font-medium">Categoría</th>
                  <th className="py-2 px-3 font-medium">Se gana</th>
                  <th className="py-2 px-3 font-medium text-right">Peso</th>
                  <th className="py-2 px-3 font-medium">Activa</th>
                  <th className="py-2 pl-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr
                    key={b.key}
                    className={`border-t border-border ${b.enabled ? '' : 'opacity-50'}`}
                  >
                    <td className="py-2 pr-3">
                      <BadgeChipPreview
                        category={b.category}
                        iconSvg={b.iconSvg}
                        iconSlug={b.iconSlug}
                        title={b.titleEs}
                        size="sm"
                      />
                    </td>
                    <td className="py-2 px-3 text-text-muted font-mono text-xs">{b.key}</td>
                    <td className="py-2 px-3 text-text-secondary">
                      {CATEGORY_LABEL[b.category] ?? b.category}
                    </td>
                    <td className="py-2 px-3 text-text-secondary text-xs">
                      {b.evaluator === 'builtin' ? (
                        <span title="Lógica en el servidor. Sus umbrales se ajustan arriba.">
                          Lógica del servidor
                        </span>
                      ) : (
                        <span title={describeCriteria(b, metrics)}>
                          {b.criteria?.all?.length ?? 0} condición
                          {(b.criteria?.all?.length ?? 0) === 1 ? '' : 'es'}
                        </span>
                      )}
                      {b.kind === 'permanent' && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-warning">
                          permanente
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-text-secondary tabular-nums">
                      {b.weight}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          b.enabled ? 'bg-success' : 'bg-text-muted'
                        }`}
                      />
                    </td>
                    <td className="py-2 pl-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => {
                            const { evaluator: _e, isBuiltin: _b, ...rest } = b;
                            setDraft(rest);
                            setEditingKey(b.key);
                            setEditingBuiltin(b.isBuiltin);
                            setSaveError(null);
                          }}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          title={
                            b.isBuiltin
                              ? 'Las originales no se borran: apágalas si no quieres que se otorguen'
                              : 'Borrar'
                          }
                          disabled={b.isBuiltin}
                          onClick={() => setToDelete(b)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-surface-2 disabled:opacity-30 disabled:hover:text-text-muted disabled:hover:bg-transparent transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {draft && (
        <BadgeEditor
          open
          draft={draft}
          isNew={editingKey === null}
          isBuiltin={editingBuiltin}
          metrics={metrics}
          saving={save.isPending}
          error={saveError}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          onClose={closeEditor}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Borrar insignia"
        message={
          toDelete
            ? `"${toDelete.titleEs}" desaparece del catálogo y deja de verse en los perfiles de quien ya la tenía. Si solo quieres dejar de otorgarla, apágala en vez de borrarla.`
            : ''
        }
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.key)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

/** Resumen legible de la regla, para el `title` de la celda. */
function describeCriteria(b: BadgeDefinition, metrics: BadgeMetric[]): string {
  const all = b.criteria?.all ?? [];
  if (all.length === 0) return 'Sin condiciones';
  const OP: Record<string, string> = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=' };
  return all
    .map((c) => {
      const label = metrics.find((m) => m.key === c.metric)?.label ?? c.metric;
      return `${label} ${OP[c.op] ?? c.op} ${c.value}`;
    })
    .join(' y ');
}
