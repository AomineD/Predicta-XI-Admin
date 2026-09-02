'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, SubHeading, Toggle } from '@/components/ui/form-controls';
import { Input, Select, Textarea } from '@/components/ui/inputs';
import { BadgeChipPreview } from './BadgeChipPreview';
import { CriteriaBuilder } from './CriteriaBuilder';
import {
  BADGE_CATEGORIES,
  BADGE_KINDS,
  type BadgeCategory,
  type BadgeDraft,
  type BadgeKind,
  type BadgeMetric,
} from './types';

/**
 * Editor de una insignia.
 *
 * Lo que se puede tocar depende de si es una de las 18 originales:
 *
 *  - Las originales conservan su lógica en el servidor (semanas perfectas de un
 *    grupo, ganador con su gate anti-farming), así que su tipo, su familia y su
 *    criterio están bloqueados. Todo lo visible —icono, textos, color, peso— sí
 *    se edita, que es justo lo que antes exigía publicar en las tiendas.
 *  - Las creadas aquí se gobiernan enteras desde el formulario.
 *
 * La clave nunca se edita después de crear: es lo que guarda `user_badges`, y
 * renombrarla dejaría huérfano a todo el que ya tiene la insignia.
 */
export function BadgeEditor({
  open,
  draft,
  isNew,
  isBuiltin,
  metrics,
  saving,
  error,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  draft: BadgeDraft;
  isNew: boolean;
  isBuiltin: boolean;
  metrics: BadgeMetric[];
  saving: boolean;
  error: string | null;
  onChange: (d: BadgeDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'look' | 'rules'>('look');
  const set = <K extends keyof BadgeDraft>(key: K, value: BadgeDraft[K]): void =>
    onChange({ ...draft, [key]: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isNew ? 'Nueva insignia' : draft.titleEs || draft.key}
      description={
        isBuiltin
          ? 'Insignia original: puedes cambiar cómo se ve y cómo se llama, no cómo se gana.'
          : 'Todo lo de esta insignia se gobierna desde aquí, sin desplegar nada.'
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0">
            {error && <p className="text-xs text-danger font-sans truncate">{error}</p>}
          </div>
          <div className="flex gap-2 flex-none">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={onSave}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-border">
        <div className="flex rounded-lg bg-surface-3 p-0.5">
          {(
            [
              { id: 'look', label: 'Aspecto y textos' },
              { id: 'rules', label: 'Cómo se gana' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 h-8 rounded-md text-xs font-sans font-medium transition-colors ${
                tab === t.id ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* La vista previa vive fuera de las pestañas: el icono y el color se
            eligen en una y el efecto tiene que verse desde las dos. */}
        <BadgeChipPreview
          category={draft.category}
          iconSvg={draft.iconSvg}
          iconSlug={draft.iconSlug}
          title={draft.titleEs}
        />
      </div>

      {tab === 'look' ? (
        <>
          <Field
            label="Clave"
            subtitle={isNew ? 'minúsculas y guión bajo' : 'no se puede cambiar'}
            info="Es la identidad de la insignia: lo que se guarda en el historial de cada usuario y lo que la app usa para encontrar su icono empaquetado. Cambiarla después dejaría sin insignia a todo el que ya la tiene, así que se fija al crearla."
          >
            <Input
              value={draft.key}
              disabled={!isNew}
              placeholder="racha_de_oro"
              onChange={(e) => set('key', e.target.value.trim().toLowerCase())}
            />
          </Field>

          <Field
            label="Categoría"
            info="Decide el color del chip, nada más. Dos insignias de la misma categoría se ven iguales aunque cuenten cosas distintas: el color dice de qué tipo de logro hablamos, el icono dice cuál."
          >
            <div className="flex flex-wrap gap-2">
              {BADGE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.hint}
                  onClick={() => set('category', c.value as BadgeCategory)}
                  className={`px-3 h-8 rounded-lg text-xs font-sans font-medium transition-colors ${
                    draft.category === c.value
                      ? 'bg-primary text-background'
                      : 'bg-surface-3 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Icono (SVG)"
            subtitle="monocromo, máx. 16 KB"
            info="Pega el SVG completo. Tiene que ser de trazo plano y usar fill=&quot;currentColor&quot;: la app lo tiñe con el color de la categoría, así que un icono con colores propios se verá mal. Se rechazan los que traigan scripts, atributos on* o recursos externos."
          >
            <Textarea
              value={draft.iconSvg ?? ''}
              placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="…"/></svg>'
              onChange={(e) => set('iconSvg', e.target.value.trim() || null)}
              className="font-mono text-xs min-h-[110px]"
            />
          </Field>

          <Field
            label="Icono empaquetado"
            subtitle="opcional"
            info="Nombre de un SVG que la app ya trae dentro (assets/icons/badges/&lt;nombre&gt;.svg). Sirve como respaldo sin conexión para las 18 originales. Una insignia nueva no lo tiene: déjalo vacío y usa el SVG de arriba."
          >
            <Input
              value={draft.iconSlug ?? ''}
              placeholder="campeon"
              onChange={(e) => set('iconSlug', e.target.value.trim() || null)}
            />
          </Field>

          <SubHeading>Textos</SubHeading>
          <Field label="Título (español)" subtitle="máx. 40 caracteres">
            <Input value={draft.titleEs} onChange={(e) => set('titleEs', e.target.value)} />
          </Field>
          <Field label="Título (inglés)" subtitle="máx. 40 caracteres">
            <Input value={draft.titleEn} onChange={(e) => set('titleEn', e.target.value)} />
          </Field>
          <Field
            label="Descripción (español)"
            subtitle="máx. 240 caracteres"
            info="Es lo que se lee al tocar el chip en el perfil. Explica qué hizo el usuario, en segunda persona y sin jerga."
          >
            <Textarea
              value={draft.descriptionEs}
              onChange={(e) => set('descriptionEs', e.target.value)}
            />
          </Field>
          <Field label="Descripción (inglés)" subtitle="máx. 240 caracteres">
            <Textarea
              value={draft.descriptionEn}
              onChange={(e) => set('descriptionEn', e.target.value)}
            />
          </Field>

          <SubHeading>Presentación</SubHeading>
          <Field
            label="Peso"
            subtitle="0 a 1000"
            info="Decide qué insignias ganan sitio en el perfil y en qué orden se pintan cuando alguien tiene más de las que caben. No cambia quién las gana."
          >
            <Input
              type="number"
              value={draft.weight}
              onChange={(e) => set('weight', Number(e.target.value))}
              className="w-28"
            />
          </Field>
          <Field
            label="Orden en esta lista"
            subtitle="solo del panel"
            info="Ordena esta pantalla. No afecta a lo que ve el usuario: eso lo decide el peso."
          >
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => set('sortOrder', Number(e.target.value))}
              className="w-28"
            />
          </Field>
          <Field
            label="Anunciar por notificación"
            info="Con esto apagado la insignia se otorga en silencio: aparece en el perfil pero no llega ningún aviso. Es lo correcto para las negativas — anunciar un desliz sería hostil. También controla si el icono puede colgarse del nombre en las tablas públicas."
          >
            <Toggle value={draft.notify} onChange={(v) => set('notify', v)} />
          </Field>
          <Field
            label="Activa"
            info="Apagada no se otorga ni se muestra, pero NO se borra lo ya otorgado: al volver a encenderla, quien la tenía la recupera."
          >
            <Toggle value={draft.enabled} onChange={(v) => set('enabled', v)} />
          </Field>
        </>
      ) : (
        <>
          {isBuiltin ? (
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-sm text-text-primary font-sans">
                Esta insignia la concede el servidor con lógica propia.
              </p>
              <p className="text-xs text-text-muted font-sans mt-2 leading-relaxed">
                Depende de cosas que no son un número por usuario —las semanas perfectas de un grupo
                recién liquidado, el ganador de una quiniela con su gate anti-farming— y por eso no
                se puede describir con umbrales. Sus exigencias (cuota mínima de Cazacuotas, rondas
                seguidas de Vidente de llaves, y demás) se ajustan en la tarjeta{' '}
                <strong>Umbrales</strong> de esta misma página.
              </p>
            </div>
          ) : (
            <>
              <Field
                label="Tipo"
                info="Decide si el barrido puede retirarla. Piénsalo dos veces antes de marcar 'para siempre': una insignia permanente mal calibrada no se puede quitar después."
              >
                <div className="flex flex-wrap gap-2">
                  {BADGE_KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      title={k.hint}
                      onClick={() => set('kind', k.value as BadgeKind)}
                      className={`px-3 h-8 rounded-lg text-xs font-sans font-medium transition-colors ${
                        draft.kind === k.value
                          ? 'bg-primary text-background'
                          : 'bg-surface-3 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Familia"
                subtitle="opcional"
                info="Insignias que son escalones de lo mismo. Dentro de una familia solo se muestra la de más peso que el usuario tenga: no tiene sentido enseñar 'Top 100' a quien lleva 'Podio global'. Déjala vacía si la insignia no compite con ninguna otra."
              >
                <Input
                  value={draft.family ?? ''}
                  placeholder="racha"
                  onChange={(e) => set('family', e.target.value.trim() || null)}
                />
              </Field>

              <SubHeading>Regla</SubHeading>
              <div className="pt-1">
                <CriteriaBuilder
                  value={draft.criteria ?? { all: [] }}
                  onChange={(v) => set('criteria', v)}
                  metrics={metrics}
                />
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
