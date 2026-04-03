'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface Pick {
  market: string;
  pick: string;
  confidence: number;
  reasoning: string;
  result?: string;
}

interface PredictionDetail {
  id: string;
  matchId: number;
  model: string;
  coverageScore: number | null;
  picks: Pick[];
  summary: string | null;
  dataQualityNote: string | null;
  settlement: string;
  settledAt: string | null;
  settledMarkets: number | null;
  wonMarkets: number | null;
  createdAt: string | null;
  latencyMs: number | null;
  tokensUsed: { input: number; output: number; total: number } | null;
  llmInput: { systemPrompt: string; userPrompt: string } | null;
  contrast?: {
    homeScore: number | null;
    awayScore: number | null;
    matchStatus: string;
  };
}

function CollapsibleSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-3/50 transition-colors"
      >
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">{title}</span>
        <span className="text-text-muted text-xs">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => navigator.clipboard.writeText(content)}
              className="px-2 py-1 rounded-md text-xs font-sans bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-96 overflow-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function PredictionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<PredictionDetail>({
    queryKey: ['prediction', id],
    queryFn: () => api.get(`/admin/predictions/${id}`),
  });

  if (isLoading) {
    return <p className="text-text-muted text-sm p-4">Loading…</p>;
  }

  if (!data) return null;

  return (
    <div>
      <Link href="/predictions" className="flex items-center gap-1 text-text-muted text-sm mb-4 hover:text-text-primary transition-colors">
        <ChevronLeft size={14} /> Back to Predictions
      </Link>

      <PageHeader
        title={`Prediction — Match #${data.matchId}`}
        description={`${data.model} · Coverage ${data.coverageScore ?? '—'}%`}
      />

      <div className="flex items-center gap-3 mb-6">
        <StatusBadge status={data.settlement} />
        <span className="text-text-muted text-sm font-sans">{formatDateTime(data.createdAt)}</span>
        {data.latencyMs && (
          <span className="text-text-muted text-xs font-sans ml-auto">{data.latencyMs}ms · {data.tokensUsed?.total ?? '?'} tokens</span>
        )}
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-text-secondary text-sm font-sans leading-relaxed">{data.summary}</p>
          {data.dataQualityNote && (
            <p className="mt-2 text-text-muted text-xs font-sans italic">{data.dataQualityNote}</p>
          )}
        </div>
      )}

      {/* Picks */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">Picks</h2>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {data.picks.map((pick, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide font-sans">{pick.market.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-text-primary font-sans">{pick.pick}</span>
                <span className="text-xs text-secondary font-sans ml-1">{pick.confidence}%</span>
                {pick.result && <StatusBadge status={pick.result} className="ml-auto" />}
              </div>
              <p className="text-text-muted text-xs font-sans leading-relaxed">{pick.reasoning}</p>
            </div>
          ))}
        </div>
      </div>

      {/* LLM Input (admin only) */}
      {data.llmInput && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">LLM Input</h2>
          </div>
          <CollapsibleSection title="System Prompt" content={data.llmInput.systemPrompt} />
          <CollapsibleSection title="User Prompt" content={data.llmInput.userPrompt} />
        </div>
      )}

      {/* Contrast */}
      {data.contrast && (
        <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
            Actual Result
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-text-primary font-sans">
              {data.contrast.homeScore ?? '?'} — {data.contrast.awayScore ?? '?'}
            </span>
            <StatusBadge status={data.contrast.matchStatus} />
          </div>
        </div>
      )}
    </div>
  );
}
