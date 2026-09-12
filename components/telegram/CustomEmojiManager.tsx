'use client';

/**
 * Catálogo de emojis del canal: uno por equipo, uno por competición y los que se
 * nombran a mano para cabeceras.
 *
 * ## El aviso de elegibilidad no es decorativo
 *
 * Telegram NO deja a cualquier bot publicar emojis personalizados. En chats
 * privados, grupos y supergrupos basta con que el dueño del bot tenga Premium
 * (Bot API 9.4), pero los CANALES quedan fuera de esa excepción: ahí el bot
 * necesita haber comprado un nombre de usuario en Fragment.
 *
 * No hay ninguna consulta que responda "¿puede este bot?". Solo se sabe
 * enviando, y un bot no elegible que emite `<tg-emoji>` recibe un 400 y NO
 * publica el mensaje entero. Por eso el interruptor nace apagado y al lado tiene
 * un botón que manda un mensaje real al canal y lo borra: es la única
 * comprobación honesta, y encenderlo a ciegas deja el canal mudo.
 *
 * Una fila SIN id y con respaldo sigue siendo útil: asignar 🇫🇷 a la Ligue 1 no
 * necesita ni Premium ni Fragment y ya mejora el mensaje.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/inputs';
import { Field, Toggle } from '@/components/ui/form-controls';
import { TeamPicker } from '@/components/pickers/TeamPicker';
import { useToast } from '@/components/ui/ToastProvider';

type Scope = 'team' | 'league' | 'named';

interface EmojiRow {
  id: number;
  scope: Scope;
  refId: number | null;
  name: string | null;
  emojiId: string | null;
  fallback: string;
  label: string;
}

interface EmojiResponse {
  items: EmojiRow[];
  customEmojiEnabled: boolean;
}

interface CompetitionOption {
  id: number;
  name: string;
  country: string | null;
  active: boolean;
}

const SCOPE_LABEL: Record<Scope, string> = {
  team: 'Equipo',
  league: 'Competición',
  named: 'Nombre propio',
};

export function CustomEmojiManager() {
  const qc = useQueryClient();
  const toast = useToast();

  const [scope, setScope] = useState<Scope>('league');
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [leagueId, setLeagueId] = useState<string>('');
  const [name, setName] = useState('');
  const [emojiId, setEmojiId] = useState('');
  const [fallback, setFallback] = useState('');
  const [testId, setTestId] = useState('');
  const [testResult, setTestResult] = useState<{ eligible: boolean; message: string } | null>(null);

  const emojisQ = useQuery<EmojiResponse>({
    queryKey: ['telegram-custom-emojis'],
    queryFn: () => api.get('/admin/telegram/custom-emojis'),
  });
  const competitionsQ = useQuery<CompetitionOption[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
    staleTime: 60_000,
  });

  const rows = useMemo(() => emojisQ.data?.items ?? [], [emojisQ.data]);
  const grouped = useMemo(
    () => ({
      named: rows.filter((r) => r.scope === 'named'),
      league: rows.filter((r) => r.scope === 'league'),
      team: rows.filter((r) => r.scope === 'team'),
    }),
    [rows],
  );

  const saveM = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/admin/telegram/custom-emojis', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telegram-custom-emojis'] });
      setTeamIds([]);
      setLeagueId('');
      setName('');
      setEmojiId('');
      setFallback('');
      toast.success('Emoji guardado.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (row: EmojiRow) => {
      const params = new URLSearchParams({ scope: row.scope });
      if (row.scope === 'named') params.set('name', row.name ?? '');
      else params.set('refId', String(row.refId));
      return api.delete(`/admin/telegram/custom-emojis?${params.toString()}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telegram-custom-emojis'] });
      toast.success('Emoji quitado.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (value: boolean) => api.put('/admin/telegram/config', { customEmojiEnabled: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telegram-custom-emojis'] });
      void qc.invalidateQueries({ queryKey: ['telegram-config'] });
      void qc.invalidateQueries({ queryKey: ['telegram-templates'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testM = useMutation<{ eligible: boolean; message: string }, Error>({
    mutationFn: () => api.post('/admin/telegram/custom-emojis/test', { emojiId: testId, fallback: '⚽' }),
    onSuccess: (data) => setTestResult(data),
    onError: (e: Error) => setTestResult({ eligible: false, message: e.message }),
  });

  const canAdd =
    (scope === 'team' && teamIds.length > 0) ||
    (scope === 'league' && leagueId !== '') ||
    (scope === 'named' && name.trim().length > 0);

  const submit = () => {
    saveM.mutate({
      scope,
      refId: scope === 'team' ? teamIds[teamIds.length - 1] : scope === 'league' ? Number(leagueId) : null,
      name: scope === 'named' ? name.trim() : null,
      emojiId: emojiId.trim() === '' ? null : emojiId.trim(),
      fallback,
    });
  };

  const enabled = emojisQ.data?.customEmojiEnabled ?? false;

  return (
    <Card
      title="Emojis del canal"
      subtitle={`${rows.length} asignados · personalizados ${enabled ? 'activados' : 'desactivados'}`}
      info={
        <>
          <p>
            Cada equipo y cada competición puede tener su emoji. Las plantillas lo pintan con{' '}
            <code>{'{{homeEmoji}}'}</code>, <code>{'{{leagueEmoji}}'}</code> o, los de nombre propio, con{' '}
            <code>{'{{emoji.nombre}}'}</code>.
          </p>
          <p className="mt-2">
            Un emoji <strong>normal</strong> (una bandera, un escudo) funciona siempre: basta con rellenar el respaldo
            y dejar el id vacío. El id solo hace falta para los emojis personalizados de Telegram Premium.
          </p>
        </>
      }
    >
      {/* Interruptor + elegibilidad */}
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 mb-4">
        <p className="text-xs font-sans text-text-secondary leading-relaxed">
          <strong className="text-warning">Antes de activarlos.</strong> En un <strong>canal</strong>, Telegram solo
          deja usar emojis personalizados si el bot compró un nombre de usuario en{' '}
          <a
            href="https://fragment.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Fragment
          </a>
          . Tener Telegram Premium en tu cuenta <strong>no basta</strong>: esa excepción solo cubre chats privados,
          grupos y supergrupos. Un bot que no puede recibe un error de Telegram y{' '}
          <strong>el mensaje entero no se publica</strong>.
        </p>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-sans text-text-muted mb-1">
              Id de un emoji personalizado para la prueba
            </label>
            <Input
              value={testId}
              onChange={(e) => setTestId(e.target.value.replace(/\D/g, ''))}
              placeholder="5368324170671202286"
              inputMode="numeric"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => testM.mutate()}
            disabled={testId.length === 0 || testM.isPending}
            loading={testM.isPending}
          >
            Probar en el canal
          </Button>
        </div>
        <p className="text-[11px] font-sans text-text-muted/60 mt-1.5">
          Envía un mensaje real al canal y lo borra enseguida.
        </p>
        {testResult && (
          <p
            className={cn(
              'text-xs font-sans mt-2 leading-relaxed',
              testResult.eligible ? 'text-success' : 'text-danger',
            )}
          >
            {testResult.message}
          </p>
        )}
      </div>

      <Field
        label="Usar emojis personalizados"
        subtitle="Apagado = solo los respaldos normales."
        info="Con el interruptor apagado no se emite ni una etiqueta <tg-emoji>, así que un bot no elegible sigue publicando con normalidad. Enciéndelo solo cuando la prueba de arriba salga bien."
      >
        <Toggle value={enabled} onChange={(v) => toggleM.mutate(v)} disabled={toggleM.isPending} />
      </Field>

      {/* Alta */}
      <div className="mt-4 rounded-xl border border-border bg-surface-2/40 p-3">
        <p className="text-[11px] font-sans font-semibold uppercase tracking-wider text-text-secondary mb-2.5">
          Añadir o cambiar
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] gap-3 items-start">
          <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </Select>

          {scope === 'team' && (
            <TeamPicker value={teamIds} onChange={(v) => setTeamIds(v.slice(-1))} placeholder="Buscar equipo…" />
          )}
          {scope === 'league' && (
            <Select value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
              <option value="">Elige una competición…</option>
              {(competitionsQ.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.country ? ` · ${c.country}` : ''}
                  </option>
                ))}
            </Select>
          )}
          {scope === 'named' && (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="programacion — se usa como {{emoji.programacion}}"
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_auto] gap-3 items-end mt-3">
          <div>
            <label className="block text-[11px] font-sans text-text-muted mb-1">
              Id del emoji personalizado (opcional)
            </label>
            <Input
              value={emojiId}
              onChange={(e) => setEmojiId(e.target.value.replace(/\D/g, ''))}
              placeholder="Solo dígitos. Vacío = solo el respaldo."
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="block text-[11px] font-sans text-text-muted mb-1">Respaldo</label>
            <Input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="🇫🇷" maxLength={16} />
          </div>
          <Button onClick={submit} disabled={!canAdd || saveM.isPending} loading={saveM.isPending}>
            Guardar
          </Button>
        </div>
        <p className="text-[11px] font-sans text-text-muted/60 mt-2">
          Deja el id y el respaldo vacíos para quitar la asignación.
        </p>
      </div>

      {/* Listado */}
      {emojisQ.isLoading ? (
        <p className="text-xs text-text-muted/60 font-sans mt-4">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-muted/60 font-sans mt-4">
          Todavía no hay ninguno. Las variables de emoji de las plantillas saldrán vacías.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {(['named', 'league', 'team'] as const).map((s) =>
            grouped[s].length === 0 ? null : (
              <div key={s}>
                <p className="text-[11px] font-sans font-semibold uppercase tracking-wider text-text-muted/70 mb-1.5">
                  {SCOPE_LABEL[s]} ({grouped[s].length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {grouped[s].map((row) => (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2 h-8"
                    >
                      <span className="text-base leading-none">{row.fallback || '·'}</span>
                      <span className="text-xs font-sans text-text-secondary">{row.label}</span>
                      {row.emojiId && (
                        <span
                          className="text-[10px] font-mono text-accent/80"
                          title={`Emoji personalizado ${row.emojiId}`}
                        >
                          premium
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeM.mutate(row)}
                        aria-label={`Quitar ${row.label}`}
                        className="text-text-muted hover:text-danger text-sm leading-none px-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </Card>
  );
}
