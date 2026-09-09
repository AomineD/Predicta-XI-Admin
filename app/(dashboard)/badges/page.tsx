'use client';

import { useMemo, useRef, useState } from 'react';
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
  TUNABLE_FIELDS,
  readTunable,
  writeTunable,
  type TunableKey,
} from './_components/tunables';
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
 * Solo lo de insignias, para no pisar el resto de la configuración.
 *
 * `GET /admin/credits-config` devuelve TODO el documento compartido (precios,
 * bonos, IAP, flags, redes) y el estado local lo propaga con spread, así que
 * mandarlo entero reescribía todo con la foto de cuando cargó la página: un
 * precio que otro admin cambió entretanto se revertía en silencio. `updateConfig`
 * ignora las claves ausentes, así que acotar el cuerpo basta para cerrarlo.
 */
function badgesOnly(cfg: MaintenanceConfig): Pick<
  MaintenanceConfig,
  'badgesEnabled' | 'badgesConfig'
> {
  return { badgesEnabled: cfg.badgesEnabled, badgesConfig: cfg.badgesConfig };
}

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

  // Los ajustes se declaran aquí arriba porque el "Guardar" de la ficha de una
  // insignia también los persiste: sus umbrales se editan desde el modal.
  const [cfgForm, setCfgForm] = useState<MaintenanceConfig | null>(null);

  // ── Editor ────────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<BadgeDraft | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingBuiltin, setEditingBuiltin] = useState(false);
  // La explicación la calcula el servidor, así que se guarda aparte del
  // formulario: no es un campo editable, es lo que el usuario acabará leyendo.
  const [editingHowTo, setEditingHowTo] = useState<{ es: string; en: string } | null>(null);
  // Igual que `howToEarn`: lo declara el servidor y no viaja en el formulario.
  const [editingTunables, setEditingTunables] = useState<
    { key: string; sharedWith: string[] }[]
  >([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BadgeDefinition | null>(null);

  /**
   * Ajustes tal como estaban al abrir la ficha, para poder deshacer.
   *
   * Cancelar tiene que revertir los umbrales tocados DENTRO del modal. Sin esto
   * sobrevivían en el estado de la página y los escribía el siguiente guardado
   * —el de otra insignia, o el botón "Guardar ajustes"—, una acción que no los
   * nombra. Con `minParticipants`, que es el suelo anti-farming de tres
   * insignias PERMANENTES, lo que se otorgase por error no se puede retirar.
   * No basta con poner `null`: el admin puede traer cambios de la tarjeta de
   * abajo, y cancelar una ficha no debe tirarlos.
   */
  const [cfgSnapshot, setCfgSnapshot] = useState<MaintenanceConfig | null>(null);

  const closeEditor = (): void => {
    setCfgForm(cfgSnapshot);
    setCfgSnapshot(null);
    setDraft(null);
    setEditingKey(null);
    setEditingHowTo(null);
    setEditingTunables([]);
    setSaveError(null);
  };

  /**
   * Nombre visible de cada insignia, para nombrar a las que comparten umbral.
   *
   * `Map` y no un objeto: las claves vienen de la base y un objeto plano hereda
   * de `Object.prototype`, así que una clave como `constructor` devolvería la
   * función heredada en vez de caer al `??`. Hoy no es alcanzable, pero en este
   * backend ya hay antecedente de claves de usuario llegando al prototipo.
   */
  const titleByKey = useMemo(
    () => new Map(items.map((b) => [b.key, b.titleEs])),
    [items],
  );

  /** Si el PUT de umbrales llegó a escribir antes de que fallara la ficha. */
  const configWritten = useRef(false);

  const save = useMutation({
    mutationFn: async (d: BadgeDraft) => {
      // Los umbrales viven en otro documento (`credits-config`) que el de la
      // insignia, pero para quien usa el panel son un solo "Guardar". Van
      // PRIMERO y en secuencia: si la config falla, la ficha no se guarda y el
      // error se ve, en vez de dejar el texto de la app describiendo un umbral
      // que no llegó a escribirse.
      configWritten.current = false;
      if (cfgForm) {
        await api.put('/admin/credits-config', badgesOnly(cfgForm));
        configWritten.current = true;
      }
      return editingKey
        ? await api.patch(`/admin/badges/${editingKey}`, d)
        : await api.post('/admin/badges', d);
    },
    onSuccess: () => {
      toast.success(editingKey ? 'Insignia actualizada.' : 'Insignia creada.');
      setCfgForm(null);
      setCfgSnapshot(null);
      setDraft(null);
      setEditingKey(null);
      setEditingHowTo(null);
      setEditingTunables([]);
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: ['admin-badges'] });
      void qc.invalidateQueries({ queryKey: ['credits-config'] });
    },
    onError: (err: Error) => {
      // Si la ficha falló DESPUÉS de escribir los umbrales, ya están en la base.
      // Callarlo dejaría al admin creyendo que no se guardó nada, con el panel
      // enseñando su copia vieja.
      if (configWritten.current) {
        setCfgForm(null);
        setCfgSnapshot(null);
        void qc.invalidateQueries({ queryKey: ['credits-config'] });
        setSaveError(
          `${err.message} — ojo: los umbrales SÍ se guardaron; lo que falló fue la ficha.`,
        );
        return;
      }
      setSaveError(err.message);
    },
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
  const cfg = cfgForm ?? maintCfg ?? null;

  const saveCfg = useMutation({
    mutationFn: (body: MaintenanceConfig) =>
      api.put('/admin/credits-config', badgesOnly(body)),
    onSuccess: () => {
      setCfgForm(null);
      toast.success('Ajustes de insignias guardados.');
      void qc.invalidateQueries({ queryKey: ['credits-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setCfgField = (patch: Partial<BadgesConfig>): void => {
    if (!cfg) return;
    setCfgForm({ ...cfg, badgesConfig: { ...cfg.badgesConfig, ...patch } });
  };
  /** Umbral cambiado desde la ficha: puede estar en `thresholds` o en la raíz. */
  const setTunable = (key: TunableKey, value: number): void => {
    if (!cfg) return;
    setCfgForm({ ...cfg, badgesConfig: writeTunable(cfg.badgesConfig, key, value) });
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
                setEditingHowTo(null);
                setEditingTunables([]);
                setCfgSnapshot(cfgForm);
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
              label="Mínimo de combinadas liquidadas (ranking global)"
              subtitle="def. 10 · ganadas + perdidas"
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
            {/*
              Se pintan desde TUNABLE_FIELDS, el mismo catálogo que usa la ficha
              de cada insignia. Escritos a mano en los dos sitios, subir un tope
              aquí dejaba a la ficha aceptando un valor que el backend recorta.
              `combinadaGlobalMinScored` se excluye: no es de las 18, ya tiene su
              campo arriba entre los ajustes generales.
            */}
            {TUNABLE_FIELDS.filter((f) => f.key !== 'combinadaGlobalMinScored').map((f) => (
              <Field key={f.key} label={f.label} subtitle={f.subtitle} info={f.info}>
                <NumInput
                  value={readTunable(cfg.badgesConfig, f.key)}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(v) => setTunable(f.key, v)}
                />
              </Field>
            ))}

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
                            const {
                              evaluator: _e,
                              isBuiltin: _b,
                              howToEarn: _h,
                              tunables: _t,
                              ...rest
                            } = b;
                            setDraft(rest);
                            setEditingKey(b.key);
                            setEditingBuiltin(b.isBuiltin);
                            setEditingHowTo(b.howToEarn);
                            setEditingTunables(b.tunables ?? []);
                            setCfgSnapshot(cfgForm);
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
          howToEarn={editingHowTo}
          tunables={editingTunables}
          badgesConfig={cfg?.badgesConfig ?? null}
          titleByKey={titleByKey}
          onTunableChange={setTunable}
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
