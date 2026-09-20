'use client';

/**
 * Pestaña «Rivalidades»: las parejas de equipos que hacen partidazo aunque la
 * clasificación no lo diga (Milan–Inter a media tabla sigue siendo el partido de
 * la jornada).
 *
 * Es una de las tres señales con las que el canal puntúa el «Partidazo de hoy»;
 * las otras dos —clasificación y fase del torneo— salen solas de los datos. La
 * exigencia (la nota mínima para publicar) se ajusta en la tarjeta «Partidazo»
 * de la pestaña «Contenido».
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/inputs';
import { Field } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TeamPicker } from '@/components/pickers/TeamPicker';
import { useToast } from '@/components/ui/ToastProvider';

const LABEL_MAX = 60;

/** Un equipo de una rivalidad, ya resuelto por el backend. `name: null` = ya no existe. */
interface RivalryTeam {
  id: number;
  name: string | null;
  logo: string | null;
  country: string | null;
}

/** Espejo de `GET /admin/telegram/rivalries`. */
interface Rivalry {
  id: number;
  label: string | null;
  teamA: RivalryTeam;
  teamB: RivalryTeam;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface Draft {
  /** `null` = rivalidad nueva. */
  id: number | null;
  label: string;
  teamIds: number[];
}

const QUERY_KEY = ['telegram-rivalries'] as const;

function teamName(team: RivalryTeam): string {
  return team.name ?? `Equipo #${team.id} (no encontrado)`;
}

function TeamCrest({ team }: { team: RivalryTeam }) {
  if (!team.logo) return <span className="w-6 h-6 rounded-sm bg-surface-3" title={teamName(team)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={team.logo} alt="" title={teamName(team)} className="w-6 h-6 object-contain rounded-sm" />;
}

export function RivalriesManager() {
  const qc = useQueryClient();
  const toast = useToast();

  const rivalriesQ = useQuery<{ items: Rivalry[] }>({
    queryKey: QUERY_KEY,
    queryFn: () => api.get('/admin/telegram/rivalries'),
    staleTime: 30_000,
  });
  const rivalries = rivalriesQ.data?.items ?? [];

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Rivalry | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const saveM = useMutation({
    mutationFn: (d: Draft) => {
      const body = { teamAId: d.teamIds[0], teamBId: d.teamIds[1], label: d.label.trim() };
      return d.id === null
        ? api.post('/admin/telegram/rivalries', body)
        : api.put(`/admin/telegram/rivalries/${d.id}`, body);
    },
    onSuccess: (_res, d) => {
      void refresh();
      setDraft(null);
      toast.success(d.id === null ? 'Rivalidad creada.' : 'Rivalidad guardada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/telegram/rivalries/${id}`),
    onSuccess: () => {
      void refresh();
      setDeleting(null);
      toast.success('Rivalidad borrada.');
    },
    onError: (e: Error) => {
      setDeleting(null);
      toast.error(e.message);
    },
  });

  // Exactamente dos equipos: una rivalidad es una pareja, no una lista.
  const canSave = !!draft && draft.teamIds.length === 2 && !saveM.isPending;

  return (
    <>
      <Card
        className="mb-4"
        title="Derbis y clásicos"
        subtitle="Parejas de equipos que hacen partidazo aunque la tabla diga otra cosa."
        info="Cada pareja declarada aquí suma en la nota del «Partidazo de hoy», y por sí sola llega a la exigencia por defecto: un derbi a media tabla se publica igual. El orden de los equipos da igual — la pareja es la misma juegue quien juegue en casa — y no se puede declarar dos veces. Borrar una rivalidad no rompe nada: solo deja de sumar. La exigencia mínima se ajusta en Contenido → tarjeta «Partidazo»."
        action={
          !draft && (
            <Button size="sm" variant="primary" onClick={() => setDraft({ id: null, label: '', teamIds: [] })}>
              <Plus size={14} aria-hidden />
              Nueva rivalidad
            </Button>
          )
        }
      >
        {draft && (
          <div className="rounded-xl border border-primary/30 bg-surface-2/50 px-4 py-1 mb-4">
            <Field
              label="Los dos equipos"
              subtitle={
                draft.teamIds.length === 2
                  ? 'Listo: una pareja.'
                  : `Elige ${2 - draft.teamIds.length} equipo${draft.teamIds.length === 1 ? '' : 's'} más.`
              }
            >
              <TeamPicker value={draft.teamIds} onChange={(v) => setDraft({ ...draft, teamIds: v.slice(-2) })} />
            </Field>
            <Field label="Cómo se llama" subtitle={`Opcional. Máx. ${LABEL_MAX} caracteres.`}>
              <Input
                value={draft.label}
                maxLength={LABEL_MAX}
                placeholder="Ej.: El Clásico"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-end gap-2 py-3">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saveM.isPending}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={saveM.isPending}
                disabled={!canSave}
                onClick={() => draft && saveM.mutate(draft)}
              >
                {draft.id === null ? 'Crear rivalidad' : 'Guardar rivalidad'}
              </Button>
            </div>
          </div>
        )}

        {rivalriesQ.isLoading ? (
          <p className="text-sm text-text-muted font-sans py-2">Cargando…</p>
        ) : rivalriesQ.isError ? (
          <p className="text-sm text-danger font-sans py-2">No se pudieron cargar las rivalidades.</p>
        ) : rivalries.length === 0 ? (
          <p className="text-sm text-text-muted font-sans py-2">
            Aún no hay ninguna. Sin rivalidades, el partidazo se decide solo con la clasificación y la fase del torneo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rivalries.map((rivalry) => (
              <li key={rivalry.id} className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamCrest team={rivalry.teamA} />
                    <span className="text-sm text-text-primary font-sans truncate">{teamName(rivalry.teamA)}</span>
                    <span className="text-xs text-text-muted font-sans">vs</span>
                    <TeamCrest team={rivalry.teamB} />
                    <span className="text-sm text-text-primary font-sans truncate">{teamName(rivalry.teamB)}</span>
                    {rivalry.label && (
                      <span className="text-xs text-text-secondary font-sans truncate">· {rivalry.label}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!draft}
                      onClick={() =>
                        setDraft({
                          id: rivalry.id,
                          label: rivalry.label ?? '',
                          teamIds: [rivalry.teamA.id, rivalry.teamB.id],
                        })
                      }
                    >
                      <Pencil size={14} aria-hidden />
                      Editar
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleting(rivalry)}>
                      <Trash2 size={14} aria-hidden />
                      Borrar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar rivalidad"
        message={
          deleting
            ? `Se borrará ${teamName(deleting.teamA)} vs ${teamName(deleting.teamB)}. Ese partido dejará de sumar como derbi.`
            : undefined
        }
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deleteM.isPending}
        onConfirm={() => deleting && deleteM.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
