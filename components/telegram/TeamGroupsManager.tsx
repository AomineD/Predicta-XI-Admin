'use client';

/**
 * Pestaña «Grupos»: listas de equipos con nombre que luego se eligen en los tipos
 * que filtran por equipo (Goles en vivo, Final del partido, Noticias), en vez de
 * añadir los equipos uno a uno en cada tarjeta.
 *
 * Un grupo se usa por REFERENCIA: editarlo aquí cambia a la vez todos los tipos
 * que lo tienen elegido. Por eso cada fila dice dónde se usa, y un grupo en uso
 * no se puede borrar hasta quitarlo de esos tipos.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/inputs';
import { Field } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TeamPicker } from '@/components/pickers/TeamPicker';
import { useToast } from '@/components/ui/ToastProvider';
import { TeamGroupTeamsDialog } from './TeamGroupTeamsDialog';
import { TEAM_GROUPS_QUERY_KEY, useTeamGroups, type TeamGroup } from './team-groups';

const NAME_MAX = 60;
/** Cuántos escudos se enseñan en la fila antes de resumir con «+N». */
const CREST_PREVIEW = 10;

interface Draft {
  /** `null` = grupo nuevo. */
  id: number | null;
  name: string;
  teamIds: number[];
}

interface TeamGroupsManagerProps {
  /** Nombre visible de un tipo de contenido, para el «Usado en». */
  typeLabel: (contentType: string) => string;
}

export function TeamGroupsManager({ typeLabel }: TeamGroupsManagerProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const groupsQ = useTeamGroups();
  const groups = groupsQ.data?.items ?? [];
  const maxTeams = groupsQ.data?.maxTeams ?? 200;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<TeamGroup | null>(null);
  const [deleting, setDeleting] = useState<TeamGroup | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: TEAM_GROUPS_QUERY_KEY });

  const saveM = useMutation({
    mutationFn: (d: Draft) => {
      const body = { name: d.name.trim(), teamIds: d.teamIds };
      return d.id === null
        ? api.post('/admin/telegram/team-groups', body)
        : api.put(`/admin/telegram/team-groups/${d.id}`, body);
    },
    onSuccess: (_res, d) => {
      void refresh();
      setDraft(null);
      toast.success(d.id === null ? 'Grupo creado.' : 'Grupo guardado.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/telegram/team-groups/${id}`),
    onSuccess: () => {
      void refresh();
      setDeleting(null);
      toast.success('Grupo borrado.');
    },
    onError: (e: Error) => {
      setDeleting(null);
      toast.error(e.message);
    },
  });

  const canSave = !!draft && draft.name.trim().length > 0 && !saveM.isPending;

  return (
    <>
      <Card
        className="mb-4"
        title="Grupos de equipos"
        subtitle="Se crean aquí y se eligen en cada tipo, en su campo «Equipos»."
        info="Un grupo se usa por referencia: si lo editas aquí, cambian a la vez todos los tipos que lo tienen elegido. En un tipo, los equipos de sus grupos se suman a los equipos sueltos. Ojo: elegir un grupo SIEMPRE restringe — si el grupo se queda sin equipos, ese tipo no publica nada, no pasa a publicar de todos. Un grupo en uso no se puede borrar: primero quítalo de los tipos que lo usan."
        action={
          !draft && (
            <Button size="sm" variant="primary" onClick={() => setDraft({ id: null, name: '', teamIds: [] })}>
              <Plus size={14} aria-hidden />
              Nuevo grupo
            </Button>
          )
        }
      >
        {draft && (
          <div className="rounded-xl border border-primary/30 bg-surface-2/50 px-4 py-1 mb-4">
            <Field label="Nombre" subtitle={`Máx. ${NAME_MAX} caracteres.`}>
              <Input
                value={draft.name}
                maxLength={NAME_MAX}
                placeholder="Ej.: Big 6 Premier"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Equipos" subtitle={`${draft.teamIds.length} de ${maxTeams} como máximo.`}>
              <TeamPicker
                value={draft.teamIds}
                onChange={(v) => setDraft({ ...draft, teamIds: v.slice(0, maxTeams) })}
              />
            </Field>
            <div className="flex items-center justify-end gap-2 py-3">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saveM.isPending}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={saveM.isPending} disabled={!canSave} onClick={() => saveM.mutate(draft)}>
                {draft.id === null ? 'Crear grupo' : 'Guardar grupo'}
              </Button>
            </div>
          </div>
        )}

        {groupsQ.isLoading ? (
          <p className="text-sm text-text-muted font-sans py-2">Cargando…</p>
        ) : groupsQ.isError ? (
          <p className="text-sm text-danger font-sans py-2">No se pudieron cargar los grupos.</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-text-muted font-sans py-2">
            Aún no hay grupos. Crea uno con «Nuevo grupo» y luego elígelo en el campo «Equipos» de cada tipo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => {
              const inUse = group.usedBy.length > 0;
              const extra = group.teams.length - CREST_PREVIEW;
              return (
                <li key={group.id} className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary font-sans truncate">{group.name}</p>
                      <p className="text-xs text-text-muted font-sans mt-0.5">
                        {group.teams.length} {group.teams.length === 1 ? 'equipo' : 'equipos'} ·{' '}
                        {inUse ? (
                          <span className="text-text-secondary">Usado en: {group.usedBy.map(typeLabel).join(', ')}</span>
                        ) : (
                          'Sin usar'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setViewing(group)}>
                        <Eye size={14} aria-hidden />
                        Ver equipos
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!draft}
                        onClick={() => setDraft({ id: group.id, name: group.name, teamIds: group.teamIds })}
                      >
                        <Pencil size={14} aria-hidden />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={inUse}
                        title={inUse ? 'Quítalo primero de los tipos que lo usan.' : undefined}
                        onClick={() => setDeleting(group)}
                      >
                        <Trash2 size={14} aria-hidden />
                        Borrar
                      </Button>
                    </div>
                  </div>
                  {group.teams.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {group.teams.slice(0, CREST_PREVIEW).map((team) =>
                        team.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={team.id}
                            src={team.logo}
                            alt={team.name ?? ''}
                            title={team.name ?? `Equipo #${team.id}`}
                            className="w-6 h-6 object-contain rounded-sm"
                          />
                        ) : (
                          <span
                            key={team.id}
                            title={team.name ?? `Equipo #${team.id}`}
                            className="w-6 h-6 rounded-sm bg-surface-3"
                          />
                        ),
                      )}
                      {extra > 0 && <span className="text-xs text-text-muted font-sans ml-1">+{extra}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TeamGroupTeamsDialog group={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar grupo"
        message={deleting ? `Se borrará «${deleting.name}». No está elegido en ningún tipo.` : undefined}
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
