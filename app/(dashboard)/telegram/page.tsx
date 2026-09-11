'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LeaguePicker } from '@/components/pickers/LeaguePicker';
import { TeamPicker } from '@/components/pickers/TeamPicker';

/* ── tabs ───────────────────────────────────────────────────────────────────── */

const TG_TABS = [
  { id: 'connection', label: 'Conexión' },
  { id: 'content', label: 'Contenido' },
  { id: 'creatives', label: 'Creativos' },
  { id: 'queue', label: 'Cola' },
  { id: 'history', label: 'Historial' },
  { id: 'metrics', label: 'Rendimiento' },
] as const;
type TgTabId = typeof TG_TABS[number]['id'];

/* ── config contract (mirrors backend TelegramConfigData / PUT input) ───────── */

type PublishMode = 'auto' | 'approval';
type ChannelMode = 'bilingual' | 'split';

const CONTENT_TYPES = [
  'match_recap',
  'weekly_recap',
  'standings_recap',
  'match_teaser',
  'free_pick',
  'goal',
  'today_matches',
  'day_results',
  'match_result',
  'combinada_teaser',
  'weekly_top_picks',
  'promo',
  'poll',
  'fun_fact',
  'news',
] as const;
type ContentType = typeof CONTENT_TYPES[number];

/**
 * Tipos que se pueden componer a mano desde «Componer ahora».
 *
 * Ni `goal` ni `match_result` están: sus hechos los trae un partido concreto —
 * una incidencia en curso, un encuentro que acaba de terminar— y no un builder
 * al que se le pueda pedir uno de la nada. Pedirlos devolvería un 422.
 */
const COMPOSABLE_TYPES = [
  'match_recap',
  'weekly_recap',
  'standings_recap',
  'match_teaser',
  'free_pick',
  'today_matches',
  'day_results',
  'combinada_teaser',
  'weekly_top_picks',
  'promo',
  'poll',
  'fun_fact',
  'news',
] as const;

/**
 * Configuración de UN tipo. Desde la migración `0193` vive en su propia fila
 * (`telegram_content_types`) en vez de en columnas de la tabla global: con los
 * diez tipos nuevos del plan, el modelo por columnas serían más de cincuenta.
 *
 * `hours` y `weekdays` son listas porque un tipo puede ocupar varias franjas y
 * porque el domingo del balance semanal estaba CABLEADO en el backend; ahora es
 * dato.
 */
interface ContentTypeConfig {
  contentType: ContentType;
  enabled: boolean;
  mode: PublishMode;
  hours: number[];
  /** 0 = domingo. */
  weekdays: number[];
  maxPerDay: number;
  promptOverride: string | null;
  settings: Record<string, unknown>;
}

interface TelegramConfig {
  enabled: boolean;
  botTokenConfigured: boolean;
  channelId: string | null;
  channelIdEn: string | null;
  channelMode: ChannelMode;
  publishTimezone: string;
  maxPostsPerDay: number;
  ctaUrl: string | null;
  ctaUtmEnabled: boolean;
  cardImagesEnabled: boolean;
  historyRetentionDays: number;
  contentTypes: ContentTypeConfig[];
}

/** Rendimiento por tipo: reacciones y votos por publicación. */
interface TypeMetrics {
  contentType: string;
  posts: number;
  reactions: number;
  pollVotes: number;
  engagementPerPost: number;
}

interface TelegramPost {
  id: string;
  contentType: string;
  contentKey: string;
  status: 'pending_approval' | 'approved' | 'published' | 'rejected' | 'failed';
  renderedText: string;
  deepLink: string | null;
  usedLlm: boolean;
  telegramMessageId: number | null;
  publishedAt: string | null;
  approvedBy: string | null;
  errorLog: string | null;
  createdAt: string | null;
  /**
   * Los hechos con los que se compuso. Solo se lee para las noticias: es donde
   * viven el titular del medio y el extracto del artículo, que hay que poder
   * comparar con la reescritura ANTES de aprobar (F5-03). El resto de tipos no
   * lo necesita.
   */
  factsJson?: Record<string, unknown> | null;
}

interface PostsPage {
  items: TelegramPost[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  match_recap: 'Recap diario',
  weekly_recap: 'Balance semanal',
  standings_recap: 'Tablas',
  match_teaser: 'Partidazo',
  free_pick: 'Pick gratis',
  goal: 'Goles en vivo',
  today_matches: 'Agenda del día',
  day_results: 'Cierre del día',
  match_result: 'Final del partido',
  combinada_teaser: 'Combinada del día',
  weekly_top_picks: 'Aciertos de la semana',
  promo: 'Promoción',
  poll: 'Encuesta',
  fun_fact: 'Dato curioso',
  news: 'Noticias',
  manual: 'Manual',
};

/**
 * Tipos cuyo texto NO pasa por el redactor IA (`deterministicCopy` en el registro
 * del backend).
 *
 * Son deterministas por motivos distintos —un gol tiene que salir en segundos,
 * una campaña ya la aprobó una persona, un dato curioso son números, una noticia
 * llega ya reescrita y validada— pero el efecto en el panel es el mismo: el
 * «Prompt extra» no lo lee nadie y «Regenerar» devuelve el MISMO texto. Enseñar
 * esos dos controles es peor que no tenerlos: quien los usa cree haber cambiado
 * algo y no pasa nada, sin ningún error que lo delate.
 */
const DETERMINISTIC_TYPES = new Set<string>(['goal', 'promo', 'poll', 'fun_fact', 'news']);

/**
 * Tipos de noticia que el selector editorial puede mirar, en el orden en el que
 * el canal los prioriza. Espejo de `NEWS_EDITORIAL_TYPES` en el backend.
 */
const NEWS_TYPES: { value: string; label: string }[] = [
  { value: 'transfer', label: 'Fichajes' },
  { value: 'tactical', label: 'Banquillo' },
  { value: 'injury', label: 'Lesiones' },
  { value: 'suspension', label: 'Sanciones' },
  { value: 'lineup', label: 'Alineaciones' },
  { value: 'other', label: 'Otras' },
];

/** El mismo conjunto por defecto que aplica el backend cuando no hay selección. */
const DEFAULT_NEWS_TYPES = ['transfer', 'tactical', 'injury', 'suspension'];

/** Un creativo del canal, tal como lo lista el bucket. */
interface Creative {
  key: string;
  url: string;
  size: number;
  lastModified: string | null;
}

/* ── small inline controls (raw, matching the notifications page styling) ───── */

function TextInput({ value, onChange, placeholder, type = 'text', maxLength }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, maxLength }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans resize-none"
    />
  );
}

function Select<T extends string>({ value, options, onChange, disabled = false }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const MODE_OPTIONS: { value: PublishMode; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'approval', label: 'Con aprobación' },
];

function StatusPill({ status }: { status: TelegramPost['status'] }) {
  const map: Record<TelegramPost['status'], { label: string; cls: string }> = {
    pending_approval: { label: 'Pendiente', cls: 'bg-warning/15 border-warning text-warning' },
    approved: { label: 'Aprobado', cls: 'bg-primary/15 border-primary text-primary' },
    published: { label: 'Publicado', cls: 'bg-success/15 border-success text-success' },
    rejected: { label: 'Rechazado', cls: 'bg-surface-3 border-border text-text-muted' },
    failed: { label: 'Falló', cls: 'bg-danger/15 border-danger text-danger' },
  };
  const s = map[status];
  return <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border font-sans ${s.cls}`}>{s.label}</span>;
}

/* ── selector de creativo ───────────────────────────────────────────────────── */

/**
 * Elige la imagen que acompaña a un tipo, de entre los creativos ya subidos.
 *
 * Es un desplegable y no un campo de texto a propósito: la URL la genera la
 * subida, y escribirla a mano es la vía directa a un enlace roto que solo se
 * descubre cuando la publicación sale sin imagen.
 */
function CreativeField({
  value,
  creatives,
  onChange,
}: {
  value: string | null;
  creatives: Creative[];
  onChange: (v: string | null) => void;
}) {
  return (
    <Field
      label="Imagen"
      subtitle="Creativo que acompaña a la publicación. Vacío = solo texto."
      info="Se elige de los creativos subidos en la pestaña «Creativos». Telegram descarga la imagen desde su lado, así que tiene que estar publicada en nuestro dominio."
    >
      <div className="flex items-center gap-3">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans max-w-[16rem]"
        >
          <option value="">Sin imagen</option>
          {/* Un creativo que se borró del bucket seguiría configurado aquí: se
              añade como opción para que el desplegable no lo pierda en silencio
              al guardar cualquier otro cambio. */}
          {value && !creatives.some((c) => c.url === value) && (
            <option value={value}>(el configurado, ya no está en la galería)</option>
          )}
          {creatives.map((c) => (
            <option key={c.key} value={c.url}>
              {c.key.replace('telegram/creatives/', '')}
            </option>
          ))}
        </select>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            // La url la genera la subida, pero el campo admite cualquier host:
            // sin esto, una url que apunte a un tercero le filtraría al servidor
            // ajeno la IP del administrador y la dirección del panel.
            referrerPolicy="no-referrer"
            className="h-9 w-16 object-cover rounded-md border border-border"
          />
        )}
      </div>
    </Field>
  );
}

/* ── catálogo de promociones ────────────────────────────────────────────────── */

/**
 * Una pieza del catálogo de promoción.
 *
 * Vive dentro de `settings.templates` del tipo `promo`, no en una tabla propia:
 * una campaña nueva tiene que ser una fila más de este array, nunca una
 * migración ni un tipo de contenido nuevo.
 */
/**
 * Topes del texto de una campaña, los MISMOS que aplica el backend al guardar.
 *
 * Son cortos a propósito: el post es bilingüe y Telegram corta el pie de una foto
 * en 1024 caracteres. Al pasarse, el publicador degrada a mensaje de texto y la
 * imagen desaparece sin decir nada, así que el límite se enseña aquí en vez de
 * recortar el texto al guardar.
 */
const PROMO_BODY_MAX = 350;
const PROMO_TITLE_MAX = 80;

interface PromoTemplate {
  id: string;
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  imageUrl: string | null;
  utmContent: string | null;
  weight: number;
  enabled: boolean;
}

/** Lee el catálogo del jsonb, tolerando lo que no tenga forma. */
function readTemplates(settings: Record<string, unknown>): PromoTemplate[] {
  const raw = settings.templates;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object' && !Array.isArray(t))
    .map((t) => ({
      id: typeof t.id === 'string' ? t.id : '',
      titleEs: typeof t.titleEs === 'string' ? t.titleEs : '',
      titleEn: typeof t.titleEn === 'string' ? t.titleEn : '',
      bodyEs: typeof t.bodyEs === 'string' ? t.bodyEs : '',
      bodyEn: typeof t.bodyEn === 'string' ? t.bodyEn : '',
      imageUrl: typeof t.imageUrl === 'string' && t.imageUrl.length > 0 ? t.imageUrl : null,
      utmContent: typeof t.utmContent === 'string' && t.utmContent.length > 0 ? t.utmContent : null,
      weight: typeof t.weight === 'number' && Number.isFinite(t.weight) ? t.weight : 1,
      enabled: t.enabled !== false,
    }));
}

/**
 * Editor del catálogo de promociones.
 *
 * El backend descarta al guardar cualquier plantilla sin cuerpo en LOS DOS
 * idiomas: el canal publica bilingüe y media plantilla no es publicable. Por eso
 * se avisa aquí en vez de dejar que desaparezca al recargar.
 */
function PromoTemplatesEditor({
  templates,
  creatives,
  onChange,
}: {
  templates: PromoTemplate[];
  creatives: Creative[];
  onChange: (next: PromoTemplate[]) => void;
}) {
  const patchAt = (index: number, patch: Partial<PromoTemplate>): void =>
    onChange(templates.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const add = (): void =>
    onChange([
      ...templates,
      {
        id: `campana-${templates.length + 1}`,
        titleEs: '',
        titleEn: '',
        bodyEs: '',
        bodyEn: '',
        imageUrl: null,
        utmContent: null,
        weight: 1,
        enabled: true,
      },
    ]);

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary font-sans">Catálogo de campañas</span>
          <InfoPopover label="Cómo funciona el catálogo de campañas">
            Cada campaña es una variante del mismo tipo: se rotan por peso y nunca sale dos veces seguidas la
            misma. Sin ninguna activa, el tipo no publica nada aunque esté encendido. El identificador viaja
            como <code>utm_content</code>, así que es lo que distingue en analítica qué campaña trajo el clic.
          </InfoPopover>
        </div>
        <Button variant="secondary" size="sm" onClick={add}>Añadir campaña</Button>
      </div>

      {templates.length === 0 && (
        <p className="text-xs font-sans text-warning pb-2">
          Sin campañas escritas, este tipo no publica nada aunque lo enciendas.
        </p>
      )}

      {templates.map((t, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 mb-3"
          style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-2">
              <Toggle value={t.enabled} onChange={(v) => patchAt(i, { enabled: v })} />
              <span className="text-xs font-sans text-text-muted">{t.enabled ? 'Activa' : 'Apagada'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onChange(templates.filter((_, j) => j !== i))}>
              Quitar
            </Button>
          </div>

          <Field label="Identificador" subtitle="Sin espacios ni acentos. Viaja como utm_content.">
            <TextInput value={t.id} onChange={(v) => patchAt(i, { id: v })} placeholder="quiniela-semanal" maxLength={40} />
          </Field>
          <Field label="Peso" subtitle="Cuanto más alto, más veces sale.">
            <NumInput value={t.weight} onChange={(v) => patchAt(i, { weight: v })} min={1} max={100} />
          </Field>
          <Field label="Título (ES)" subtitle="Opcional. Primera línea del post.">
            <TextInput value={t.titleEs} onChange={(v) => patchAt(i, { titleEs: v })} maxLength={PROMO_TITLE_MAX} />
          </Field>
          <Field label="Título (EN)" subtitle="Opcional.">
            <TextInput value={t.titleEn} onChange={(v) => patchAt(i, { titleEn: v })} maxLength={PROMO_TITLE_MAX} />
          </Field>
          <Field
            label="Texto (ES)"
            subtitle={`Obligatorio. ${t.bodyEs.length}/${PROMO_BODY_MAX}`}
            info="El tope es corto a propósito: el post es bilingüe y Telegram corta el pie de una foto en 1024 caracteres. Pasarse convierte la publicación con imagen en una sin ella, sin avisar."
          >
            <TextArea
              value={t.bodyEs}
              onChange={(v) => patchAt(i, { bodyEs: v })}
              maxLength={PROMO_BODY_MAX}
              placeholder="Compite con tus amigos cada jornada."
            />
          </Field>
          <Field label="Texto (EN)" subtitle={`Obligatorio. ${t.bodyEn.length}/${PROMO_BODY_MAX}`}>
            <TextArea
              value={t.bodyEn}
              onChange={(v) => patchAt(i, { bodyEn: v })}
              maxLength={PROMO_BODY_MAX}
              placeholder="Compete with your friends every matchday."
            />
          </Field>
          <CreativeField
            value={t.imageUrl}
            creatives={creatives}
            onChange={(v) => patchAt(i, { imageUrl: v })}
          />
          {(t.bodyEs.trim().length === 0 || t.bodyEn.trim().length === 0) && (
            <p className="text-xs font-sans text-warning pt-1">
              Falta el texto en un idioma: al guardar, esta campaña se descarta.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── content-type card ──────────────────────────────────────────────────────── */

const WEEKDAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** "11, 19" → [11, 19]. Descarta lo que no sea una hora válida. */
function parseHours(text: string): number[] {
  const hours = text
    .split(',')
    .map((s) => Math.trunc(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);
  return Array.from(new Set(hours)).sort((a, b) => a - b);
}

function TypeCard({
  title,
  subtitle,
  info,
  config,
  onChange,
  extra,
  eventDriven = false,
  lockedMode,
  deterministic = false,
}: {
  title: string;
  subtitle?: string;
  info?: React.ReactNode;
  config: ContentTypeConfig;
  onChange: (patch: Partial<ContentTypeConfig>) => void;
  extra?: React.ReactNode;
  /**
   * El tipo se dispara por un HECHO (un gol), no por el reloj. Se ocultan las
   * horas, los días y el prompt: enseñar controles que el backend ignora es
   * peor que no tenerlos — el operador cree haber configurado algo.
   */
  eventDriven?: boolean;
  /**
   * El backend clava el modo de este tipo y rechaza cualquier otro. Se enseña
   * deshabilitado con el motivo al lado, en vez de esconderlo: quien abre la
   * tarjeta tiene que ver QUE hay un modo y POR QUÉ no se puede tocar. Un
   * selector que parece editable y devuelve un 400 al guardar es peor que uno
   * apagado.
   */
  lockedMode?: { mode: PublishMode; reason: string };
  /**
   * El texto de este tipo no pasa por el redactor IA, así que su «Prompt extra»
   * no lo lee nadie. Se oculta en vez de dejarlo inerte (ver
   * {@link DETERMINISTIC_TYPES}).
   */
  deterministic?: boolean;
}) {
  const toggleWeekday = (day: number) => {
    const next = config.weekdays.includes(day)
      ? config.weekdays.filter((d) => d !== day)
      : [...config.weekdays, day].sort((a, b) => a - b);
    // Sin días activos el tipo no publicaría nunca, que es lo mismo que apagarlo
    // pero sin decirlo: se ignora el intento de dejarlo vacío.
    if (next.length > 0) onChange({ weekdays: next });
  };

  return (
    <SectionCard title={title} subtitle={subtitle} info={info}>
      <Field label="Activo" subtitle="Si está apagado, este tipo nunca se publica.">
        <Toggle value={config.enabled} onChange={(v) => onChange({ enabled: v })} />
      </Field>
      <Field
        label="Modo"
        subtitle={lockedMode ? lockedMode.reason : undefined}
        info="Automático publica solo; Con aprobación deja un borrador en la cola."
      >
        <Select
          value={lockedMode ? lockedMode.mode : config.mode}
          options={MODE_OPTIONS}
          onChange={(v) => onChange({ mode: v })}
          disabled={Boolean(lockedMode)}
        />
      </Field>
      {!eventDriven && (
        <>
          <Field
            label="Horas (Bogotá)"
            subtitle="Una o varias, separadas por coma."
            info="Cada hora de la lista es una publicación distinta ese día, siempre que el tipo no haya alcanzado su tope diario. Vacío = no se agenda nunca."
          >
            <TextInput
              value={config.hours.join(', ')}
              onChange={(v) => onChange({ hours: parseHours(v) })}
              placeholder="11, 19"
            />
          </Field>
          <Field
            label="Días"
            subtitle="Días de la semana en los que se publica."
            info="Al menos uno. Quitar todos equivaldría a apagar el tipo sin que el interruptor lo refleje, así que no se permite."
          >
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = config.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    aria-pressed={on}
                    aria-label={`Día ${label}`}
                    className={`w-8 h-8 rounded-md text-xs font-sans font-semibold transition-colors ${
                      on
                        ? 'bg-accent text-bg-primary'
                        : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      )}
      <Field
        label="Tope diario del tipo"
        subtitle="Máximo de publicaciones al día de este tipo."
        info={
          eventDriven
            ? 'Este tipo NO consume el tope global del canal: una tarde de goles no puede dejar sin cupo al resto de la parrilla. Este es su único límite diario.'
            : 'Se aplica además del tope global del canal, nunca en su lugar: un tipo con tope 5 sigue sin poder pasarse del límite global.'
        }
      >
        <NumInput value={config.maxPerDay} onChange={(v) => onChange({ maxPerDay: v })} min={1} max={100} />
      </Field>
      {extra}
      {!eventDriven && !deterministic && (
        <Field label="Prompt extra (opcional)" subtitle="Vacío = por defecto" info="Instrucción adicional para el redactor IA.">
          <TextArea
            value={config.promptOverride ?? ''}
            onChange={(v) => onChange({ promptOverride: v || null })}
            placeholder="Tono, ángulo, énfasis…"
          />
        </Field>
      )}
    </SectionCard>
  );
}

/**
 * El material del medio, al lado de la reescritura que se va a publicar.
 *
 * Aprobar una noticia sin ver el original es aprobar a ciegas: el riesgo de esta
 * fase no es que el modelo escriba mal —eso se ve— sino que cambie el hecho o
 * copie al medio, y las dos cosas solo se detectan comparando. Por eso el
 * original viaja en los hechos aunque nunca se publique.
 *
 * Solo aparece en las noticias; en cualquier otro tipo no hay nada que comparar.
 */
function NewsOriginal({ facts }: { facts?: Record<string, unknown> | null }) {
  if (!facts || facts.kind !== 'news') return null;
  const headline = typeof facts.originalHeadline === 'string' ? facts.originalHeadline : '';
  const excerpt = typeof facts.originalExcerpt === 'string' ? facts.originalExcerpt : '';
  const sourceName = typeof facts.sourceName === 'string' ? facts.sourceName : '';
  const sourceUrl = typeof facts.sourceUrl === 'string' ? facts.sourceUrl : '';
  const hadBody = facts.hadBody === true;
  if (!headline && !excerpt) return null;
  return (
    <details className="mt-3 rounded-xl bg-surface-2 p-3">
      <summary className="text-[11px] text-text-muted font-sans cursor-pointer">
        Material original {sourceName ? `(${sourceName})` : ''}
        {hadBody ? '' : ' · sin cuerpo: la nota sale solo del titular'}
      </summary>
      {headline && (
        <p className="text-xs text-text-secondary font-sans mt-2">
          <span className="text-text-muted">Titular del medio:</span> {headline}
        </p>
      )}
      {excerpt && (
        <pre className="whitespace-pre-wrap text-[11px] text-text-muted font-sans mt-2 max-h-40 overflow-auto">
          {excerpt}
        </pre>
      )}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-[11px] text-primary font-sans mt-2 inline-block break-all"
        >
          Abrir la fuente ↗
        </a>
      )}
    </details>
  );
}

/* ── post card (queue + history) ────────────────────────────────────────────── */

function PostCard({
  post,
  actions,
}: {
  post: TelegramPost;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary font-sans">{TYPE_LABELS[post.contentType] ?? post.contentType}</span>
          <StatusPill status={post.status} />
          {!post.usedLlm && <span className="text-[11px] text-text-muted font-sans">(plantilla)</span>}
        </div>
        <span className="text-[11px] text-text-muted font-sans">
          {post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}
        </span>
      </div>
      <pre className="whitespace-pre-wrap text-xs text-text-secondary font-sans bg-surface-2 rounded-xl p-3 max-h-64 overflow-auto">
        {post.renderedText}
      </pre>
      <NewsOriginal facts={post.factsJson} />
      {post.deepLink && (
        <p className="text-[11px] text-text-muted font-sans mt-2 break-all">CTA: {post.deepLink}</p>
      )}
      {post.errorLog && (
        <p className="text-[11px] text-danger font-sans mt-2">Error: {post.errorLog}</p>
      )}
      {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
    </div>
  );
}

/* ── page ───────────────────────────────────────────────────────────────────── */

export default function TelegramPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TgTabId>('connection');

  /* ── config ── */
  const cfgQ = useQuery<TelegramConfig>({
    queryKey: ['telegram-config'],
    queryFn: () => api.get('/admin/telegram/config'),
  });
  const [form, setForm] = useState<TelegramConfig | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const cfg = form ?? cfgQ.data ?? null;
  const dirty = !!form && !!cfgQ.data && JSON.stringify(form) !== JSON.stringify(cfgQ.data);
  const canSave = (dirty || tokenInput.trim().length > 0) && !!cfg;

  const patch = (p: Partial<TelegramConfig>) => cfg && setForm({ ...cfg, ...p });

  /** La configuración de un tipo, o un default si el backend aún no la sembró. */
  const typeCfg = (type: ContentType): ContentTypeConfig =>
    cfg?.contentTypes.find((t) => t.contentType === type) ?? {
      contentType: type,
      enabled: false,
      mode: 'approval',
      hours: [],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      maxPerDay: 1,
      promptOverride: null,
      settings: {},
    };

  /** Cambia UN tipo dejando los demás intactos. */
  const patchType = (type: ContentType, p: Partial<ContentTypeConfig>) => {
    if (!cfg) return;
    const current = typeCfg(type);
    const next = { ...current, ...p };
    const others = cfg.contentTypes.filter((t) => t.contentType !== type);
    setForm({ ...cfg, contentTypes: [...others, next] });
  };

  /** Cambia un umbral dentro de `settings` sin perder los demás. */
  const patchSetting = (type: ContentType, key: string, value: unknown) =>
    patchType(type, { settings: { ...typeCfg(type).settings, [key]: value } });

  const numSetting = (type: ContentType, key: string, fallback: number): number => {
    const raw = typeCfg(type).settings[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  };

  const boolSetting = (type: ContentType, key: string, fallback: boolean): boolean => {
    const raw = typeCfg(type).settings[key];
    return typeof raw === 'boolean' ? raw : fallback;
  };

  /** Lista de ids (ligas o equipos) de un ajuste, para pasarle su valor actual
   *  a un `LeaguePicker`/`TeamPicker`. Sin entrada válida, lista vacía. */
  const arraySetting = (type: ContentType, key: string): number[] => {
    const raw = typeCfg(type).settings[key];
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
  };

  const saveCfg = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/admin/telegram/config', body),
    onSuccess: () => {
      setForm(null);
      setTokenInput('');
      qc.invalidateQueries({ queryKey: ['telegram-config'] });
    },
  });

  const buildConfigBody = (): Record<string, unknown> => {
    if (!cfg) return {};
    const { botTokenConfigured, publishTimezone, ...rest } = cfg;
    void botTokenConfigured;
    void publishTimezone;
    const body: Record<string, unknown> = { ...rest };
    if (tokenInput.trim().length > 0) body.botToken = tokenInput.trim();
    return body;
  };

  /* ── test connection ── */
  const [testMsg, setTestMsg] = useState<string | null>(null);
  /** Un fallo de la prueba se pinta en rojo: en gris se confunde con una nota. */
  const [testFailed, setTestFailed] = useState(false);
  const testMut = useMutation({
    mutationFn: (send: boolean) => api.post<{ ok: boolean; username: string | null; messageId?: number }>('/admin/telegram/test', { send }),
    onSuccess: (res, send) => {
      setTestFailed(false);
      setTestMsg(
        send
          ? `Mensaje de prueba enviado (id ${res.messageId ?? '?'}). Bot: @${res.username ?? '?'}.`
          : `Conexión OK (el token es válido). Esto NO comprueba el canal: usa «Enviar prueba» para eso. Bot: @${res.username ?? '?'}.`,
      );
    },
    onError: (e) => {
      setTestFailed(true);
      setTestMsg((e as Error)?.message ?? 'Falló la prueba.');
    },
  });

  /* ── compose now ── */
  const [composeType, setComposeType] = useState<ContentType>('match_teaser');
  const [composeMsg, setComposeMsg] = useState<string | null>(null);
  /** Texto de la última vista previa. No existe como fila: solo se ve aquí. */
  const [previewText, setPreviewText] = useState<string | null>(null);
  /** Vale UNA sola vez: publicar/dejar borrador tras generarla reusa este id
   *  y NO vuelve a llamar al modelo. Se descarta al cambiar de tipo o al
   *  fallar el reuso (caducó, ya se usó, o cualquier otro error). */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<ContentType | null>(null);
  const [previewTtlSeconds, setPreviewTtlSeconds] = useState<number | null>(null);

  const discardPreview = () => {
    setPreviewText(null);
    setPreviewId(null);
    setPreviewType(null);
    setPreviewTtlSeconds(null);
  };

  // "Última verdad" de qué tipo está vigente, para que `onSuccess`/`onError`
  // de una mutación YA en vuelo puedan comparar contra el tipo ACTUAL en vez
  // del que tenían cerrado en su closure. TanStack sustituye los callbacks de
  // una mutación pendiente por los del último render: si el admin cambia de
  // A a B mientras A está generando, un `onSuccess` que lea `composeType` de
  // su closure vería 'B' y etiquetaría el texto de A como si fuera de B.
  const composeTypeRef = useRef(composeType);
  useEffect(() => {
    composeTypeRef.current = composeType;
  }, [composeType]);

  const composeMut = useMutation({
    mutationFn: ({ action, reuse, type }: { action: 'preview' | 'draft' | 'publish'; reuse?: boolean; type: ContentType }) => {
      // Reusar SIN id no puede degradar a "componer de cero": el servidor
      // redactaría otro texto con el modelo, sin diálogo de coste, y lo mandaría
      // al canal sin que nadie lo haya leído. Pasa si el panel llega a
      // producción antes que el backend que devuelve `previewId`.
      if (reuse && !previewId) {
        return Promise.reject(new Error('La vista previa ya no es válida. Vuelve a generarla.'));
      }
      return api.post<{ status: string; text: string; usedLlm?: boolean; previewId?: string; previewTtlSeconds?: number }>(
        '/admin/telegram/compose',
        {
          type,
          publish: action === 'publish',
          dryRun: action === 'preview',
          ...(reuse && previewId ? { previewId } : {}),
        },
      );
    },
    onSuccess: (res, vars) => {
      // El admin pudo cambiar de tipo mientras ESTA generación estaba en
      // vuelo: si `vars.type` ya no es el tipo vigente, la respuesta es de un
      // tipo que ya no se está viendo y no debe pisar el estado actual (ni el
      // de un tipo nuevo que se haya generado mientras tanto).
      if (vars.type !== composeTypeRef.current) return;
      if (res.status === 'preview') {
        // La vista previa NO deja fila: antes, cada clic metía un borrador en la
        // cola que había que rechazar a mano solo por haber mirado.
        setPreviewText(res.text);
        setPreviewId(res.previewId ?? null);
        setPreviewType(vars.type);
        setPreviewTtlSeconds(res.previewTtlSeconds ?? null);
        setComposeMsg(res.usedLlm === false ? 'Vista previa (plantilla fija, sin IA).' : 'Vista previa.');
        return;
      }
      discardPreview();
      setComposeMsg(res.status === 'published' ? 'Publicado.' : 'Borrador creado en la cola.');
      qc.invalidateQueries({ queryKey: ['telegram-posts'] });
    },
    onError: (e, vars) => {
      if (vars.type !== composeTypeRef.current) return;
      // Cualquier fallo al REUSAR una vista previa (caducó, ya se usó, o un
      // error de red) la invalida: mejor forzar una generación nueva que
      // reintentar con un previewId que ya no sirve.
      if (vars.reuse) discardPreview();
      setComposeMsg((e as Error)?.message ?? 'No se pudo componer.');
    },
  });

  /** Modelo activo y coste medio de generar con IA, para el diálogo de "esto
   *  gasta tokens". Se carga siempre (no depende de la pestaña): es barata y
   *  así está lista en cuanto se entra a Contenido o a Cola. */
  const llmCostQ = useQuery<{
    model: string;
    llmTypes: string[];
    /** Coste de UNA composición de cada tipo de `llmTypes` (ya resuelto por
     *  tipo — no hace falta elegir bucket copy/news a mano). */
    perType: Record<string, { usd: number | null; samples: number }>;
    // Agregados por familia. Ya no se usan para elegir la estimación del
    // diálogo (eso lo resuelve `perType`); se conservan por completar el contrato.
    perGenerationUsd: { copy: number | null; news: number | null };
    samples: { copy: number; news: number };
  }>({
    queryKey: ['telegram-llm-cost'],
    queryFn: () => api.get('/admin/telegram/llm-cost'),
    staleTime: 5 * 60_000,
  });

  /** Acción pendiente de confirmar por su coste en tokens. `null` = sin diálogo abierto. */
  const [costConfirm, setCostConfirm] = useState<{ type: string; run: () => void } | null>(null);

  /** Ejecuta `run` directo SOLO si consta que `type` no gasta tokens. Falla
   *  CERRADO: mientras no haya datos de coste (cargando, o la consulta falló),
   *  no se sabe si el tipo es gratis o no, así que se pide confirmación
   *  igual — los botones que llaman esto están además deshabilitados
   *  mientras `llmCostQ.isLoading`, así que este camino solo se ejerce si el
   *  fetch llegó a fallar. */
  const runMaybeWithCostConfirm = (type: string, run: () => void) => {
    const llmTypes = llmCostQ.data?.llmTypes;
    if (llmTypes == null || llmTypes.includes(type)) setCostConfirm({ type, run });
    else run();
  };

  /** Cuerpo del diálogo de coste: `perType[tipo]` ya trae el coste resuelto
   *  para ESE tipo (para `news` es la estimación de reescribir un artículo;
   *  para el resto, la de redactar el post). Sin datos de coste (falló la
   *  consulta), se avisa igual en vez de dar por seguro que no cuesta nada. */
  const costConfirmMessage = (): string => {
    if (!costConfirm) return '';
    if (!llmCostQ.data) {
      return 'No se pudo confirmar el coste; esta acción puede gastar tokens.';
    }
    const model = llmCostQ.data.model ?? 'el modelo activo';
    const entry = llmCostQ.data.perType[costConfirm.type];
    if (entry == null || entry.usd == null) {
      return `Cada generación consume tokens del modelo activo (${model}). Aún no hay histórico para estimar el coste.`;
    }
    return `Para redactar el post se usa el modelo de IA activo (${model}). Cada generación cuesta ≈ $${entry.usd.toFixed(4)} (media de las últimas ${entry.samples}).`;
  };

  /* ── posts (queue + history) ── */
  const queueQ = useQuery<PostsPage>({
    queryKey: ['telegram-posts', 'pending_approval'],
    queryFn: () => api.get('/admin/telegram/posts?status=pending_approval'),
    enabled: tab === 'queue',
  });
  const [histType, setHistType] = useState<string>('');
  const historyQ = useQuery<PostsPage>({
    queryKey: ['telegram-posts', 'history', histType],
    queryFn: () => api.get(`/admin/telegram/posts${histType ? `?type=${histType}` : ''}`),
    enabled: tab === 'history',
  });

  /* ── webhook (medición) ── */
  const webhookQ = useQuery<{
    url: string;
    pendingUpdateCount: number;
    lastErrorMessage: string | null;
    secretConfigured: boolean;
    botTokenConfigured: boolean;
  }>({
    queryKey: ['telegram-webhook'],
    queryFn: () => api.get('/admin/telegram/webhook'),
    enabled: tab === 'connection',
    // Sin token de bot el endpoint responde 400: no tiene sentido reintentar.
    retry: false,
  });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const webhookMut = useMutation({
    mutationFn: (action: 'register' | 'delete') =>
      action === 'register'
        ? api.post('/admin/telegram/webhook', { url: webhookUrl.trim() })
        : api.delete('/admin/telegram/webhook'),
    onSuccess: (_res, action) => {
      setWebhookMsg(action === 'register' ? 'Webhook registrado.' : 'Webhook eliminado.');
      qc.invalidateQueries({ queryKey: ['telegram-webhook'] });
    },
    onError: (err: Error) => setWebhookMsg(err.message),
  });

  /* ── creativos del canal ── */
  const creativesQ = useQuery<{ storageConfigured: boolean; items: Creative[] }>({
    queryKey: ['telegram-creatives'],
    queryFn: () => api.get('/admin/telegram/creatives'),
    // También en «Contenido»: el selector de imagen de cada tipo se alimenta de
    // esta lista, así que tiene que estar cargada antes de abrir la galería.
    enabled: tab === 'creatives' || tab === 'content',
  });
  const creatives = creativesQ.data?.items ?? [];
  const [creativeMsg, setCreativeMsg] = useState<string | null>(null);
  const [creativeFailed, setCreativeFailed] = useState(false);

  const uploadCreative = useMutation({
    mutationFn: (file: File) =>
      new Promise<{ url: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          api
            .post<{ url: string }>('/admin/telegram/creatives', {
              name: file.name,
              contentType: file.type,
              imageBase64: result,
            })
            .then(resolve, reject);
        };
        reader.readAsDataURL(file);
      }),
    onSuccess: () => {
      setCreativeFailed(false);
      setCreativeMsg('Creativo subido.');
      qc.invalidateQueries({ queryKey: ['telegram-creatives'] });
    },
    onError: (e: Error) => {
      setCreativeFailed(true);
      setCreativeMsg(e.message);
    },
  });

  const deleteCreative = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/telegram/creatives?key=${encodeURIComponent(key)}`),
    onSuccess: () => {
      setCreativeFailed(false);
      setCreativeMsg('Creativo borrado.');
      qc.invalidateQueries({ queryKey: ['telegram-creatives'] });
    },
    onError: (e: Error) => {
      setCreativeFailed(true);
      setCreativeMsg(e.message);
    },
  });

  /* ── rendimiento por tipo ── */
  const [metricsDays, setMetricsDays] = useState(30);
  const metricsQ = useQuery<{ days: number; rows: TypeMetrics[] }>({
    queryKey: ['telegram-metrics', metricsDays],
    queryFn: () => api.get(`/admin/telegram/metrics?days=${metricsDays}`),
    enabled: tab === 'metrics',
  });

  const postAction = useMutation({
    mutationFn: ({ id, action, promptOverride }: { id: string; action: 'approve' | 'reject' | 'regenerate' | 'publish'; promptOverride?: string }) =>
      api.post(`/admin/telegram/posts/${id}/${action}`, action === 'regenerate' ? { promptOverride } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telegram-posts'] });
    },
  });

  const headerAction = useMemo(() => {
    if (tab === 'connection' || tab === 'content') {
      return (
        <Button variant="primary" size="sm" loading={saveCfg.isPending} disabled={!canSave} onClick={() => saveCfg.mutate(buildConfigBody())}>
          Guardar
        </Button>
      );
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canSave, saveCfg.isPending, cfg, tokenInput]);

  /**
   * Tipos de noticia marcados. Vacío o ausente NO significa "ninguno": el
   * backend vuelve al conjunto por defecto, porque una lista vacía dejaría el
   * tipo mudo para siempre sin dar ningún error. Aquí se refleja igual.
   */
  const newsTypesSelected = ((): string[] => {
    const raw = typeCfg('news').settings.newsTypes;
    const clean = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    return clean.length > 0 ? clean : DEFAULT_NEWS_TYPES;
  })();

  const toggleNewsType = (type: string) => {
    const next = newsTypesSelected.includes(type)
      ? newsTypesSelected.filter((t) => t !== type)
      : [...newsTypesSelected, type];
    // Quitar el último no apaga nada: el backend volvería al conjunto por
    // defecto y el panel enseñaría una selección que no es la real. Se ignora.
    if (next.length > 0) patchSetting('news', 'newsTypes', next);
  };

  /** URL de la imagen configurada para un tipo, si la hay. */
  const imageOf = (type: ContentType): string | null => {
    const raw = typeCfg(type).settings.imageUrl;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  };

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Telegram"
        description="Canal de marketing bilingüe (ES+EN)." info="Inerte hasta configurar token + canal y encender el switch maestro."
        action={headerAction}
      />

      <Tabs value={tab} onChange={(v) => setTab(v as TgTabId)} items={TG_TABS as unknown as { id: string; label: string }[]} />

      {!cfg ? (
        <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
      ) : (
        <>
          {/* ── CONNECTION ── */}
          <div hidden={tab !== 'connection'} role="tabpanel" id="tabpanel-connection" aria-labelledby="tab-connection">
            <SectionCard title="Switch maestro" subtitle="Apagado por default" info="Mientras esté apagado, no se publica nada al canal, ni automático ni manual.">
              <Field label="Canal activo" info="Enciéndelo solo tras probar la conexión y un envío de prueba real.">
                <Toggle value={cfg.enabled} onChange={(v) => patch({ enabled: v })} />
              </Field>
              {cfg.enabled
                ? <p className="text-xs font-sans text-success pt-1">El canal está ON.</p>
                : <p className="text-xs font-sans text-warning pt-1">El canal está OFF — nada se publica.</p>}
            </SectionCard>

            <SectionCard title="Conexión del bot" info="El token se guarda encriptado y nunca se devuelve; aquí solo se ve si está configurado.">
              <Field label="Bot token" subtitle={cfg.botTokenConfigured ? 'Hay un token guardado. Escribe uno nuevo solo si quieres reemplazarlo.' : 'Pega el token de @BotFather.'}>
                <TextInput type="password" value={tokenInput} onChange={setTokenInput} placeholder={cfg.botTokenConfigured ? '•••••••••• (configurado)' : '123456:ABC-…'} />
              </Field>
              <Field label="Channel ID" subtitle="@usuario público o el id numérico -100…">
                <TextInput value={cfg.channelId ?? ''} onChange={(v) => patch({ channelId: v || null })} placeholder="@predictaxi" />
              </Field>
              <Field label="Probar" info="Verifica el token (getMe) y, opcionalmente, envía un mensaje de prueba al canal.">
                <div className="flex gap-2">
                  {/* Deshabilitados mientras haya cambios sin guardar: la prueba
                      usa lo que hay en la BASE, no lo del formulario, así que
                      probar un token recién escrito daría un fallo desconcertante
                      («no configurado» con el campo relleno delante). */}
                  <Button variant="secondary" size="sm" loading={testMut.isPending} disabled={canSave} onClick={() => { setTestMsg(null); testMut.mutate(false); }}>Probar conexión</Button>
                  <Button variant="secondary" size="sm" loading={testMut.isPending} disabled={canSave} onClick={() => { setTestMsg(null); testMut.mutate(true); }}>Enviar prueba</Button>
                </div>
              </Field>
              {canSave && (
                <p className="text-xs text-warning font-sans">
                  Tienes cambios sin guardar. Pulsa <strong>Guardar</strong> antes de probar: la
                  prueba usa la configuración ya guardada, no lo que ves en el formulario.
                </p>
              )}
              {testMsg && (
                <p className={`text-xs font-sans pt-2 ${testFailed ? 'text-danger' : 'text-text-secondary'}`}>
                  {testMsg}
                </p>
              )}
            </SectionCard>

            <SectionCard title="Idioma del canal" info="Bilingüe = un canal con ES+EN en cada post. Separado = ES a un canal y EN a otro.">
              <Field label="Modo" subtitle="Separado requiere un segundo canal abajo.">
                <Select<ChannelMode>
                  value={cfg.channelMode}
                  options={[{ value: 'bilingual', label: 'Bilingüe (un canal)' }, { value: 'split', label: 'Separado (ES / EN)' }]}
                  onChange={(v) => patch({ channelMode: v })}
                />
              </Field>
              {cfg.channelMode === 'split' && (
                <Field label="Channel ID (EN)" subtitle="Canal donde se publica el bloque en inglés.">
                  <TextInput value={cfg.channelIdEn ?? ''} onChange={(v) => patch({ channelIdEn: v || null })} placeholder="@predictaxi_en" />
                </Field>
              )}
            </SectionCard>

            <SectionCard title="Enlace (CTA) y tarjetas" info="El botón del post lleva a este enlace; opcionalmente con utm para medir clics.">
              <Field label="CTA URL" subtitle="Vacío = landing por defecto.">
                <TextInput value={cfg.ctaUrl ?? ''} onChange={(v) => patch({ ctaUrl: v || null })} placeholder="https://predicta-xi.online" />
              </Field>
              <Field label="Tracking UTM" info="Añade utm_source/medium/campaign al CTA para medir conversión.">
                <Toggle value={cfg.ctaUtmEnabled} onChange={(v) => patch({ ctaUtmEnabled: v })} />
              </Field>
              <Field label="Tarjetas con 2 escudos" subtitle="Requiere B2" info="Compone una imagen con los escudos local/visitante. Si falla, usa el logo de liga.">
                <Toggle value={cfg.cardImagesEnabled} onChange={(v) => patch({ cardImagesEnabled: v })} />
              </Field>
            </SectionCard>

            <SectionCard title="Límites y retención" info="Tope diario de publicaciones automáticas y limpieza del historial.">
              <Field label="Máx. posts/día" subtitle="Tope de publicaciones automáticas por día.">
                <NumInput value={cfg.maxPostsPerDay} onChange={(v) => patch({ maxPostsPerDay: v })} min={1} max={50} />
              </Field>
              <Field label="Retención (días)" subtitle="Borra lo más viejo · 0 = guardar siempre" info="Borra el historial de posts más viejo que N días.">
                <NumInput value={cfg.historyRetentionDays} onChange={(v) => patch({ historyRetentionDays: v })} min={0} max={3650} />
              </Field>
              <Field label="Zona horaria" subtitle="Fija en America/Bogota (UTC−5).">
                <span className="text-sm text-text-muted font-sans">{cfg.publishTimezone}</span>
              </Field>
            </SectionCard>

            <SectionCard
              title="Webhook (medición)"
              info="Telegram avisa aquí cuando alguien reacciona a una publicación o vota en una encuesta. Sin webhook el canal publica igual, pero la pestaña Rendimiento se queda vacía. Requiere que el bot sea ADMINISTRADOR del canal y que TELEGRAM_WEBHOOK_SECRET esté puesto en el servidor."
            >
              <Field label="Estado" subtitle="URL registrada en Telegram ahora mismo.">
                <span className="text-sm font-sans text-text-secondary break-all">
                  {webhookQ.isLoading
                    ? 'Cargando…'
                    : webhookQ.data?.url
                      ? webhookQ.data.url
                      : 'Sin registrar'}
                </span>
              </Field>
              {/* Por qué no se puede registrar todavía. Sin este bloque el botón
                  sale deshabilitado y no hay forma de saber qué falta. */}
              {webhookQ.data && !webhookQ.data.secretConfigured && (
                <p className="text-xs text-danger font-sans">
                  Falta <code>TELEGRAM_WEBHOOK_SECRET</code> en el servidor: el receptor rechazaría
                  todos los updates, así que no se puede registrar todavía. Ponlo en las variables de
                  entorno de la app <strong>Backend</strong> en Dokploy y vuelve a desplegar.
                </p>
              )}
              {webhookQ.data && !webhookQ.data.botTokenConfigured && (
                <p className="text-xs text-warning font-sans">
                  Falta el <strong>bot token</strong> (arriba, en «Conexión del bot»): registrar el
                  webhook es una llamada a Telegram como el bot, así que sin token no se puede.
                </p>
              )}
              {webhookQ.isError && (
                <p className="text-xs text-danger font-sans">
                  No se pudo leer el estado del webhook: {(webhookQ.error as Error)?.message}
                </p>
              )}
              {webhookQ.data?.lastErrorMessage && (
                <p className="text-xs text-warning font-sans">
                  Último error de Telegram: {webhookQ.data.lastErrorMessage}
                </p>
              )}
              <Field label="URL pública" subtitle="Debe ser https y terminar en /telegram/webhook.">
                <TextInput
                  value={webhookUrl}
                  onChange={setWebhookUrl}
                  placeholder="https://predictaxi-api.supo-services.online/telegram/webhook"
                />
              </Field>
              <Field label="Acciones" subtitle="">
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={webhookMut.isPending}
                    disabled={!webhookQ.data?.secretConfigured || !webhookQ.data?.botTokenConfigured}
                    onClick={() => webhookMut.mutate('register')}
                  >
                    Registrar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={webhookMut.isPending}
                    onClick={() => webhookMut.mutate('delete')}
                  >
                    Quitar
                  </Button>
                </div>
              </Field>
              {webhookMsg && <p className="text-xs font-sans text-text-secondary pt-2">{webhookMsg}</p>}
            </SectionCard>
          </div>

          {/* ── CONTENT ── */}
          <div hidden={tab !== 'content'} role="tabpanel" id="tabpanel-content" aria-labelledby="tab-content">
            <SectionCard
              title="Componer ahora"
              info="Genera un post al instante, ignorando el horario. En los tipos redactados por IA, «Ver cómo queda» gasta tokens al generar el texto; una vez generada la vista previa, publicarla o dejarla como borrador NO vuelve a gastar — usa exactamente ese texto, sin redactar otro. «Volver a generar» sí cuenta como una nueva generación."
            >
              {llmCostQ.isError && (
                <p className="text-xs font-sans text-warning pb-2">
                  No se pudo cargar el coste de generación — se pedirá confirmación de todas formas antes de gastar tokens.
                </p>
              )}
              <Field label="Tipo" subtitle="Qué post componer.">
                <Select<ContentType>
                  value={composeType}
                  options={COMPOSABLE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                  disabled={composeMut.isPending}
                  onChange={(t) => {
                    setComposeType(t);
                    discardPreview();
                    setComposeMsg(null);
                    setCostConfirm(null);
                  }}
                />
              </Field>
              <Field label="Acción" subtitle="">
                {previewText && previewId && previewType === composeType ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={composeMut.isPending}
                      onClick={() => { setComposeMsg(null); composeMut.mutate({ action: 'publish', reuse: true, type: composeType }); }}
                    >
                      Publicar esta versión
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={composeMut.isPending}
                      onClick={() => { setComposeMsg(null); composeMut.mutate({ action: 'draft', reuse: true, type: composeType }); }}
                    >
                      Guardar como borrador
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={composeMut.isPending}
                      disabled={llmCostQ.isLoading}
                      onClick={() => runMaybeWithCostConfirm(composeType, () => { setComposeMsg(null); composeMut.mutate({ action: 'preview', type: composeType }); })}
                    >
                      Volver a generar
                    </Button>
                    {previewTtlSeconds != null && (
                      <span className="text-[11px] text-text-muted font-sans">Vale {Math.max(1, Math.round(previewTtlSeconds / 60))} min.</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={composeMut.isPending}
                      disabled={llmCostQ.isLoading}
                      onClick={() => runMaybeWithCostConfirm(composeType, () => { setComposeMsg(null); composeMut.mutate({ action: 'preview', type: composeType }); })}
                    >
                      Ver cómo queda
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={composeMut.isPending}
                      disabled={llmCostQ.isLoading}
                      onClick={() => runMaybeWithCostConfirm(composeType, () => { setComposeMsg(null); composeMut.mutate({ action: 'draft', type: composeType }); })}
                    >
                      Dejar borrador
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={composeMut.isPending}
                      disabled={llmCostQ.isLoading}
                      onClick={() => runMaybeWithCostConfirm(composeType, () => { setComposeMsg(null); composeMut.mutate({ action: 'publish', type: composeType }); })}
                    >
                      Publicar ahora
                    </Button>
                    {llmCostQ.data && !llmCostQ.data.llmTypes.includes(composeType) && (
                      <span className="text-[11px] text-text-muted font-sans">Plantilla fija, sin coste de IA.</span>
                    )}
                  </div>
                )}
              </Field>
              {composeMsg && <p className="text-xs font-sans text-text-secondary pt-2">{composeMsg}</p>}
              {previewText && (
                <pre className="whitespace-pre-wrap text-xs text-text-secondary font-sans bg-surface-2 rounded-xl p-3 mt-2 max-h-80 overflow-auto">
                  {previewText}
                </pre>
              )}
            </SectionCard>

            <TypeCard
              title="Recap diario"
              info="Cuántos pronósticos acertó la IA en el día, con desglose por liga."
              config={typeCfg('match_recap')}
              onChange={(p) => patchType('match_recap', p)}
              extra={
                <Field label="Mín. pronósticos" subtitle="No publica si hay menos de N liquidados ese día.">
                  <NumInput
                    value={numSetting('match_recap', 'minFacts', 1)}
                    onChange={(v) => patchSetting('match_recap', 'minFacts', v)}
                    min={1}
                    max={100}
                  />
                </Field>
              }
            />

            <TypeCard
              title="Balance semanal"
              info="Aciertos de los últimos 7 días. Su día ya no está fijado en el código: se elige aquí, en «Días» (por defecto, domingo)."
              config={typeCfg('weekly_recap')}
              onChange={(p) => patchType('weekly_recap', p)}
              extra={
                <Field label="Mín. pronósticos" subtitle="No publica si hay menos de N liquidados en la semana.">
                  <NumInput
                    value={numSetting('weekly_recap', 'minFacts', 3)}
                    onChange={(v) => patchSetting('weekly_recap', 'minFacts', v)}
                    min={1}
                    max={500}
                  />
                </Field>
              }
            />

            <TypeCard
              title="Tablas"
              subtitle="Top-5 de las ligas configuradas al cierre del día."
              config={typeCfg('standings_recap')}
              onChange={(p) => patchType('standings_recap', p)}
              extra={
                <Field label="Ligas" subtitle="Vacío = ligas destacadas.">
                  <LeaguePicker
                    value={arraySetting('standings_recap', 'leagueIds')}
                    onChange={(v) => patchSetting('standings_recap', 'leagueIds', v.length > 0 ? v : null)}
                    emptyStateText="Vacío = ligas destacadas."
                    showSelectAll={false}
                  />
                </Field>
              }
            />

            <TypeCard
              title="Partidazo"
              subtitle="El partido marquee del día con el pronóstico principal."
              config={typeCfg('match_teaser')}
              onChange={(p) => patchType('match_teaser', p)}
            />

            <TypeCard
              title="Pick gratis"
              subtitle="El pronóstico de mayor confianza del día, como gancho."
              config={typeCfg('free_pick')}
              onChange={(p) => patchType('free_pick', p)}
              extra={
                <Field label="Confianza mínima" subtitle="Solo publica si el mejor pick supera este %.">
                  <NumInput
                    value={numSetting('free_pick', 'minConfidence', 60)}
                    onChange={(v) => patchSetting('free_pick', 'minConfidence', v)}
                    min={1}
                    max={95}
                  />
                </Field>
              }
            />

            <TypeCard
              title="Goles en vivo"
              subtitle="Avisa en el canal cada vez que cae un gol."
              info="Se dispara por el gol, no por el reloj, así que no tiene horario. Solo cubre las ligas que ESPN sigue y que actives abajo. El texto es fijo (marcador, goleador y minuto): no pasa por el redactor IA para que salga en segundos y nadie pueda reescribir un marcador."
              config={typeCfg('goal')}
              onChange={(p) => patchType('goal', p)}
              eventDriven
              extra={
                <>
                  <Field
                    label="Modo sombra"
                    subtitle="Detecta y registra, pero NO publica."
                    info="Déjalo encendido durante una jornada completa antes de abrir el canal: sirve para comparar los goles detectados con los reales sin que el canal diga nada. Apágalo cuando la lista cuadre."
                  >
                    <Toggle
                      value={boolSetting('goal', 'shadowMode', true)}
                      onChange={(v) => patchSetting('goal', 'shadowMode', v)}
                    />
                  </Field>
                  <Field
                    label="Ligas"
                    subtitle="VACÍO = no publica ningún gol."
                    info="Es una lista de permitidos, no un filtro opcional: sin ninguna liga aquí, el tipo no publica nada aunque esté encendido. Solo funcionan las ligas que ESPN cubre (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Champions League)."
                  >
                    <LeaguePicker
                      value={arraySetting('goal', 'leagueIds')}
                      onChange={(v) => patchSetting('goal', 'leagueIds', v)}
                      emptyStateText="VACÍO = no publica ningún gol."
                    />
                  </Field>
                  <Field
                    label="Equipos"
                    subtitle="Vacío = todos los de esas ligas."
                    info="Al revés que las ligas: aquí vacío NO restringe. Con equipos puestos, solo se publica el gol si uno de los dos del partido está en la lista."
                  >
                    <TeamPicker
                      value={arraySetting('goal', 'teamIds')}
                      onChange={(v) => patchSetting('goal', 'teamIds', v)}
                    />
                  </Field>
                  <Field
                    label="Equipos populares"
                    subtitle="Suma los N más marcados como favoritos. 0 = apagado."
                    info="Se calculan cada madrugada a partir de los favoritos de los usuarios y se suman a la lista manual de arriba. OJO con la asimetría: si la lista manual está vacía, poner un número aquí NO amplía la cobertura, la ACOTA a esos equipos. Con 0 el filtro es exactamente la lista manual."
                  >
                    <NumInput
                      value={numSetting('goal', 'popularTeamsCount', 0)}
                      onChange={(v) => patchSetting('goal', 'popularTeamsCount', v)}
                      min={0}
                      max={100}
                    />
                  </Field>
                  <Field
                    label="Tope por partido"
                    subtitle="Máximo de goles publicados de un mismo encuentro."
                    info="Evita que un 5-0 se lleve la tarde entera del canal."
                  >
                    <NumInput
                      value={numSetting('goal', 'maxPerMatch', 3)}
                      onChange={(v) => patchSetting('goal', 'maxPerMatch', v)}
                      min={1}
                      max={20}
                    />
                  </Field>
                </>
              }
            />

            <TypeCard
              title="Agenda del día"
              subtitle="Los partidos analizados que aún no han empezado."
              info="Sale por la mañana y lista solo lo que queda por jugar. Enseña la confianza del análisis principal de cada partido, nunca cuál es el pronóstico: eso está en la app."
              config={typeCfg('today_matches')}
              onChange={(p) => patchType('today_matches', p)}
              extra={
                <>
                  <Field label="Máx. partidos" subtitle="Los que caben en la lista; el resto se cuentan como «y N más».">
                    <NumInput
                      value={numSetting('today_matches', 'maxMatches', 8)}
                      onChange={(v) => patchSetting('today_matches', 'maxMatches', v)}
                      min={1}
                      max={30}
                    />
                  </Field>
                  <Field
                    label="Ligas"
                    subtitle="Vacío = todas las ligas activas."
                    info="Al revés que en los goles: aquí vacío NO restringe, publica con todas las ligas activas."
                  >
                    <LeaguePicker
                      value={arraySetting('today_matches', 'leagueIds')}
                      onChange={(v) => patchSetting('today_matches', 'leagueIds', v)}
                      emptyStateText="Vacío = todas las ligas activas."
                    />
                  </Field>
                  <CreativeField
                    value={imageOf('today_matches')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('today_matches', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Cierre del día"
              subtitle="Marcadores finales y qué tal le fue a la IA."
              info="El balance va en el MISMO mensaje que los marcadores, no aparte: es lo que hace que se lea como transparencia y no como publicidad. Un partido sin predicción sale con su marcador y sin marca de acierto."
              config={typeCfg('day_results')}
              onChange={(p) => patchType('day_results', p)}
              extra={
                <>
                  <Field label="Máx. partidos" subtitle="Cuántos marcadores caben en el mensaje.">
                    <NumInput
                      value={numSetting('day_results', 'maxMatches', 10)}
                      onChange={(v) => patchSetting('day_results', 'maxMatches', v)}
                      min={1}
                      max={30}
                    />
                  </Field>
                  <Field
                    label="Ligas"
                    subtitle="Vacío = todas las ligas activas."
                  >
                    <LeaguePicker
                      value={arraySetting('day_results', 'leagueIds')}
                      onChange={(v) => patchSetting('day_results', 'leagueIds', v)}
                      emptyStateText="Vacío = todas las ligas activas."
                    />
                  </Field>
                  <CreativeField
                    value={imageOf('day_results')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('day_results', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Final del partido"
              subtitle="Marcador, goleadores y mejor jugador al terminar."
              info="Se dispara cuando el partido acaba, no por el reloj. El mejor del partido sale de las notas de jugador: si esa captura está apagada o la fuente no publica notas de esa liga, el mensaje sale igual pero SIN esa línea — no se inventa. Como los goles, este tipo no consume el tope global del canal."
              config={typeCfg('match_result')}
              onChange={(p) => patchType('match_result', p)}
              eventDriven
              extra={
                <>
                  <Field
                    label="Ligas"
                    subtitle="VACÍO = no publica ningún resultado."
                    info="Es una lista de permitidos, igual que en los goles: sin ninguna liga aquí el tipo no publica nada aunque esté encendido."
                  >
                    <LeaguePicker
                      value={arraySetting('match_result', 'leagueIds')}
                      onChange={(v) => patchSetting('match_result', 'leagueIds', v)}
                      emptyStateText="VACÍO = no publica ningún resultado."
                    />
                  </Field>
                  <Field
                    label="Equipos"
                    subtitle="Vacío = todos los de esas ligas."
                  >
                    <TeamPicker
                      value={arraySetting('match_result', 'teamIds')}
                      onChange={(v) => patchSetting('match_result', 'teamIds', v)}
                    />
                  </Field>
                  <Field
                    label="Equipos populares"
                    subtitle="Suma los N más marcados como favoritos. 0 = apagado."
                    info="Igual que en los goles: se calculan cada madrugada desde los favoritos de los usuarios y se suman a la lista manual. Con la lista manual vacía, poner un número aquí ACOTA a esos equipos en vez de ampliar."
                  >
                    <NumInput
                      value={numSetting('match_result', 'popularTeamsCount', 0)}
                      onChange={(v) => patchSetting('match_result', 'popularTeamsCount', v)}
                      min={0}
                      max={100}
                    />
                  </Field>
                </>
              }
            />

            <TypeCard
              title="Combinada del día"
              subtitle="Una pata destapada; el resto, en la app."
              info="Se destapa SIEMPRE una sola pata, la de mayor confianza, y no es configurable: destapar dos regala el producto. Debajo va la combinada de ayer ya liquidada, como prueba. Si la de ayer sigue pendiente, ese bloque no sale."
              config={typeCfg('combinada_teaser')}
              onChange={(p) => patchType('combinada_teaser', p)}
              extra={
                <>
                  <Field
                    label="Alcance"
                    subtitle="Qué combinada se destapa."
                    info="La semanal se guarda con la fecha del lunes de su ventana, así que esto cambia la combinada que se lee, no solo la etiqueta."
                  >
                    <Select<'daily' | 'weekly'>
                      value={typeCfg('combinada_teaser').settings.scope === 'weekly' ? 'weekly' : 'daily'}
                      options={[
                        { value: 'daily', label: 'La del día' },
                        { value: 'weekly', label: 'La de la semana' },
                      ]}
                      onChange={(v) => patchSetting('combinada_teaser', 'scope', v)}
                    />
                  </Field>
                  <CreativeField
                    value={imageOf('combinada_teaser')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('combinada_teaser', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Aciertos de la semana"
              subtitle="Los que fueron contra el mercado, con el balance real."
              info="Los aciertos NO se eligen por confianza sino por mérito: gana el que el mercado veía menos probable. El balance completo de la semana va en el MISMO mensaje — es lo que separa esto de un anuncio, y si el redactor IA se lo deja fuera, el post sale con la plantilla fija en vez de con su texto."
              config={typeCfg('weekly_top_picks')}
              onChange={(p) => patchType('weekly_top_picks', p)}
              extra={
                <>
                  <Field
                    label="Mín. aciertos"
                    subtitle="No publica si la semana no dejó al menos N."
                    info="Una semana floja no tiene por qué tener post. Con menos aciertos que este número, el tipo se calla."
                  >
                    <NumInput
                      value={numSetting('weekly_top_picks', 'minPicks', 3)}
                      onChange={(v) => patchSetting('weekly_top_picks', 'minPicks', v)}
                      min={1}
                      max={10}
                    />
                  </Field>
                  <Field label="Máx. aciertos" subtitle="Cuántos se listan como mucho.">
                    <NumInput
                      value={numSetting('weekly_top_picks', 'maxPicks', 5)}
                      onChange={(v) => patchSetting('weekly_top_picks', 'maxPicks', v)}
                      min={1}
                      max={10}
                    />
                  </Field>
                  {numSetting('weekly_top_picks', 'minPicks', 3) > numSetting('weekly_top_picks', 'maxPicks', 5) && (
                    <p className="text-xs font-sans text-warning pt-1">
                      El mínimo es mayor que el máximo: se usará el máximo como mínimo.
                    </p>
                  )}
                  <CreativeField
                    value={imageOf('weekly_top_picks')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('weekly_top_picks', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Promoción"
              subtitle="Campañas escritas aquí, rotadas por peso."
              info="El texto sale TAL CUAL lo escribas: este tipo no pasa por el redactor IA, porque una campaña aprobada no se reescribe sola. La imagen de cada campaña manda sobre la del tipo."
              config={typeCfg('promo')}
              onChange={(p) => patchType('promo', p)}
              deterministic
              extra={
                <>
                  <PromoTemplatesEditor
                    templates={readTemplates(typeCfg('promo').settings)}
                    creatives={creatives}
                    onChange={(next) => patchSetting('promo', 'templates', next)}
                  />
                  <CreativeField
                    value={imageOf('promo')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('promo', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Encuesta"
              subtitle="Sobre el partido destacado del día."
              info="Salen DOS encuestas, una por idioma: una encuesta no se puede partir en bloques como un mensaje de texto. En modo separado, cada una va a su canal. Se cierran solas al empezar el partido. Nota: solo se miden los votos de la española — Telegram manda los totales en absoluto y dos encuestas sobre la misma publicación se pisarían los contadores."
              config={typeCfg('poll')}
              onChange={(p) => patchType('poll', p)}
              deterministic
              extra={
                <>
                  <Field
                    label="Ligas"
                    subtitle="Vacío = todas las activas."
                    info="Al revés que en los goles: aquí vacío NO restringe."
                  >
                    <LeaguePicker
                      value={arraySetting('poll', 'leagueIds')}
                      onChange={(v) => patchSetting('poll', 'leagueIds', v)}
                      emptyStateText="Vacío = todas las activas."
                    />
                  </Field>
                  <Field
                    label="Margen mínimo (minutos)"
                    subtitle="Cuánto tiene que faltar para el saque."
                    info="Una encuesta que cierra en cinco minutos no la vota nadie. Si al partido destacado le queda menos que esto, se elige otro; si no queda ninguno, ese día no hay encuesta."
                  >
                    <NumInput
                      value={numSetting('poll', 'minLeadMinutes', 60)}
                      onChange={(v) => patchSetting('poll', 'minLeadMinutes', v)}
                      min={5}
                      max={1440}
                    />
                  </Field>
                </>
              }
            />

            <TypeCard
              title="Dato curioso"
              subtitle="Una racha real de un equipo que juega hoy."
              info="Se calcula sobre el historial, sin IA: si ningún equipo del día llega al umbral, no se publica nada. Es deliberado — «ganó 2 de los últimos 5» no es un dato curioso. Los amistosos no cuentan para las rachas."
              config={typeCfg('fun_fact')}
              onChange={(p) => patchType('fun_fact', p)}
              deterministic
              extra={
                <>
                  <Field
                    label="Ligas"
                    subtitle="Vacío = todas las activas."
                    info="Al revés que en los goles: aquí vacío NO restringe."
                  >
                    <LeaguePicker
                      value={arraySetting('fun_fact', 'leagueIds')}
                      onChange={(v) => patchSetting('fun_fact', 'leagueIds', v)}
                      emptyStateText="Vacío = todas las activas."
                    />
                  </Field>
                  <CreativeField
                    value={imageOf('fun_fact')}
                    creatives={creatives}
                    onChange={(v) => patchSetting('fun_fact', 'imageUrl', v)}
                  />
                </>
              }
            />

            <TypeCard
              title="Noticias"
              subtitle="Una noticia de fútbol al día, reescrita y con enlace al medio."
              info="Nunca se publica el texto del medio: se escribe un titular propio y dos o tres frases con el hecho, y el enlace a la fuente es obligatorio. Ese enlace sale limpio, sin parámetros de medición — es dominio ajeno y ahí no se mide nada."
              config={typeCfg('news')}
              onChange={(p) => patchType('news', p)}
              deterministic
              lockedMode={{
                mode: 'approval',
                reason: 'Clavado en aprobación: es el único tipo que digiere texto de terceros y nada sale sin que lo leas.',
              }}
              extra={
                <>
                  <Field
                    label="Qué noticias"
                    subtitle="Al menos una. Quitar todas volvería al conjunto por defecto."
                    info="El criterio del canal NO es el de las predicciones: un fichaje cerrado no cambia quién juega el sábado y es la mejor noticia del día. «Otras» abre la puerta a rumores y declaraciones: sube el volumen y baja la calidad."
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {NEWS_TYPES.map((t) => {
                        const on = newsTypesSelected.includes(t.value);
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => toggleNewsType(t.value)}
                            aria-pressed={on}
                            className={`px-3 h-8 rounded-md text-xs font-sans font-semibold transition-colors ${
                              on
                                ? 'bg-accent text-bg-primary'
                                : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field
                    label="Ventana (horas)"
                    subtitle="Antigüedad máxima de la noticia."
                    info="Más atrás deja de ser actualidad, aunque el canal lleve días sin publicar. El tope es una semana."
                  >
                    <NumInput
                      value={numSetting('news', 'windowHours', 72)}
                      onChange={(v) => patchSetting('news', 'windowHours', v)}
                      min={1}
                      max={168}
                    />
                  </Field>
                  <Field
                    label="Ligas"
                    subtitle="Vacío = todas."
                    info="Al revés que en los goles: aquí vacío NO restringe. Filtra por los equipos que juegan esas competiciones."
                  >
                    <LeaguePicker
                      value={arraySetting('news', 'leagueIds')}
                      onChange={(v) => patchSetting('news', 'leagueIds', v)}
                      emptyStateText="Vacío = todas."
                    />
                  </Field>
                  <Field
                    label="Equipos"
                    subtitle="Vacío = todos."
                    info="Para seguir solo a unos clubes concretos. Vacío NO restringe."
                  >
                    <TeamPicker
                      value={arraySetting('news', 'teamIds')}
                      onChange={(v) => patchSetting('news', 'teamIds', v)}
                    />
                  </Field>
                  {/* Sin campo de imagen: el pie de una foto de Telegram son 1.024
                      caracteres para el post bilingüe entero, y la línea de fuente
                      obligatoria no deja sitio. Con imagen configurada, el envío
                      degradaría a texto y la perdería siempre, en silencio. */}
                </>
              }
            />
          </div>

          {/* ── CREATIVOS ── */}
          <div hidden={tab !== 'creatives'} role="tabpanel" id="tabpanel-creatives" aria-labelledby="tab-creatives">
            <SectionCard
              title="Imágenes del canal"
              subtitle="Se suben aquí y se eligen en cada tipo de publicación."
              info="Se guardan en el almacenamiento propio y se sirven por el mismo proxy que los escudos. Solo PNG, JPEG o WebP, hasta 2 MB. El formato que mejor se ve en Telegram es 1200×630."
            >
              {creativesQ.data && !creativesQ.data.storageConfigured ? (
                <p className="text-xs text-danger font-sans">
                  Falta la configuración de almacenamiento (variables <code>B2_*</code>) en el
                  servidor: sin ella no se pueden subir imágenes.
                </p>
              ) : (
                <Field label="Subir" subtitle="PNG, JPEG o WebP · máx. 2 MB.">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadCreative.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // El input se limpia siempre: sin esto, volver a elegir el
                      // mismo archivo tras un fallo no dispara ningún evento.
                      e.target.value = '';
                      if (file) {
                        setCreativeMsg(null);
                        uploadCreative.mutate(file);
                      }
                    }}
                    className="text-sm text-text-secondary font-sans"
                  />
                </Field>
              )}
              {creativeMsg && (
                <p className={`text-xs font-sans pt-2 ${creativeFailed ? 'text-danger' : 'text-text-secondary'}`}>
                  {creativeMsg}
                </p>
              )}
            </SectionCard>

            {creativesQ.isLoading ? (
              <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
            ) : creatives.length === 0 ? (
              <p className="text-text-muted text-sm font-sans py-3">Todavía no has subido ninguna imagen.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {creatives.map((c) => (
                  <div
                    key={c.key}
                    className="rounded-2xl p-4"
                    style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-32 object-cover rounded-xl mb-3"
                    />
                    <p className="text-xs text-text-secondary font-sans break-all mb-1">
                      {c.key.replace('telegram/creatives/', '')}
                    </p>
                    <p className="text-[11px] text-text-muted font-sans mb-3">
                      {Math.round(c.size / 1024)} KB
                      {c.lastModified ? ` · ${new Date(c.lastModified).toLocaleDateString()}` : ''}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleteCreative.isPending}
                      onClick={() => {
                        setCreativeMsg(null);
                        deleteCreative.mutate(c.key);
                      }}
                    >
                      Borrar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── QUEUE ── */}

          <div hidden={tab !== 'queue'} role="tabpanel" id="tabpanel-queue" aria-labelledby="tab-queue">
            <p className="text-xs text-text-muted font-sans mb-4 flex items-center gap-1.5">
              Borradores pendientes de aprobación.
              <InfoPopover label="Qué llega a la cola">
                Solo aterrizan aquí los tipos configurados en modo «Con aprobación»; los de modo
                «Automático» se publican solos y no pasan por la cola.
              </InfoPopover>
            </p>
            {queueQ.isLoading ? (
              <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
            ) : (queueQ.data?.items.length ?? 0) === 0 ? (
              <p className="text-text-muted text-sm font-sans py-3">No hay borradores pendientes.</p>
            ) : (
              queueQ.data!.items.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  actions={
                    <>
                      <Button variant="primary" size="sm" loading={postAction.isPending} onClick={() => postAction.mutate({ id: post.id, action: 'approve' })}>Aprobar y publicar</Button>
                      {/* Regenerar rehace el texto desde los MISMOS hechos: en un
                          tipo determinista sale idéntico. Un botón que no cambia
                          nada y tampoco falla es peor que no tenerlo. */}
                      {!DETERMINISTIC_TYPES.has(post.contentType) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={postAction.isPending}
                          disabled={llmCostQ.isLoading}
                          onClick={() => runMaybeWithCostConfirm(post.contentType, () => postAction.mutate({ id: post.id, action: 'regenerate' }))}
                        >
                          Regenerar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" loading={postAction.isPending} onClick={() => postAction.mutate({ id: post.id, action: 'reject' })}>Rechazar</Button>
                    </>
                  }
                />
              ))
            )}
            {postAction.isError && (
              <p className="text-xs text-danger font-sans">{(postAction.error as Error)?.message}</p>
            )}
          </div>

          {/* ── HISTORY ── */}
          <div hidden={tab !== 'history'} role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
            <div className="mb-4">
              <Select<string>
                value={histType}
                options={[{ value: '', label: 'Todos los tipos' }, ...CONTENT_TYPES.map((t) => ({ value: t as string, label: TYPE_LABELS[t] ?? t }))]}
                onChange={setHistType}
              />
            </div>
            {historyQ.isLoading ? (
              <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
            ) : (historyQ.data?.items.length ?? 0) === 0 ? (
              <p className="text-text-muted text-sm font-sans py-3">Sin historial.</p>
            ) : (
              historyQ.data!.items.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  actions={
                    post.status === 'failed' ? (
                      <Button variant="secondary" size="sm" loading={postAction.isPending} onClick={() => postAction.mutate({ id: post.id, action: 'publish' })}>Reintentar publicación</Button>
                    ) : undefined
                  }
                />
              ))
            )}
          </div>

          {/* ── RENDIMIENTO ── */}
          <div hidden={tab !== 'metrics'} role="tabpanel" id="tabpanel-metrics" aria-labelledby="tab-metrics">
            <p className="text-xs text-text-muted font-sans mb-4 flex items-center gap-1.5">
              Qué tipo de publicación funciona mejor.
              <InfoPopover label="Qué se mide y qué no">
                Se miden <strong>reacciones</strong> y <strong>votos de encuesta</strong>, que llegan
                por el webhook, y los clics se atribuyen aparte con los parámetros <code>utm_*</code> de
                cada enlace. Las <strong>vistas por publicación no se pueden medir</strong>: la Bot API
                de Telegram no las expone (viven en MTProto). Las verás bajo cada mensaje en Telegram,
                pero no aquí.
              </InfoPopover>
            </p>

            <div className="flex gap-2 mb-4">
              {[7, 30, 90].map((d) => (
                <Button
                  key={d}
                  variant={metricsDays === d ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setMetricsDays(d)}
                >
                  {d} días
                </Button>
              ))}
            </div>

            {metricsQ.isLoading ? (
              <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
            ) : (metricsQ.data?.rows.length ?? 0) === 0 ? (
              <p className="text-text-muted text-sm font-sans py-3">
                Todavía no hay publicaciones en esta ventana.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="text-text-muted text-xs border-b border-border">
                      <th className="text-left py-2 pr-3">Tipo</th>
                      <th className="text-right py-2 px-3">Publicaciones</th>
                      <th className="text-right py-2 px-3">Reacciones</th>
                      <th className="text-right py-2 px-3">Votos</th>
                      <th className="text-right py-2 pl-3">Por publicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricsQ.data!.rows.map((row, i, all) => {
                      // El cuartil bajo es lo que sobra en la parrilla: se marca
                      // para que la decisión de apagar no dependa de comparar
                      // números a ojo.
                      const isBottomQuartile = all.length >= 4 && i >= Math.ceil(all.length * 0.75);
                      return (
                        <tr
                          key={row.contentType}
                          className={`border-b border-border/50 ${isBottomQuartile ? 'text-text-muted' : ''}`}
                        >
                          <td className="py-2 pr-3">
                            {TYPE_LABELS[row.contentType as ContentType] ?? row.contentType}
                            {isBottomQuartile && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-warning">
                                bajo
                              </span>
                            )}
                          </td>
                          <td className="text-right py-2 px-3 tabular-nums">{row.posts}</td>
                          <td className="text-right py-2 px-3 tabular-nums">{row.reactions}</td>
                          <td className="text-right py-2 px-3 tabular-nums">{row.pollVotes}</td>
                          <td className="text-right py-2 pl-3 tabular-nums font-semibold">
                            {row.engagementPerPost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {saveCfg.isError && (
            <p className="text-xs text-danger font-sans mt-2">{(saveCfg.error as Error)?.message}</p>
          )}

          <ConfirmDialog
            open={costConfirm != null}
            title="Esto gasta tokens"
            message={costConfirmMessage()}
            confirmLabel="Generar"
            cancelLabel="Cancelar"
            loading={composeMut.isPending || postAction.isPending}
            onConfirm={() => {
              const run = costConfirm?.run;
              setCostConfirm(null);
              run?.();
            }}
            onClose={() => setCostConfirm(null)}
          />
        </>
      )}
    </div>
  );
}
