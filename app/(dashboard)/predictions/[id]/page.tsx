'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime, bilingualToString } from '@/lib/utils';
import { ConfidenceIcon } from '@/components/ui/ConfidenceIcon';
import { ConfidenceLevelBadge } from '@/components/ui/ConfidenceLevelBadge';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

type Bilingual = string | { en?: string; es?: string } | null | undefined;

interface Pick {
  market: string;
  pick: string;
  confidence: number;
  reasoning: Bilingual;
  result?: string;
}

interface PredictionDetail {
  id: string;
  matchId: number;
  model: string;
  coverageScore: number | null;
  picks: Pick[];
  summary: Bilingual;
  dataQualityNote: Bilingual;
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
  match?: {
    id: number;
    homeTeam: { name: string; short_name: string; logo: string };
    awayTeam: { name: string; short_name: string; logo: string };
    status: string;
    kickoff: string;
    score?: { home: number; away: number } | null;
    flashscoreId?: string | null;
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

      {/* Header with Team Info */}
      {data.match && (
        <div className="mb-8 text-center">
          {(() => {
            const cardContent = (
              <div className="flex items-center justify-center gap-6 bg-surface/50 inline-flex px-8 py-4 rounded-2xl border border-surface-2 mx-auto transition-transform duration-200 hover:scale-[1.03]">
                <div className="flex items-center gap-3">
                  {data.match.homeTeam?.logo && (
                    <img
                      alt={data.match.homeTeam.name}
                      className="w-10 h-10 rounded-full bg-white"
                      src={data.match.homeTeam.logo}
                    />
                  )}
                  <span className="text-2xl font-bold">{data.match.homeTeam?.short_name ?? data.match.homeTeam?.name}</span>
                </div>
                {data.match.score != null ? (
                  <span className="text-2xl font-bold text-text-primary tabular-nums">
                    {data.match.score.home}-{data.match.score.away}
                  </span>
                ) : (
                  <span className="text-xl font-bold text-text-secondary">VS</span>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">{data.match.awayTeam?.short_name ?? data.match.awayTeam?.name}</span>
                  {data.match.awayTeam?.logo && (
                    <img
                      alt={data.match.awayTeam.name}
                      className="w-10 h-10 rounded-full bg-white"
                      src={data.match.awayTeam.logo}
                    />
                  )}
                </div>
              </div>
            );
            return data.match.flashscoreId ? (
              <a
                href={`https://www.flashscore.com/match/${data.match.flashscoreId}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mb-6 cursor-pointer"
              >
                {cardContent}
              </a>
            ) : (
              <div className="mb-6">{cardContent}</div>
            );
          })()}
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            TACTICAL PREDICTION TERMINAL: {data.match.homeTeam?.name?.toUpperCase()} VS {data.match.awayTeam?.name?.toUpperCase()}
          </h2>
          <div className="text-sm text-text-muted flex justify-center gap-4">
            <span>Match #{data.matchId}</span>
            <span className="border-l border-text-muted pl-4">Model: {data.model}</span>
            <span className="border-l border-text-muted pl-4">Coverage: {data.coverageScore ?? '—'}%</span>
          </div>
        </div>
      )}

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
      {bilingualToString(data.summary) && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-text-secondary text-sm font-sans leading-relaxed">{bilingualToString(data.summary)}</p>
          {bilingualToString(data.dataQualityNote) && (
            <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg flex gap-2">
              <svg className="w-5 h-5 text-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
              <p className="text-xs text-warning font-sans">{bilingualToString(data.dataQualityNote)}</p>
            </div>
          )}
        </div>
      )}

      {/* Picks */}
      <div className="rounded-2xl overflow-hidden mb-4 space-y-0" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">Picks</h2>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {data.picks.map((pick, i) => (
            <div
              key={i}
              className="px-5 py-4 md:py-6 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8"
            >
              {/* Market */}
              <div className="w-full md:w-1/5 shrink-0">
                <div className="text-xs text-text-muted uppercase mb-1 tracking-wide font-sans">Market</div>
                <div className="text-lg font-bold text-secondary font-sans">{pick.market.replace(/_/g, ' ')}</div>
              </div>

              {/* Pick */}
              <div className="w-full md:w-1/6 shrink-0">
                <div className="text-xs text-text-muted uppercase mb-1 tracking-wide font-sans">Selection</div>
                <div className="text-lg font-bold text-text-primary font-sans">{pick.pick}</div>
              </div>

              {/* Confidence */}
              <div className="w-full md:w-1/5 shrink-0 flex items-center gap-4">
                <div>
                  <div className="text-xs text-text-muted uppercase mb-1 tracking-wide font-sans">Confidence</div>
                  <div className="text-lg font-bold text-text-primary font-sans">{pick.confidence}%</div>
                </div>
                <ConfidenceIcon confidence={pick.confidence} type="circle" />
                <ConfidenceLevelBadge confidence={pick.confidence} />
              </div>

              {/* Reasoning */}
              <div className="w-full text-sm text-text-muted leading-relaxed border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-8 font-sans">
                {bilingualToString(pick.reasoning)}
              </div>

              {/* Result (if settled) */}
              {pick.result && <StatusBadge status={pick.result} className="md:ml-auto" />}
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
