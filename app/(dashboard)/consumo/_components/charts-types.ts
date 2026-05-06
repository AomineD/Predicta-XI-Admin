export interface DailySeriesPoint {
  day: string;
  group: string | null;
  calls: number;
  costUsd: string;
  inputTokens: number;
  outputTokens: number;
}

export type DailyGroupBy = 'callType' | 'model' | 'provider';
