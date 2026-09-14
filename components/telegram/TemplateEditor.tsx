'use client';

/**
 * Editor de las maquetas del canal.
 *
 * ## Por qué la vista previa manda
 *
 * El editor no enseña el texto de la plantilla como resultado: enseña el MENSAJE
 * ya renderizado, al lado y en vivo. Una maqueta con `{{#leagues}}` y secciones
 * anidadas es imposible de leer de cabeza, y el fallo típico no es un error de
 * sintaxis —esos los canta el validador— sino un hueco donde el dato no existía:
 * un partido sin confianza, una liga sin jornada. Eso solo se ve renderizando.
 *
 * Por eso la vista previa usa DATOS REALES cuando los hay y avisa cuando no.
 * "Así va a salir hoy" y "así saldría con datos inventados" son dos cosas muy
 * distintas en el momento de pulsar Guardar.
 *
 * ## Por qué el catálogo de variables viene del backend
 *
 * La paleta, el validador del PUT y el ámbito con el que se renderiza tienen que
 * ser la misma lista. Con una copia aquí, la paleta acabaría ofreciendo una
 * variable que el backend no rellena, y el resultado es un hueco en el canal sin
 * error ni log.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import styles from './telegram-layout.module.css';

/* ── contrato con el backend ────────────────────────────────────────────────── */

type Lang = 'es' | 'en';

interface VariableDoc {
  name: string;
  kind: 'variable' | 'section';
  hint: string;
  example?: string;
  children?: VariableDoc[];
}

interface TemplateItem {
  contentType: string;
  template: { es: string; en: string };
  default: { es: string; en: string };
  customized: boolean;
  variables: VariableDoc[];
}

interface TemplatesResponse {
  items: TemplateItem[];
  maxChars: number;
  customEmojiEnabled: boolean;
}

interface PreviewIssue {
  lang: Lang;
  level: 'error' | 'warning';
  message: string;
}

interface PreviewResponse {
  ok: boolean;
  issues: PreviewIssue[];
  es?: string;
  en?: string;
  visibleChars?: number;
  usedSampleData?: boolean;
  gamblingLexicon?: boolean;
}

/** Nombre y una línea de contexto por tipo. El orden es el de la parrilla. */
const TYPE_META: Record<string, { label: string; hint: string }> = {
  today_matches: { label: 'Agenda del día', hint: 'Por la mañana, agrupada por competición.' },
  match_teaser: { label: 'Partidazo', hint: 'El partido destacado, con su pronóstico.' },
  goal: { label: 'Gol', hint: 'En vivo, en cuanto ESPN confirma el gol.' },
  match_result: { label: 'Finaliza partido', hint: 'Marcador final, goleadores y MVP.' },
  standings_recap: { label: 'Tablas de las ligas', hint: 'Al cierre del día, solo las que se movieron.' },
};

const TYPE_ORDER = ['today_matches', 'match_teaser', 'goal', 'match_result', 'standings_recap'];

/* ── burbuja de Telegram ────────────────────────────────────────────────────── */

/** Lo único que la burbuja puede pintar. Espejo de la lista blanca del motor. */
const PREVIEW_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'INS',
  'S',
  'STRIKE',
  'DEL',
  'CODE',
  'PRE',
  'BLOCKQUOTE',
  'SPAN',
  'A',
  'TG-EMOJI',
  'BR',
]);

/**
 * Reconstruye el HTML dejando pasar solo las etiquetas de {@link PREVIEW_TAGS} y
 * NINGÚN atributo.
 *
 * Es una segunda capa deliberada, no desconfianza del backend: hoy su lista
 * blanca es correcta y aquí no entra nada ejecutable. Pero esta burbuja pinta con
 * `dangerouslySetInnerHTML`, y el día que alguien añada `img` o `style` a la lista
 * del motor —por un motivo perfectamente razonable, en otro archivo, meses
 * después— el panel del admin se vuelve vulnerable sin que nada relacione un
 * cambio con el otro. La regla que protege está en el mismo archivo que el riesgo.
 *
 * Se tiran los atributos enteros, incluido el `href`: en una vista previa nadie
 * necesita navegar, y así no hay ningún valor de atributo que revisar.
 *
 * Se usa `DOMParser` y no una expresión regular: el analizador del navegador es
 * el mismo que decide qué es una etiqueta, así que no hay hueco entre lo que
 * valida el filtro y lo que interpreta el DOM.
 */
function sanitizePreview(html: string): string {
  if (typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const div = document.createElement('div');
      div.textContent = node.nodeValue ?? '';
      return div.innerHTML;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const inner = Array.from(el.childNodes).map(walk).join('');
    if (!PREVIEW_TAGS.has(el.tagName)) return inner;
    const tag = el.tagName.toLowerCase();
    return tag === 'br' ? '<br>' : `<${tag}>${inner}</${tag}>`;
  };
  return Array.from(doc.body.childNodes).map(walk).join('');
}

/**
 * El mensaje tal como lo va a pintar Telegram.
 *
 * `<tg-emoji>` es un elemento que el navegador no conoce, así que pinta su
 * contenido — el respaldo Unicode. Es exactamente lo que ve quien no tiene
 * Premium, así que la vista previa enseña el peor caso, que es el útil.
 */
function TelegramBubble({ html, label }: { html: string; label: string }) {
  const safe = useMemo(() => sanitizePreview(html), [html]);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted/60 font-sans mb-1.5">{label}</div>
      <div
        className="min-w-0 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] font-sans"
        style={{ background: '#182533', color: '#e9edf2' }}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}

/* ── paleta de variables ────────────────────────────────────────────────────── */

function VariablePalette({
  variables,
  onInsert,
}: {
  variables: VariableDoc[];
  onInsert: (snippet: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const chip = (doc: VariableDoc, depth: number) => {
    const snippet = doc.kind === 'section' ? `{{#${doc.name}}}\n\n{{/${doc.name}}}` : `{{${doc.name}}}`;
    return (
      <button
        key={`${depth}-${doc.name}`}
        type="button"
        onClick={() => onInsert(snippet)}
        title={doc.example ? `${doc.hint} Ej.: ${doc.example}` : doc.hint}
        className={cn(
          'px-2 h-6 rounded-md font-mono text-[11px] transition-colors',
          doc.kind === 'section'
            ? 'bg-accent/10 text-accent hover:bg-accent/20'
            : 'bg-surface-3 text-text-secondary hover:bg-surface-3/70 hover:text-text-primary',
        )}
      >
        {doc.kind === 'section' ? `#${doc.name}` : doc.name}
      </button>
    );
  };

  const render = (docs: VariableDoc[], depth: number): React.ReactNode =>
    docs.map((doc) =>
      doc.children && doc.children.length > 0 ? (
        <div key={`g-${depth}-${doc.name}`} className="w-full mt-2">
          <div className="flex flex-wrap gap-1 items-center">
            {chip(doc, depth)}
            <span className="text-[10px] text-text-muted/60 font-sans">— dentro:</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1 pl-3 border-l border-border">
            {render(doc.children, depth + 1)}
          </div>
        </div>
      ) : (
        chip(doc, depth)
      ),
    );

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex flex-wrap items-center gap-1.5 text-left text-[11px] font-sans font-semibold uppercase tracking-wider text-text-secondary"
      >
        <span>{open ? '▾' : '▸'}</span>
        Variables de este tipo
        <span className="text-text-muted/50 normal-case font-normal tracking-normal">
          — pulsa una para insertarla
        </span>
      </button>
      {open && <div className="flex flex-wrap gap-1 mt-2.5">{render(variables, 0)}</div>}
    </div>
  );
}

/* ── editor ─────────────────────────────────────────────────────────────────── */

export function TemplateEditor() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string>('today_matches');
  const [lang, setLang] = useState<Lang>('es');
  /** Borradores por tipo. Sobreviven al cambio de tipo: perder lo escrito por
   *  pinchar otro de la lista sería el peor fallo posible de esta pantalla. */
  const [drafts, setDrafts] = useState<Record<string, { es: string; en: string }>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const templatesQ = useQuery<TemplatesResponse>({
    queryKey: ['telegram-templates'],
    queryFn: () => api.get('/admin/telegram/templates'),
  });

  const items = useMemo(() => {
    const byType = new Map((templatesQ.data?.items ?? []).map((i) => [i.contentType, i]));
    return TYPE_ORDER.map((t) => byType.get(t)).filter((i): i is TemplateItem => Boolean(i));
  }, [templatesQ.data]);

  const item = items.find((i) => i.contentType === selected);
  const saved = item?.template ?? { es: '', en: '' };
  const draft = drafts[selected] ?? saved;
  const dirty = draft.es !== saved.es || draft.en !== saved.en;
  const maxChars = templatesQ.data?.maxChars ?? 6000;

  /* La vista previa se pide con retardo: renderiza en el servidor contra los
     datos reales, y una petición por pulsación no aporta nada que no aporte una
     cada medio segundo. */
  const [debounced, setDebounced] = useState(draft);
  const draftEs = draft.es;
  const draftEn = draft.en;
  useEffect(() => {
    const id = setTimeout(() => setDebounced({ es: draftEs, en: draftEn }), 450);
    return () => clearTimeout(id);
  }, [draftEs, draftEn]);

  const previewQ = useQuery<PreviewResponse>({
    queryKey: ['telegram-template-preview', selected, debounced.es, debounced.en],
    queryFn: () => api.post(`/admin/telegram/templates/${selected}/preview`, debounced),
    enabled: Boolean(item),
    staleTime: 30_000,
  });

  const saveM = useMutation({
    mutationFn: () => api.put(`/admin/telegram/templates/${selected}`, draft),
    onSuccess: () => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[selected];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['telegram-templates'] });
      toast.success('Maqueta guardada. Se aplica en la siguiente publicación.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetM = useMutation({
    mutationFn: () => api.delete(`/admin/telegram/templates/${selected}`),
    onSuccess: () => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[selected];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['telegram-templates'] });
      toast.success('Restablecida la maqueta de fábrica.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDraftLang = (value: string) => {
    setDrafts((d) => ({ ...d, [selected]: { ...draft, [lang]: value } }));
  };

  /** Inserta en el cursor, no al final: la paleta sirve para escribir dentro de
   *  una sección, y pegar siempre al final obligaría a cortar y pegar a mano. */
  const insert = (snippet: string) => {
    const el = textareaRef.current;
    const current = draft[lang];
    if (!el) {
      setDraftLang(current + snippet);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = current.slice(0, start) + snippet + current.slice(end);
    setDraftLang(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.indexOf('\n\n') + 1;
      const pos = snippet.includes('\n\n') ? caret : start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  if (templatesQ.isLoading) {
    return <p className="text-sm text-text-muted font-sans">Cargando maquetas…</p>;
  }
  if (templatesQ.error) {
    return <p className="text-sm text-danger font-sans">No se pudieron cargar las maquetas.</p>;
  }
  if (!item) return null;

  const issues = previewQ.data?.issues ?? [];
  const errors = issues.filter((i) => i.level === 'error');
  const chars = draft[lang].length;

  return (
    <div className={styles.templates}>
      {/* Lista de tipos */}
      <div className={styles.types} role="group" aria-label="Tipo de plantilla">
        {items.map((i) => {
          const meta = TYPE_META[i.contentType] ?? { label: i.contentType, hint: '' };
          const active = i.contentType === selected;
          const hasDraft = Boolean(drafts[i.contentType]);
          return (
            <button
              key={i.contentType}
              type="button"
              onClick={() => setSelected(i.contentType)}
              aria-pressed={active}
              className={cn(
                styles.type,
                'text-left rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                active
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn('text-sm font-sans font-medium', active ? 'text-text-primary' : 'text-text-secondary')}>
                  {meta.label}
                </span>
                {hasDraft && <span className="w-1.5 h-1.5 rounded-full bg-warning" title="Sin guardar" />}
              </div>
              <p className={cn(styles.typeHint, 'text-[11px] text-text-muted/60 font-sans mt-0.5 leading-tight')}>{meta.hint}</p>
              <span
                className={cn(
                  'inline-block mt-1.5 px-1.5 h-4 leading-4 rounded text-[10px] font-sans',
                  i.customized ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-muted',
                )}
              >
                {i.customized ? 'personalizada' : 'de fábrica'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <Card
        className="min-w-0 p-4 sm:p-5"
        title={TYPE_META[selected]?.label ?? selected}
        info={
          <>
            <p>
              El texto se compone con esta maqueta, sin pasar por el redactor IA. Los <code>{'{{nombre}}'}</code> se
              sustituyen por el dato y las <code>{'{{#seccion}}…{{/seccion}}'}</code> se repiten o desaparecen según
              haya contenido.
            </p>
            <p className="mt-2">
              Se admite el formato de Telegram: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;u&gt;</code>,{' '}
              <code>&lt;s&gt;</code>, <code>&lt;code&gt;</code>, <code>&lt;blockquote&gt;</code> y enlaces. Cualquier
              otra etiqueta se publica como texto para que se vea en la vista previa, no se descarta en silencio.
            </p>
          </>
        }
        action={
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
            {(['es', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                aria-label={l === 'es' ? 'Editar en español' : 'Editar en inglés'}
                className={cn(
                  'px-3 h-7 rounded-md text-xs font-sans font-medium transition-colors uppercase',
                  lang === l ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        }
      >
        <textarea
          ref={textareaRef}
          aria-label={`Plantilla ${TYPE_META[selected]?.label ?? selected} en ${lang === 'es' ? 'español' : 'inglés'}`}
          value={draft[lang]}
          onChange={(e) => setDraftLang(e.target.value)}
          spellCheck={false}
          rows={18}
          maxLength={maxChars}
          className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-text-primary focus:outline-none focus:border-primary/50 resize-y"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <span className={cn('text-[11px] font-sans', chars > maxChars * 0.9 ? 'text-warning' : 'text-text-muted/60')}>
            {chars} / {maxChars} caracteres
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[selected];
                    return next;
                  })
                }
              >
                Descartar cambios
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!item.customized}>
              Restablecer de fábrica
            </Button>
            <Button
              size="sm"
              onClick={() => saveM.mutate()}
              disabled={!dirty || errors.length > 0 || saveM.isPending}
            >
              {saveM.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 space-y-1">
            {errors.map((i, n) => (
              <li key={n} className="text-xs font-sans text-danger">
                <span className="font-semibold uppercase mr-1.5">{i.lang}</span>
                {i.message}
              </li>
            ))}
          </ul>
        )}

        <VariablePalette variables={item.variables} onInsert={insert} />
      </Card>

      {/* Vista previa */}
      <Card
        className="min-w-0 p-4 sm:p-5"
        title="Cómo queda"
        subtitle={
          previewQ.data?.usedSampleData
            ? 'Con datos de MUESTRA: ahora mismo no hay datos reales de este tipo.'
            : 'Con los datos reales de hoy.'
        }
        action={
          previewQ.data?.visibleChars !== undefined ? (
            <span
              className={cn(
                'text-[11px] font-sans',
                previewQ.data.visibleChars > 4096 ? 'text-danger' : 'text-text-muted/60',
              )}
            >
              {previewQ.data.visibleChars} / 4096
            </span>
          ) : null
        }
      >
        {previewQ.isFetching && <p className="text-xs text-text-muted/60 font-sans mb-2">Actualizando…</p>}
        {previewQ.data?.ok && previewQ.data.es !== undefined && previewQ.data.en !== undefined ? (
          <div className="space-y-3">
            <TelegramBubble html={previewQ.data.es} label="Español" />
            <TelegramBubble html={previewQ.data.en} label="English" />
            {previewQ.data.gamblingLexicon && (
              <p className="text-xs font-sans text-danger">
                Este texto contiene vocabulario de apuestas y el canal lo bloqueará al publicar.
              </p>
            )}
            {templatesQ.data?.customEmojiEnabled === false && (
              <p className="text-[11px] font-sans text-text-muted/60">
                Los emojis personalizados están desactivados: se ven sus respaldos normales.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-muted/60 font-sans">
            Corrige los errores de la maqueta para ver cómo queda.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="Restablecer la maqueta de fábrica"
        message="Se descarta tu versión de este tipo y vuelve la que trae el sistema, en los dos idiomas. No se puede deshacer."
        confirmLabel="Restablecer"
        cancelLabel="Cancelar"
        variant="danger"
        loading={resetM.isPending}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetM.mutate();
        }}
      />
    </div>
  );
}
