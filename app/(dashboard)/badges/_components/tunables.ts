import type { BadgesConfig } from './types';

/**
 * Catálogo ÚNICO de los ajustes numéricos de las 18 originales.
 *
 * Existe porque los mismos catorce umbrales se pintan ahora en dos sitios: la
 * tarjeta "Ajustes generales", que los muestra todos juntos para calibrar de una
 * pasada, y la ficha de cada insignia, que enseña solo los suyos. Con la
 * etiqueta y el rango escritos en cada sitio, subir un `max` en uno dejaba al
 * otro aceptando un valor que el backend recorta — así que se declaran una vez
 * y las dos superficies leen de aquí.
 *
 * Qué umbral pertenece a qué insignia NO se decide aquí: lo dice el backend en
 * `tunables`, derivado de la explicación real de la regla.
 */
export type TunableKey = keyof BadgesConfig['thresholds'] | 'combinadaGlobalMinScored';

export interface TunableField {
  key: TunableKey;
  label: string;
  subtitle: string;
  info?: string;
  min: number;
  max: number;
  step?: number;
}

export const TUNABLE_FIELDS: readonly TunableField[] = [
  {
    key: 'minParticipants',
    label: 'Participantes mínimos',
    subtitle: 'def. 3',
    info: "Cuánta gente tiene que haber competido de verdad (enviaron picks y quedaron clasificados) para que una quiniela otorgue insignias. Es la defensa anti-farming: sin ella, crear una quiniela en solitario y 'ganarla' regala la insignia de Campeón por unos pocos créditos.",
    min: 1,
    max: 100,
  },
  {
    key: 'minFixturesPerWeek',
    label: 'Partidos mínimos por semana',
    subtitle: 'def. 5',
    info: "Partidos que tiene que tener una jornada para que cuente como pleno. Sin este suelo, acertar el marcador de una quiniela de un solo partido otorgaba 'Perfecto' y 'Maestro' a la vez.",
    min: 1,
    max: 50,
  },
  {
    key: 'cazacuotasMinOdds',
    label: 'Cazacuotas: cuota mínima',
    subtitle: 'def. 8.00',
    min: 1.01,
    max: 1000,
    step: 0.5,
  },
  {
    key: 'videnteLlavesMinStreak',
    label: 'Vidente de llaves: rondas seguidas',
    subtitle: 'def. 4',
    min: 1,
    max: 20,
  },
  {
    key: 'marcadorClavadoMinExact',
    label: 'Marcador clavado: exactos acumulados',
    subtitle: 'def. 25',
    min: 1,
    max: 1000,
  },
  {
    key: 'veteranoMinGroups',
    label: 'Veterano: quinielas jugadas',
    subtitle: 'def. 50',
    min: 1,
    max: 1000,
  },
  {
    key: 'riskWindowDays',
    label: 'Ventana de estilo (días)',
    subtitle: 'def. 90',
    info: 'Cuánto hacia atrás se mira para juzgar los rasgos de estilo. Una ventana corta reacciona rápido pero es injusta con una mala racha; una larga tarda en soltar a quien ya mejoró.',
    min: 7,
    max: 365,
  },
  {
    key: 'riskMinPicks',
    label: 'Riesgos innecesarios: picks mínimos',
    subtitle: 'def. 10',
    min: 1,
    max: 500,
  },
  {
    key: 'riskMaxHitRate',
    label: 'Riesgos innecesarios: acierto máximo',
    subtitle: '0 a 1 · def. 0.25',
    info: 'Se otorga cuando la tasa de acierto en riesgos queda POR DEBAJO de este valor. 0.25 = acierta menos de uno de cada cuatro.',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'unoDeMasMinLegs',
    label: 'Uno de más: patas mínimas',
    subtitle: 'def. 4',
    min: 2,
    max: 20,
  },
  {
    key: 'unoDeMasMinCombinadas',
    label: 'Uno de más: combinadas mínimas',
    subtitle: 'def. 5',
    min: 1,
    max: 500,
  },
  {
    key: 'unoDeMasMinShare',
    label: 'Uno de más: proporción',
    subtitle: '0 a 1 · def. 0.5',
    info: 'Qué parte de sus combinadas perdidas tienen que haberse caído por una sola pata. 0.5 = la mitad o más.',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'sinPunteriaMinPicks',
    label: 'Sin puntería: picks mínimos',
    subtitle: 'def. 30',
    min: 1,
    max: 5000,
  },
  {
    key: 'sinPunteriaMaxRatio',
    label: 'Sin puntería: fracción del promedio',
    subtitle: '0 a 1 · def. 0.6',
    info: 'Se otorga cuando la precisión del usuario cae por debajo de esta fracción del promedio de toda la comunidad. 0.6 = acierta menos del 60 % de lo que acierta el jugador medio. Bájalo para que sea más difícil de ganar.',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    // No vive en `thresholds`, pero decide quién entra en el ranking de
    // combinadas, así que para las tres insignias de ese podio es su exigencia.
    key: 'combinadaGlobalMinScored',
    label: 'Mínimo de combinadas liquidadas (ranking global)',
    subtitle: 'def. 10 · ganadas + perdidas',
    info: 'Combinadas ya liquidadas que hacen falta para entrar en el ranking mundial de combinadas. Sin este suelo, quien ganó una sola combinada de cuota alta sale en el podio mundial.',
    min: 1,
    max: 500,
  },
];

export const TUNABLE_BY_KEY: ReadonlyMap<TunableKey, TunableField> = new Map(
  TUNABLE_FIELDS.map((f) => [f.key, f]),
);

/** Lee un ajuste de la config, venga de `thresholds` o de la raíz. */
export function readTunable(config: BadgesConfig, key: TunableKey): number {
  return key === 'combinadaGlobalMinScored'
    ? config.combinadaGlobalMinScored
    : config.thresholds[key];
}

/** Devuelve la config con un solo ajuste cambiado, sin tocar el resto. */
export function writeTunable(config: BadgesConfig, key: TunableKey, value: number): BadgesConfig {
  return key === 'combinadaGlobalMinScored'
    ? { ...config, combinadaGlobalMinScored: value }
    : { ...config, thresholds: { ...config.thresholds, [key]: value } };
}
