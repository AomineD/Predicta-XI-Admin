export type { CallType } from './call-types';
import type { CallType } from './call-types';

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
  reasoningTokens: number | null;
  inputCacheHitTokens: number | null;
  inputCacheMissTokens: number | null;
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
  /** Part of totalOutputTokens spent thinking — billed at the output rate. */
  totalReasoningTokens: number;
  totalCacheHitTokens: number;
  totalCacheMissTokens: number;
  /** Failed calls the provider refused before running: no tokens, no cost. */
  rejectedCount: number;
}

export type SortBy = 'createdAt' | 'costUsd';
export type SortOrder = 'asc' | 'desc';
