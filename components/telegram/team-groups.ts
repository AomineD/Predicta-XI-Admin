'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Un equipo de un grupo, ya resuelto por el backend. `name: null` = el equipo ya no existe. */
export interface TeamGroupTeam {
  id: number;
  name: string | null;
  logo: string | null;
  country: string | null;
}

/** Espejo de `GET /admin/telegram/team-groups`. */
export interface TeamGroup {
  id: number;
  name: string;
  teamIds: number[];
  teams: TeamGroupTeam[];
  /** Tipos de contenido que tienen el grupo elegido. Con alguno, el backend no deja borrarlo. */
  usedBy: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

interface TeamGroupsResponse {
  items: TeamGroup[];
  maxTeams: number;
}

export const TEAM_GROUPS_QUERY_KEY = ['telegram-team-groups'] as const;

/** Los grupos del canal. La comparten la pestaña «Grupos» y los selectores de cada tipo. */
export function useTeamGroups(enabled = true) {
  return useQuery<TeamGroupsResponse>({
    queryKey: TEAM_GROUPS_QUERY_KEY,
    queryFn: () => api.get('/admin/telegram/team-groups'),
    enabled,
    staleTime: 30_000,
  });
}
