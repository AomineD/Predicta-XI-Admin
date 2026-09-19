'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { TeamGroup } from './team-groups';

interface TeamGroupTeamsDialogProps {
  group: TeamGroup | null;
  onClose: () => void;
}

/**
 * Los equipos de un grupo, en SOLO LECTURA.
 *
 * Desde la tarjeta de un tipo el grupo no se edita a propósito: es compartido, y
 * quitar un equipo aquí lo quitaría también de los demás tipos que lo usan sin
 * que quien edita lo vea. Se edita en la pestaña «Grupos», que dice dónde se usa.
 */
export function TeamGroupTeamsDialog({ group, onClose }: TeamGroupTeamsDialogProps) {
  const count = group?.teams.length ?? 0;
  return (
    <Modal
      open={group !== null}
      onClose={onClose}
      title={group?.name}
      description={`${count} ${count === 1 ? 'equipo' : 'equipos'} · solo lectura. Se edita en la pestaña «Grupos».`}
      size="lg"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {count === 0 ? (
        <p className="text-sm text-warning font-sans py-2">
          Este grupo no tiene equipos. Elegido en un tipo, ese tipo no publica nada: un grupo vacío restringe, no abre.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pb-2">
          {group?.teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 text-sm font-sans min-w-0"
            >
              {team.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logo} alt="" className="w-5 h-5 object-contain rounded-sm flex-none" />
              ) : (
                <span className="w-5 h-5 rounded-sm bg-surface-3 flex-none" />
              )}
              {team.name ? (
                <span className="text-text-primary truncate flex-1">{team.name}</span>
              ) : (
                <span className="text-text-muted truncate flex-1">Equipo #{team.id} (no encontrado)</span>
              )}
              {team.country && <span className="text-text-muted/60 text-xs flex-none">{team.country}</span>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
