'use client';

import { useMemo, useState } from 'react';
import { Eye, Users, X } from 'lucide-react';
import { Select } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';
import { TeamGroupTeamsDialog } from './TeamGroupTeamsDialog';
import { useTeamGroups, type TeamGroup } from './team-groups';

interface TeamGroupPickerProps {
  /** Ids de `telegram_team_groups` elegidos en el tipo (`settings.teamGroupIds`). */
  value: number[];
  onChange: (value: number[]) => void;
  /** Lleva a la pestaña «Grupos», donde se crean y editan. */
  onManageGroups?: () => void;
}

/**
 * Selector de grupos de equipos para la tarjeta de un tipo.
 *
 * El grupo se elige por REFERENCIA: el tipo guarda su id y el backend lo resuelve
 * al leer, así que editar el grupo cambia todos los tipos que lo usan. Cada grupo
 * elegido trae un botón «Ver equipos» que abre la lista en solo lectura.
 */
export function TeamGroupPicker({ value, onChange, onManageGroups }: TeamGroupPickerProps) {
  const groupsQ = useTeamGroups();
  const [viewing, setViewing] = useState<TeamGroup | null>(null);

  const groups = useMemo(() => groupsQ.data?.items ?? [], [groupsQ.data]);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const available = groups.filter((g) => !value.includes(g.id));

  const remove = (id: number) => onChange(value.filter((x) => x !== id));

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => {
            const group = byId.get(id);
            // Mientras carga no se sabe si existe: no se pinta como borrado.
            const missing = !group && groupsQ.isSuccess;
            return (
              <span
                key={id}
                className={cn(
                  'inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border text-xs font-sans max-w-full',
                  missing
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : 'border-primary/30 bg-primary/10 text-text-primary',
                )}
              >
                <Users size={13} className="flex-none text-primary" aria-hidden />
                <span className="truncate max-w-[12rem] font-semibold">
                  {group ? group.name : missing ? `Grupo #${id} (borrado)` : `Grupo #${id}`}
                </span>
                {group && (
                  <>
                    <span className="text-text-muted flex-none">
                      · {group.teams.length} {group.teams.length === 1 ? 'equipo' : 'equipos'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewing(group)}
                      className="inline-flex items-center gap-1 ml-1 px-1.5 h-6 rounded-md bg-surface-3 text-text-primary hover:bg-surface-2 transition-colors cursor-pointer flex-none"
                    >
                      <Eye size={12} aria-hidden />
                      Ver equipos
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  aria-label={`Quitar ${group?.name ?? `grupo #${id}`}`}
                  className="flex-none text-text-muted hover:text-danger transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {groupsQ.isError ? (
        <p className="text-xs text-danger font-sans">No se pudieron cargar los grupos.</p>
      ) : groupsQ.isSuccess && groups.length === 0 ? (
        <p className="text-xs text-text-muted font-sans">
          Aún no hay grupos.{' '}
          {onManageGroups && (
            <button type="button" onClick={onManageGroups} className="text-primary hover:underline cursor-pointer">
              Crea uno en la pestaña «Grupos»
            </button>
          )}
        </p>
      ) : (
        <Select
          value=""
          disabled={!groupsQ.isSuccess || available.length === 0}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (Number.isInteger(id) && id > 0) onChange([...value, id]);
          }}
          aria-label="Añadir grupo de equipos"
        >
          <option value="">
            {!groupsQ.isSuccess
              ? 'Cargando grupos…'
              : available.length === 0
                ? 'Todos los grupos ya están elegidos'
                : 'Añadir grupo…'}
          </option>
          {available.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.teams.length} {g.teams.length === 1 ? 'equipo' : 'equipos'})
            </option>
          ))}
        </Select>
      )}

      <TeamGroupTeamsDialog group={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
