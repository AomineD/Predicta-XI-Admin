'use client';

import { TeamPicker } from '@/components/pickers/TeamPicker';
import { TeamGroupPicker } from './TeamGroupPicker';

interface TeamsSelectionProps {
  groupIds: number[];
  onGroupsChange: (value: number[]) => void;
  teamIds: number[];
  onTeamsChange: (value: number[]) => void;
  onManageGroups?: () => void;
}

/**
 * El campo «Equipos» de un tipo: grupos ya hechos más equipos sueltos. El backend
 * filtra por la unión de los dos.
 */
export function TeamsSelection({ groupIds, onGroupsChange, teamIds, onTeamsChange, onManageGroups }: TeamsSelectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-text-muted font-sans mb-1.5">Grupos</p>
        <TeamGroupPicker value={groupIds} onChange={onGroupsChange} onManageGroups={onManageGroups} />
      </div>
      <div>
        <p className="text-xs text-text-muted font-sans mb-1.5">Equipos sueltos</p>
        <TeamPicker value={teamIds} onChange={onTeamsChange} />
      </div>
    </div>
  );
}
