// Tipos compartidos por las pestañas de /config. Extraídos del monolito
// page.tsx para que cada tab viva en su propio archivo.

export interface PredictionConfig {
  model: string;
  batchSize: number;
  automationEnabled: boolean;
  outputMarkets: string[];
  inputDataFields: string[];
  historicalContextEnabled: boolean;
  historicalContextCount: number;
  reasoningEffort: string | null;
  matchSyncEnabled: boolean;
  matchSyncIntervalHours: number;
  resultSyncEnabled: boolean;
  resultSyncInitialDelayMinutes: number;
  resultSyncRetryIntervalMinutes: number;
  resultSyncMaxRetryHours: number;
  enrichmentSyncEnabled: boolean;
  enrichmentSyncIntervalMinutes: number;
  enrichmentQueueMinutesBefore: number;
  enrichmentQueueMaxRetries: number;
  enrichmentQueueRetryMinutes: number;
  teamRefreshEnabled: boolean;
  // Kill-switch for the paid "Predicta opinion" on user-built combinadas.
  userCombinadaOpinionsEnabled: boolean;
  // Anchors correct_score to the odds-derived Poisson/Dixon-Coles distribution.
  correctScoreModelEnabled: boolean;
  // Injects fair (devig) market_probabilities and anchors pick confidence to them.
  marketProbabilityAnchoringEnabled: boolean;
  // Strength-of-schedule baselines + home/away splits used to enrich deep_stats.
  statBaselinesEnabled: boolean;
  // Market-independent probability (attack/defense goal model) + value axis.
  independentModelEnabled: boolean;
  // Remaps declared confidence to the empirical (calibrated) value.
  calibrationEnabled: boolean;
  // Neutral-venue & host awareness (World Cup): no false home/away at neutral
  // sites; real home advantage for a host nation playing in its own country.
  neutralVenueAwarenessEnabled: boolean;
  // Unified totals (idea #2): replaces the fixed over/under 2.5 + 1.5 markets with
  // a single `total_goals` whose line the engine picks (Poisson selector + calibration).
  totalsUnifiedEnabled: boolean;
  // Selector floors (round-tripped; tuned via API). Optional in the admin form.
  totalsSelector?: { confFloor: number; confCeiling: number; oddsFloor: number };
  // Special value markets (idea #1): engine derives exotic markets from the Poisson
  // matrix, anchors them to Sportium odds (edge) and emits the best ones to MAX/CLUB.
  specialMarketsEnabled: boolean;
  // Value selector config (round-tripped; tuned via API). Optional in the admin form.
  specialMarketsSelector?: { maxPicks: number; minConfidence: number; minEdge: number; oddsFloor: number };
  // Quiniela IA: master switch + motor para la generación de llaves de eliminatoria
  // ronda por ronda (automatización de la quiniela de la IA).
  quinielaKnockoutAutomationEnabled: boolean;
  quinielaKnockoutEngine: 'llm' | 'claude_routine';
  llmTimeoutSeconds: number;
  predictionWindowMinutes: number;
  featuredLeagueIds: number[];
  combinadasEnabled?: boolean;
  combinadasBasePredictionHourUtc?: number;
  combinadasMaxLegs?: number;
  combinadasMinConfidence?: number;
  combinadasCountRegular?: number;
  combinadasCountPremium?: number;
  combinadasMinConfidenceRegular?: number;
  combinadasMinConfidencePremium?: number;
  combinadasRiskMode?: string;
  combinadasRegularLeagues?: number[];
  combinadasPremiumLeagues?: number[];
  combinadasRegularExcludedTeams?: number[];
  combinadasRegularMaxOdds?: number;
  combinadasPremiumMaxOdds?: number;
  enrichmentMode?: string;
  earlyEnrichmentHourUtc?: number;
  /** Per-model max output token override. Empty/missing → backend uses baked-in default. */
  llmMaxTokens?: Record<string, number>;
}

export interface SportiumConfig {
  enabled: boolean;
  influencePredictions: boolean;
  matchConfidenceMin: number;
  couponUrls: Array<{ competitionId: number; url: string }>;
  captureV1: boolean;
  captureV2: boolean;
  requestTimeoutMs: number;
}

export interface TeamLite {
  id: number;
  name: string;
  logo: string | null;
}

export interface ApiKey {
  id: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionLite {
  id: number;
  apiFootballId: number;
  name: string;
}

/** Respuesta de `/admin/credits-config` en lo que respecta a los flags que edita
 * la pestaña Maintenance (mantenimiento, gates de actualización, social, etc.). */
export interface MaintenanceCreditsConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  minSupportedBuild: number;
  minSupportedVersion: string | null;
  minRecommendedBuild: number;
  recommendedVersion: string | null;
  socialEnabled: boolean;
  combinadaSharesEnabled: boolean;
  socialXEnabled: boolean;
  socialXUrl: string;
  socialFacebookEnabled: boolean;
  socialFacebookUrl: string;
  socialTelegramEnabled: boolean;
  socialTelegramUrl: string;
  socialInstagramEnabled: boolean;
  socialInstagramUrl: string;
  liveTrackerEnabled: boolean;
  homeAnnouncementsEnabled: boolean;
}

export type SetField = <K extends keyof PredictionConfig>(key: K, value: PredictionConfig[K]) => void;
