// Constantes compartidas por las pestañas de /config.

export const CONFIG_TABS = [
  { id: 'general', label: 'General' },
  { id: 'automations', label: 'Automations' },
  { id: 'combinadas', label: 'Combinadas' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'security', label: 'Security' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;

export type ConfigTabId = (typeof CONFIG_TABS)[number]['id'];
export const DEFAULT_CONFIG_TAB: ConfigTabId = 'general';

export const MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.4-think',
  'gemini-3.1-pro',
  'gemini-3.1-flash-lite-preview',
  'glm-5',
  'kimi-k2.5',
];

// Backend defaults baked into batch-processor.getMaxTokens. Shown as placeholder
// in the per-model max-tokens inputs so operators can see what the system uses
// when no override is set. Keep in sync with backend; see batch-processor.ts.
export const MODEL_DEFAULT_MAX_TOKENS: Record<string, number> = {
  'deepseek-v4-pro': 16384,
  'deepseek-v4-flash': 12288,
  'deepseek-r1': 8192,
  'gpt-5.4-mini': 4096,
  'gpt-5.4': 4096,
  'gpt-5.4-think': 4096,
  'gemini-3.1-pro': 4096,
  'gemini-3.1-flash-lite-preview': 4096,
  'glm-5': 4096,
  'kimi-k2.5': 4096,
};

export const MARKETS = [
  'match_result',
  'over_under_2_5',
  'over_under_1_5',
  'btts',
  'double_chance',
  'asian_handicap',
  'correct_score',
  'first_goal',
  'corners',
  'handicap',
  'cards_over_under',
  'penalty',
  'red_card',
];

export const DATA_FIELDS = [
  'fixture_info',
  'standings',
  'recent_form',
  'season_stats',
  'h2h',
  'injuries',
  'odds',
  'match_preview',
  'squads',
  'lineups',
  'squad_insights',
  'key_player_form',
  'deep_stats',
];

export const REASONING_OPTIONS = ['', 'low', 'medium', 'high'];
export const PROVIDERS = ['deepseek', 'openai', 'google', 'zhipu', 'moonshot'];

// All toggles below map to a `boolean` field on PredictionConfig, so indexing
// PredictionConfig[EngineLayerKey] collapses to `boolean` and setField stays typed.
export type EngineLayerKey =
  | 'marketProbabilityAnchoringEnabled'
  | 'calibrationEnabled'
  | 'correctScoreModelEnabled'
  | 'statBaselinesEnabled'
  | 'independentModelEnabled'
  | 'neutralVenueAwarenessEnabled'
  | 'totalsUnifiedEnabled'
  | 'specialMarketsEnabled';

// The long descriptions used to live inline; they now sit behind the (i) button.
export const ENGINE_LAYERS: Array<{ key: EngineLayerKey; title: string; info: string }> = [
  {
    key: 'marketProbabilityAnchoringEnabled',
    title: 'Market probability anchoring',
    info: "Injects fair (devig) market probabilities from the odds into the payload, with prompt rules that anchor each pick's confidence to the market and stop the model ignoring the draw. Corrects ~15 pts of systemic overconfidence and the anti-draw bias (draw predicted 8.6% vs 26.1% real). Affects the scheduler, bridge and skill at once. Best paired with Sportium influence_predictions for richer, fresher odds.",
  },
  {
    key: 'calibrationEnabled',
    title: 'Confidence calibration',
    info: "Remaps the LLM's declared confidence to the empirical winrate (per market and per model) using the calibration map built from settled picks. Corrects the systemic over-confidence. Conservative: only ever lowers confidence, never raises it. Inert until the map is built — run the Calibration rebuild in Data Maintenance, then enable.",
  },
  {
    key: 'correctScoreModelEnabled',
    title: 'Correct score — statistical model',
    info: "Anchors the correct_score market to an odds-derived Poisson/Dixon-Coles distribution. Corrects the LLM's bias toward inflating the favorite's scoreline. Backtested on 368 settled matches: exact-score hit rate 8.7% → 14.9%. Affects the scheduler, bridge and skill at once; only active when correct_score is in Output Markets.",
  },
  {
    key: 'statBaselinesEnabled',
    title: 'Stat baselines — opponent-adjusted',
    info: 'Enables the strength-of-schedule adjustment and home/away splits in deep_stats (league/team baselines weighted by how strong each opponent was). The consumer is data-driven, so it stays inert until this is on AND the baseline tables are populated (run the backfill in Data Maintenance). Enriches the shots, clear chances, possession, corners and cards the model receives.',
  },
  {
    key: 'independentModelEnabled',
    title: 'Independent probability model',
    info: 'Injects a market-INDEPENDENT probability (own attack/defense goal model → Poisson/Dixon-Coles) for the LLM to contrast against the odds, and computes the value edge (p × best odds − 1) attached to each pick. The `p` that the value axis needs (the odds devig alone gives ~0 edge). Inert until populated — run the Goal Strength backfill in Data Maintenance, then enable. Currently wired into the bridge path.',
  },
  {
    key: 'neutralVenueAwarenessEnabled',
    title: 'Neutral venue & host awareness',
    info: 'Tells the model when a match is played at a neutral venue (e.g. the World Cup): no false home/away advantage at neutral sites, and real home advantage for a host nation playing in its own country. Threaded into the payload + prompt across the scheduler and bridge.',
  },
  {
    key: 'totalsUnifiedEnabled',
    title: 'Totales unificados (1 mercado de goles)',
    info: 'Reemplaza los mercados fijos over/under 2.5 + 1.5 por UN solo mercado total_goals cuya línea+lado elige el motor (selector Poisson sobre las cuotas multi-línea + calibración), no el LLM. Backtest 707 partidos: 70.3% de acierto a cuota media 1.35, le gana al fijo-2.5 (59.9%) y diversifica líneas. Antes de encenderlo en serio: agrega total_goals a los markets de los tiers (si no, queda bloqueado hasta el settlement) y publica un AAB con el render nuevo. Afecta scheduler y bridge a la vez; reversible (con OFF, comportamiento actual sin cambios).',
  },
  {
    key: 'specialMarketsEnabled',
    title: 'Mercados especiales con valor (idea #1)',
    info: 'El motor deriva mercados exóticos desde la matriz Poisson (total por equipo, par/impar, portería a cero, gana a cero, combos resultado/doble-oportunidad/btts + goles), los ancla a las cuotas de Sportium para computar el edge (valor), y emite solo el top-N que elige el selector de valor. Son picks NO obvios con valor real, no el pick que ya da la cuota. Solo para tiers de suscriptor (MAX/CLUB). Antes de encenderlo en serio: corre el backtest del selector (fija sus umbrales), asigna las claves nuevas SOLO a los tiers MAX/CLUB (fail-closed: sin asignar, el usuario lo ve bloqueado) y publica un AAB con el render nuevo. Reversible (con OFF no se emiten, liquidan ni sirven picks exóticos; la captura de cuotas de Sportium sí corre para alimentar el backtest).',
  },
];
