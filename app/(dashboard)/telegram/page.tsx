'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';

/* ── tabs ───────────────────────────────────────────────────────────────────── */

const TG_TABS = [
  { id: 'connection', label: 'Conexión' },
  { id: 'content', label: 'Contenido' },
  { id: 'queue', label: 'Cola' },
  { id: 'history', label: 'Historial' },
] as const;
type TgTabId = typeof TG_TABS[number]['id'];

/* ── config contract (mirrors backend TelegramConfigData / PUT input) ───────── */

type PublishMode = 'auto' | 'approval';
type ChannelMode = 'bilingual' | 'split';

const CONTENT_TYPES = ['match_recap', 'weekly_recap', 'standings_recap', 'match_teaser', 'free_pick'] as const;
type ContentType = typeof CONTENT_TYPES[number];

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
  matchRecapEnabled: boolean;
  matchRecapMode: PublishMode;
  matchRecapHour: number;
  matchRecapPromptOverride: string | null;
  matchRecapMinFacts: number;
  weeklyRecapEnabled: boolean;
  weeklyRecapMode: PublishMode;
  weeklyRecapHour: number;
  weeklyRecapPromptOverride: string | null;
  weeklyRecapMinFacts: number;
  standingsRecapEnabled: boolean;
  standingsRecapMode: PublishMode;
  standingsRecapHour: number;
  standingsRecapPromptOverride: string | null;
  standingsRecapLeagueIds: number[] | null;
  matchTeaserEnabled: boolean;
  matchTeaserMode: PublishMode;
  matchTeaserHour: number;
  matchTeaserPromptOverride: string | null;
  freePickEnabled: boolean;
  freePickMode: PublishMode;
  freePickHour: number;
  freePickPromptOverride: string | null;
  freePickMinConfidence: number;
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

function TypeCard({
  title,
  subtitle,
  enabled,
  mode,
  hour,
  prompt,
  onChange,
  extra,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  mode: PublishMode;
  hour: number;
  prompt: string | null;
  onChange: (patch: Record<string, unknown>) => void;
  extra?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <Field label="Activo" subtitle="Si está apagado, este tipo nunca se publica.">
        <Toggle value={enabled} onChange={(v) => onChange({ enabled: v })} />
      </Field>
      <Field label="Modo" subtitle="Automático publica solo; Con aprobación deja un borrador en la cola.">
        <Select value={mode} options={MODE_OPTIONS} onChange={(v) => onChange({ mode: v })} />
      </Field>
      <Field label="Hora (Bogotá)" subtitle="Hora 0–23 a la que se publica (zona del canal).">
        <NumInput value={hour} onChange={(v) => onChange({ hour: v })} min={0} max={23} />
      </Field>
      {extra}
      <Field label="Prompt extra (opcional)" subtitle="Instrucción adicional para el redactor IA. Vacío = comportamiento por defecto.">
        <TextArea value={prompt ?? ''} onChange={(v) => onChange({ promptOverride: v })} placeholder="Tono, ángulo, énfasis…" />
      </Field>
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
  const testMut = useMutation({
    mutationFn: (send: boolean) => api.post<{ ok: boolean; username: string | null; messageId?: number }>('/admin/telegram/test', { send }),
    onSuccess: (res, send) => {
      setTestMsg(
        send
          ? `Mensaje de prueba enviado (id ${res.messageId ?? '?'}). Bot: @${res.username ?? '?'}.`
          : `Conexión OK. Bot: @${res.username ?? '?'}.`,
      );
    },
    onError: (e) => setTestMsg((e as Error)?.message ?? 'Falló la prueba.'),
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

  /* ── league ids text helper (standings) ── */
  const leagueIdsText = (cfg?.standingsRecapLeagueIds ?? []).join(', ');
  const parseLeagueIds = (raw: string): number[] | null => {
    const ids = raw
      .split(/[\s,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? Array.from(new Set(ids)) : null;
  };

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Telegram"
        description="Canal de marketing bilingüe (ES+EN). Inerte hasta configurar token + canal y encender el switch maestro."
        action={headerAction}
      />

      <Tabs value={tab} onChange={(v) => setTab(v as TgTabId)} items={TG_TABS as unknown as { id: string; label: string }[]} />

      {!cfg ? (
        <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
      ) : (
        <>
          {/* ── CONNECTION ── */}
          <div hidden={tab !== 'connection'} role="tabpanel" id="tabpanel-connection" aria-labelledby="tab-connection">
            <SectionCard title="Switch maestro" subtitle="Apagado por default. Mientras esté apagado, no se publica nada al canal, ni automático ni manual.">
              <Field label="Canal activo" subtitle="Enciéndelo solo tras probar la conexión y un envío de prueba real.">
                <Toggle value={cfg.enabled} onChange={(v) => patch({ enabled: v })} />
              </Field>
              {cfg.enabled
                ? <p className="text-xs font-sans text-success pt-1">El canal está ON.</p>
                : <p className="text-xs font-sans text-warning pt-1">El canal está OFF — nada se publica.</p>}
            </SectionCard>

            <SectionCard title="Conexión del bot" subtitle="El token se guarda encriptado y nunca se devuelve; aquí solo se ve si está configurado.">
              <Field label="Bot token" subtitle={cfg.botTokenConfigured ? 'Hay un token guardado. Escribe uno nuevo solo si quieres reemplazarlo.' : 'Pega el token de @BotFather.'}>
                <TextInput type="password" value={tokenInput} onChange={setTokenInput} placeholder={cfg.botTokenConfigured ? '•••••••••• (configurado)' : '123456:ABC-…'} />
              </Field>
              <Field label="Channel ID" subtitle="@usuario público o el id numérico -100…">
                <TextInput value={cfg.channelId ?? ''} onChange={(v) => patch({ channelId: v || null })} placeholder="@predictaxi" />
              </Field>
              <Field label="Probar" subtitle="Verifica el token (getMe) y, opcionalmente, envía un mensaje de prueba al canal.">
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" loading={testMut.isPending} onClick={() => { setTestMsg(null); testMut.mutate(false); }}>Probar conexión</Button>
                  <Button variant="secondary" size="sm" loading={testMut.isPending} onClick={() => { setTestMsg(null); testMut.mutate(true); }}>Enviar prueba</Button>
                </div>
              </Field>
              {testMsg && <p className="text-xs font-sans text-text-secondary pt-2">{testMsg}</p>}
            </SectionCard>

            <SectionCard title="Idioma del canal" subtitle="Bilingüe = un canal con ES+EN en cada post. Separado = ES a un canal y EN a otro.">
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

            <SectionCard title="Enlace (CTA) y tarjetas" subtitle="El botón del post lleva a este enlace; opcionalmente con utm para medir clics.">
              <Field label="CTA URL" subtitle="Vacío = landing por defecto.">
                <TextInput value={cfg.ctaUrl ?? ''} onChange={(v) => patch({ ctaUrl: v || null })} placeholder="https://predicta-xi.online" />
              </Field>
              <Field label="Tracking UTM" subtitle="Añade utm_source/medium/campaign al CTA para medir conversión.">
                <Toggle value={cfg.ctaUtmEnabled} onChange={(v) => patch({ ctaUtmEnabled: v })} />
              </Field>
              <Field label="Tarjetas con 2 escudos" subtitle="Compone una imagen con los escudos local/visitante (requiere almacenamiento B2). Si falla, usa el logo de liga.">
                <Toggle value={cfg.cardImagesEnabled} onChange={(v) => patch({ cardImagesEnabled: v })} />
              </Field>
            </SectionCard>

            <SectionCard title="Límites y retención" subtitle="Tope diario de publicaciones automáticas y limpieza del historial.">
              <Field label="Máx. posts/día" subtitle="Tope de publicaciones automáticas por día.">
                <NumInput value={cfg.maxPostsPerDay} onChange={(v) => patch({ maxPostsPerDay: v })} min={1} max={50} />
              </Field>
              <Field label="Retención (días)" subtitle="Borra el historial más viejo que N días. 0 = guardar siempre.">
                <NumInput value={cfg.historyRetentionDays} onChange={(v) => patch({ historyRetentionDays: v })} min={0} max={3650} />
              </Field>
              <Field label="Zona horaria" subtitle="Fija en America/Bogota (UTC−5).">
                <span className="text-sm text-text-muted font-sans">{cfg.publishTimezone}</span>
              </Field>
            </SectionCard>
          </div>

          {/* ── CONTENT ── */}
          <div hidden={tab !== 'content'} role="tabpanel" id="tabpanel-content" aria-labelledby="tab-content">
            <SectionCard title="Componer ahora" subtitle="Genera un post al instante (ignora el horario). “Previsualizar” lo deja como borrador en la Cola; “Publicar” lo manda directo.">
              <Field label="Tipo" subtitle="Qué post componer.">
                <Select<ContentType>
                  value={composeType}
                  options={CONTENT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
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
              subtitle="Cuántos pronósticos acertó la IA en el día, con desglose por liga."
              enabled={cfg.matchRecapEnabled}
              mode={cfg.matchRecapMode}
              hour={cfg.matchRecapHour}
              prompt={cfg.matchRecapPromptOverride}
              onChange={(p) => patch({
                ...(p.enabled !== undefined && { matchRecapEnabled: p.enabled as boolean }),
                ...(p.mode !== undefined && { matchRecapMode: p.mode as PublishMode }),
                ...(p.hour !== undefined && { matchRecapHour: p.hour as number }),
                ...(p.promptOverride !== undefined && { matchRecapPromptOverride: (p.promptOverride as string) || null }),
              })}
              extra={
                <Field label="Mín. pronósticos" subtitle="No publica si hay menos de N liquidados ese día.">
                  <NumInput value={cfg.matchRecapMinFacts} onChange={(v) => patch({ matchRecapMinFacts: v })} min={1} max={100} />
                </Field>
              }
            />

            <TypeCard
              title="Balance semanal"
              subtitle="Aciertos de los últimos 7 días. Se publica los domingos a su hora."
              enabled={cfg.weeklyRecapEnabled}
              mode={cfg.weeklyRecapMode}
              hour={cfg.weeklyRecapHour}
              prompt={cfg.weeklyRecapPromptOverride}
              onChange={(p) => patch({
                ...(p.enabled !== undefined && { weeklyRecapEnabled: p.enabled as boolean }),
                ...(p.mode !== undefined && { weeklyRecapMode: p.mode as PublishMode }),
                ...(p.hour !== undefined && { weeklyRecapHour: p.hour as number }),
                ...(p.promptOverride !== undefined && { weeklyRecapPromptOverride: (p.promptOverride as string) || null }),
              })}
              extra={
                <Field label="Mín. pronósticos" subtitle="No publica si hay menos de N liquidados en la semana.">
                  <NumInput value={cfg.weeklyRecapMinFacts} onChange={(v) => patch({ weeklyRecapMinFacts: v })} min={1} max={500} />
                </Field>
              }
            />

            <TypeCard
              title="Tablas"
              subtitle="Top-5 de las ligas configuradas al cierre del día."
              enabled={cfg.standingsRecapEnabled}
              mode={cfg.standingsRecapMode}
              hour={cfg.standingsRecapHour}
              prompt={cfg.standingsRecapPromptOverride}
              onChange={(p) => patch({
                ...(p.enabled !== undefined && { standingsRecapEnabled: p.enabled as boolean }),
                ...(p.mode !== undefined && { standingsRecapMode: p.mode as PublishMode }),
                ...(p.hour !== undefined && { standingsRecapHour: p.hour as number }),
                ...(p.promptOverride !== undefined && { standingsRecapPromptOverride: (p.promptOverride as string) || null }),
              })}
              extra={
                <Field label="Ligas (apiFootballId)" subtitle="IDs separados por coma. Vacío = ligas destacadas.">
                  <TextInput value={leagueIdsText} onChange={(v) => patch({ standingsRecapLeagueIds: parseLeagueIds(v) })} placeholder="39, 140, 135" />
                </Field>
              }
            />

            <TypeCard
              title="Partidazo"
              subtitle="El partido marquee del día con el pronóstico principal."
              enabled={cfg.matchTeaserEnabled}
              mode={cfg.matchTeaserMode}
              hour={cfg.matchTeaserHour}
              prompt={cfg.matchTeaserPromptOverride}
              onChange={(p) => patch({
                ...(p.enabled !== undefined && { matchTeaserEnabled: p.enabled as boolean }),
                ...(p.mode !== undefined && { matchTeaserMode: p.mode as PublishMode }),
                ...(p.hour !== undefined && { matchTeaserHour: p.hour as number }),
                ...(p.promptOverride !== undefined && { matchTeaserPromptOverride: (p.promptOverride as string) || null }),
              })}
            />

            <TypeCard
              title="Pick gratis"
              subtitle="El pronóstico de mayor confianza del día, como gancho."
              enabled={cfg.freePickEnabled}
              mode={cfg.freePickMode}
              hour={cfg.freePickHour}
              prompt={cfg.freePickPromptOverride}
              onChange={(p) => patch({
                ...(p.enabled !== undefined && { freePickEnabled: p.enabled as boolean }),
                ...(p.mode !== undefined && { freePickMode: p.mode as PublishMode }),
                ...(p.hour !== undefined && { freePickHour: p.hour as number }),
                ...(p.promptOverride !== undefined && { freePickPromptOverride: (p.promptOverride as string) || null }),
              })}
              extra={
                <Field label="Confianza mínima" subtitle="Solo publica si el mejor pick supera este %.">
                  <NumInput value={cfg.freePickMinConfidence} onChange={(v) => patch({ freePickMinConfidence: v })} min={1} max={95} />
                </Field>
              }
            />
          </div>

          {/* ── QUEUE ── */}
          <div hidden={tab !== 'queue'} role="tabpanel" id="tabpanel-queue" aria-labelledby="tab-queue">
            <p className="text-xs text-text-muted font-sans mb-4">Borradores pendientes de aprobación (tipos en modo “Con aprobación”).</p>
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

          {saveCfg.isError && (
            <p className="text-xs text-danger font-sans mt-2">{(saveCfg.error as Error)?.message}</p>
          )}
        </>
      )}
    </div>
  );
}
