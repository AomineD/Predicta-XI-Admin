export type CallType = 'prediction' | 'combinada';

export interface ConsumoRow {
  id: number;
  createdAt: string;
  success: boolean;
  model: string;
  provider: string;
  isTest: boolean;
  callType: CallType;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  llmInput: { systemPrompt: string; userPrompt: string } | null;
  llmOutput: string | null;
  error: string | null;
}

export interface ConsumoResponse {
  items: ConsumoRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ConsumoSummary {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalCostUsd: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export type SortBy = 'createdAt' | 'costUsd';
export type SortOrder = 'asc' | 'desc';
