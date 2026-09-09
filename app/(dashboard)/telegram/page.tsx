'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';

/* ── tabs ───────────────────────────────────────────────────────────────────── */

const TG_TABS = [
  { id: 'connection', label: 'Conexión' },
  { id: 'content', label: 'Contenido' },
  { id: 'queue', label: 'Cola' },
  { id: 'history', label: 'Historial' },
  { id: 'metrics', label: 'Rendimiento' },
] as const;
type TgTabId = typeof TG_TABS[number]['id'];

/* ── config contract (mirrors backend TelegramConfigData / PUT input) ───────── */

type PublishMode = 'auto' | 'approval';
type ChannelMode = 'bilingual' | 'split';

const CONTENT_TYPES = ['match_recap', 'weekly_recap', 'standings_recap', 'match_teaser', 'free_pick', 'goal'] as const;
type ContentType = typeof CONTENT_TYPES[number];

/**
 * Tipos que se pueden componer a mano desde «Componer ahora».
 *
 * `goal` no está: sus hechos los trae una incidencia real de un partido en
 * curso, no un builder al que se le pueda pedir uno de la nada. Pedirlo
 * devolvería un 422 del backend.
 */
const COMPOSABLE_TYPES = ['match_recap', 'weekly_recap', 'standings_recap', 'match_teaser', 'free_pick'] as const;

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
  manual: 'Manual',
};

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

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans resize-none"
    />
  );
}

function Select<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
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
      <Field label="Modo" info="Automático publica solo; Con aprobación deja un borrador en la cola.">
        <Select value={config.mode} options={MODE_OPTIONS} onChange={(v) => onChange({ mode: v })} />
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
      {!eventDriven && (
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

  const idListText = (type: ContentType, key: string): string => {
    const raw = typeCfg(type).settings[key];
    return Array.isArray(raw) ? raw.join(', ') : '';
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
  const composeMut = useMutation({
    mutationFn: (publish: boolean) =>
      api.post<{ status: string; text: string }>('/admin/telegram/compose', { type: composeType, publish }),
    onSuccess: (res) => {
      setComposeMsg(res.status === 'published' ? 'Publicado.' : 'Borrador creado en la cola.');
      qc.invalidateQueries({ queryKey: ['telegram-posts'] });
    },
    onError: (e) => setComposeMsg((e as Error)?.message ?? 'No se pudo componer.'),
  });

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

  /* ── listas de ids escritas a mano (tablas, goles) ── */
  const parseIdList = (raw: string): number[] | null => {
    const ids = raw
      .split(/[\s,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? Array.from(new Set(ids)) : null;
  };
  // Tablas: `null` = volver a las ligas destacadas. Goles: la lista vacía es un
  // valor con significado propio (no publicar nada), así que ahí se manda `[]`.
  const leagueIdsText = idListText('standings_recap', 'leagueIds');
  const goalLeagueIdsText = idListText('goal', 'leagueIds');
  const goalTeamIdsText = idListText('goal', 'teamIds');

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
            <SectionCard title="Componer ahora" info="Genera un post al instante, ignorando el horario. “Previsualizar” lo deja como borrador en la Cola; “Publicar” lo manda directo.">
              <Field label="Tipo" subtitle="Qué post componer.">
                <Select<ContentType>
                  value={composeType}
                  options={COMPOSABLE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                  onChange={setComposeType}
                />
              </Field>
              <Field label="Acción" subtitle="">
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" loading={composeMut.isPending} onClick={() => { setComposeMsg(null); composeMut.mutate(false); }}>Previsualizar (borrador)</Button>
                  <Button variant="primary" size="sm" loading={composeMut.isPending} onClick={() => { setComposeMsg(null); composeMut.mutate(true); }}>Publicar ahora</Button>
                </div>
              </Field>
              {composeMsg && <p className="text-xs font-sans text-text-secondary pt-2">{composeMsg}</p>}
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
                <Field label="Ligas (apiFootballId)" subtitle="IDs separados por coma. Vacío = ligas destacadas.">
                  <TextInput
                    value={leagueIdsText}
                    onChange={(v) => patchSetting('standings_recap', 'leagueIds', parseIdList(v))}
                    placeholder="39, 140, 135"
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
                    label="Ligas (apiFootballId)"
                    subtitle="IDs separados por coma. VACÍO = no publica ningún gol."
                    info="Es una lista de permitidos, no un filtro opcional: sin ninguna liga aquí, el tipo no publica nada aunque esté encendido. Solo funcionan las ligas que ESPN cubre (39 Premier, 140 LaLiga, 135 Serie A, 78 Bundesliga, 61 Ligue 1, 88 Eredivisie, 94 Primeira, 2 Champions)."
                  >
                    <TextInput
                      value={goalLeagueIdsText}
                      onChange={(v) => patchSetting('goal', 'leagueIds', parseIdList(v) ?? [])}
                      placeholder="39, 140"
                    />
                  </Field>
                  <Field
                    label="Equipos (id interno)"
                    subtitle="IDs separados por coma. Vacío = todos los de esas ligas."
                    info="Al revés que las ligas: aquí vacío NO restringe. Con equipos puestos, solo se publica el gol si uno de los dos del partido está en la lista."
                  >
                    <TextInput
                      value={goalTeamIdsText}
                      onChange={(v) => patchSetting('goal', 'teamIds', parseIdList(v) ?? [])}
                      placeholder="11, 22"
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
                      <Button variant="secondary" size="sm" loading={postAction.isPending} onClick={() => postAction.mutate({ id: post.id, action: 'regenerate' })}>Regenerar</Button>
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
        </>
      )}
    </div>
  );
}
