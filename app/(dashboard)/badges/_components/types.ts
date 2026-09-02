/** Categorías visuales. Deciden el color del chip en la app. */
export const BADGE_CATEGORIES = [
  { value: 'elite', label: 'Élite', hint: 'Dorado. Posición mundial destacada.' },
  { value: 'rank', label: 'Ranking', hint: 'Verde. Posición sin llegar a la élite.' },
  { value: 'feat', label: 'Hazaña', hint: 'Azul. Un hito que ocurrió y no se deshace.' },
  { value: 'style', label: 'Estilo', hint: 'Ámbar. Un rasgo de comportamiento.' },
  { value: 'slip', label: 'Desliz', hint: 'Rojo. La única categoría negativa.' },
] as const;

export type BadgeCategory = (typeof BADGE_CATEGORIES)[number]['value'];

/** Colores del chip en el panel. Espejo de `badge_style.dart` en la app. */
export const CATEGORY_COLORS: Record<BadgeCategory, { accent: string; dim: string; border: string }> = {
  elite: { accent: '#E8C468', dim: 'rgba(232,196,104,0.12)', border: 'rgba(232,196,104,0.30)' },
  rank: { accent: '#7CFF5B', dim: 'rgba(124,255,91,0.12)', border: 'rgba(124,255,91,0.30)' },
  feat: { accent: '#4DA8FF', dim: 'rgba(77,168,255,0.12)', border: 'rgba(77,168,255,0.30)' },
  style: { accent: '#F59E0B', dim: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)' },
  slip: { accent: '#EF4444', dim: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.30)' },
};

export const BADGE_KINDS = [
  {
    value: 'standing',
    label: 'Se puede perder',
    hint: 'Depende de una foto que cambia (tu puesto de hoy, tu estilo reciente). El barrido la retira cuando dejas de cumplirla.',
  },
  {
    value: 'permanent',
    label: 'Para siempre',
    hint: 'Un hito que ya ocurrió. No se retira nunca, ni aunque el umbral suba después.',
  },
] as const;

export type BadgeKind = (typeof BADGE_KINDS)[number]['value'];

export const CRITERIA_OPS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'gte', label: '≥' },
  { value: 'gt', label: '>' },
  { value: 'lte', label: '≤' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
];

export interface BadgeCriteriaCondition {
  metric: string;
  op: string;
  value: number;
}

export interface BadgeCriteria {
  all: BadgeCriteriaCondition[];
}

/** Fila del catálogo, tal como la devuelve `GET /admin/badges`. */
export interface BadgeDefinition {
  key: string;
  category: BadgeCategory;
  kind: BadgeKind;
  family: string | null;
  notify: boolean;
  weight: number;
  iconSlug: string | null;
  iconSvg: string | null;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  evaluator: 'builtin' | 'criteria';
  criteria: BadgeCriteria | null;
  enabled: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

/** Métrica del motor de reglas, según `GET /admin/badges/metrics`. */
export interface BadgeMetric {
  key: string;
  label: string;
  unit: 'number' | 'percent' | 'decimal' | 'position';
  nullable: boolean;
  hint: string | null;
}

export interface BadgeThresholds {
  minParticipants: number;
  minFixturesPerWeek: number;
  cazacuotasMinOdds: number;
  videnteLlavesMinStreak: number;
  marcadorClavadoMinExact: number;
  veteranoMinGroups: number;
  riskWindowDays: number;
  riskMinPicks: number;
  riskMaxHitRate: number;
  unoDeMasMinLegs: number;
  unoDeMasMinCombinadas: number;
  unoDeMasMinShare: number;
  sinPunteriaMinPicks: number;
  sinPunteriaMaxRatio: number;
}

export interface BadgesConfig {
  maxVisible: number;
  combinadaGlobalMinScored: number;
  requireAttestedMembers: boolean;
  weights: Record<string, number>;
  thresholds: BadgeThresholds;
}

/** Formulario del editor. Es la definición sin los campos que fija el servidor. */
export type BadgeDraft = Omit<BadgeDefinition, 'evaluator' | 'isBuiltin'>;

export function emptyDraft(nextSortOrder: number): BadgeDraft {
  return {
    key: '',
    category: 'feat',
    kind: 'permanent',
    family: null,
    notify: true,
    weight: 50,
    iconSlug: null,
    iconSvg: null,
    titleEs: '',
    titleEn: '',
    descriptionEs: '',
    descriptionEn: '',
    criteria: { all: [{ metric: '', op: 'gte', value: 0 }] },
    enabled: false,
    sortOrder: nextSortOrder,
  };
}
