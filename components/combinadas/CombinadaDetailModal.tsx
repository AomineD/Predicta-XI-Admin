'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brain, ChevronDown, Clock, Layers, Sparkles, Target, X } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { ConfidenceRing } from '@/components/ui/combinada/ConfidenceRing';
import { Crest } from '@/components/ui/combinada/Crest';
import { LangToggle, type Lang } from '@/components/ui/combinada/LangToggle';
import { ModeBadge, type RiskMode } from '@/components/ui/combinada/ModeBadge';
import { PremiumPill } from '@/components/ui/combinada/PremiumPill';
import { SettlementBadge } from '@/components/ui/combinada/SettlementBadge';

export interface CombinadaModalPick {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  competitionName: string;
  market: string;
  pick: string;
  confidence: number;
  odds: number | null;
  reasoning: unknown;
  result: string;
}

export interface CombinadaModalData {
  id: string;
  date: string;
  type: string;
  legs: number;
  picks: CombinadaModalPick[];
  combinedConfidence: number;
  combinedOdds: string | null;
  summary: unknown;
  reasoning: unknown;
  model: string;
  settlement: string;
  settledAt: string | null;
  settledPicks: number;
  wonPicks: number;
  createdAt: string;
}

interface CombinadaDetailModalProps {
  data: CombinadaModalData | null;
  onClose: () => void;
  // Derived from current config.combinadasRiskMode. Optional — if omitted, the
  // mode badge is hidden. TODO: persist risk_mode per-combinada so historical
  // rows show the mode they were generated with.
  currentRiskMode?: RiskMode | string;
}

type BilingualLike = string | { en?: string; es?: string } | null | undefined;

function toBilingual(value: unknown): { en: string; es: string } | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && ('en' in parsed || 'es' in parsed)) {
        return {
          en: typeof parsed.en === 'string' ? parsed.en : '',
          es: typeof parsed.es === 'string' ? parsed.es : '',
        };
      }
    } catch {
      /* plain string */
    }
    return { en: value, es: value };
  }
  if (typeof value === 'object') {
    const obj = value as BilingualLike as { en?: string; es?: string };
    return {
      en: typeof obj.en === 'string' ? obj.en : '',
      es: typeof obj.es === 'string' ? obj.es : '',
    };
  }
  return null;
}

function pickText(value: unknown, lang: Lang): string {
  const b = toBilingual(value);
  if (!b) return '';
  const primary = lang === 'EN' ? b.en : b.es;
  return primary || b.en || b.es || '';
}

export function CombinadaDetailModal({ data, onClose, currentRiskMode }: CombinadaDetailModalProps) {
  const [lang, setLang] = useState<Lang>('ES');
  const [openLegs, setOpenLegs] = useState<Record<number, boolean>>({});
  const [llmOpen, setLlmOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    // Close on Escape
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data, onClose]);

  // Reset per-modal state when data changes
  useEffect(() => {
    setOpenLegs({});
    setLlmOpen(false);
  }, [data?.id]);

  const shortId = useMemo(() => (data?.id ?? '').slice(0, 6).toUpperCase(), [data?.id]);

  if (!data) return null;

  const totalLegs = data.legs;
  const settledPicks = data.settledPicks ?? 0;
  const wonPicks = data.wonPicks ?? 0;
  const isPending = data.settlement?.toLowerCase() === 'pending';
  const summaryText = pickText(data.summary, lang);
  const reasoningText = pickText(data.reasoning, lang);

  const toggleLeg = (i: number) => setOpenLegs((o) => ({ ...o, [i]: !o[i] }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] max-h-[85vh] flex flex-col rounded-[20px] overflow-hidden font-sans text-text-primary"
        style={{
          background: '#121A2B',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 px-6 py-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Predicta · Combinada
              </span>
              <span
                className="font-mono text-[10px] text-text-muted px-[7px] py-[2px] rounded border border-[rgba(255,255,255,0.08)] bg-white/[0.04]"
              >
                #{shortId}
              </span>
            </div>
            <h2 className="font-display text-[22px] font-semibold leading-none tracking-tight">
              Combinada Detail
            </h2>
            <div className="flex items-center gap-2.5 flex-wrap">
              {currentRiskMode && <ModeBadge mode={currentRiskMode} />}
              {data.type === 'premium' && <PremiumPill />}
              <span className="w-[3px] h-[3px] rounded-sm bg-text-muted" />
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted tabular-nums">
                <Clock size={12} />
                {formatDateTime(data.createdAt)}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats strip */}
        <div
          className="flex items-stretch gap-5 px-6 py-4"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <ConfidenceRing value={data.combinedConfidence} size={52} stroke={4} />
            <div className="flex flex-col justify-center gap-1 min-w-0">
              <StatLabel>Confidence</StatLabel>
              <span className="font-sans text-xs font-medium text-text-secondary">
                {data.combinedConfidence >= 75 ? 'High' : data.combinedConfidence >= 50 ? 'Medium' : 'Low'}
              </span>
            </div>
          </div>

          <StatDivider />

          <div className="flex flex-col justify-center gap-1 min-w-0">
            <StatLabel>Odds</StatLabel>
            <span className="font-display text-[22px] font-semibold leading-none tracking-tight tabular-nums">
              {data.combinedOdds ? Number(data.combinedOdds).toFixed(2) : '—'}
            </span>
          </div>

          <StatDivider />

          <div className="flex flex-col justify-center gap-1 min-w-0">
            <StatLabel>Legs</StatLabel>
            <span className="font-display text-[22px] font-semibold leading-none tracking-tight tabular-nums">
              {isPending ? (
                totalLegs
              ) : (
                <>
                  {wonPicks}
                  <span className="font-medium text-base text-text-muted">
                    /{settledPicks || totalLegs}
                  </span>
                </>
              )}
            </span>
          </div>

          <StatDivider />

          <div className="flex flex-col justify-center gap-1 min-w-0">
            <StatLabel>Settlement</StatLabel>
            <div className="mt-0.5">
              <SettlementBadge status={data.settlement} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-6 flex flex-col gap-5">
          {/* AI Summary */}
          {summaryText && (
            <section className="flex flex-col gap-2.5">
              <BlockHead
                title={
                  <>
                    <Sparkles size={14} className="text-accent" />
                    AI Summary
                  </>
                }
                right={<LangToggle value={lang} onChange={setLang} />}
              />
              <div
                className="p-4 rounded-[14px]"
                style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="m-0 text-[13.5px] leading-[1.6] text-text-secondary" style={{ textWrap: 'pretty' }}>
                  {summaryText}
                </p>
              </div>
            </section>
          )}

          {/* Picks */}
          <section className="flex flex-col gap-2.5">
            <BlockHead
              title={
                <>
                  <Layers size={14} className="text-secondary" />
                  Picks <span className="text-text-muted font-medium ml-0.5">· {totalLegs} legs</span>
                </>
              }
            />
            <div className="flex flex-col gap-2.5">
              {data.picks.map((leg, i) => {
                const isOpen = !!openLegs[i];
                const reasonText = pickText(leg.reasoning, lang);
                return (
                  <article
                    key={i}
                    className="rounded-[14px] overflow-hidden transition-colors"
                    style={{
                      background: isOpen ? '#182235' : '#121A2B',
                      border: `1px solid ${isOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleLeg(i)}
                      className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-3.5 px-3.5 py-3.5 bg-transparent border-0 cursor-pointer text-left text-inherit font-inherit"
                    >
                      <div className="flex items-center">
                        <Crest team={leg.homeTeam} size={24} variant={i} />
                        <div style={{ width: 20 }}>
                          <div style={{ marginLeft: -8 }}>
                            <Crest team={leg.awayTeam} size={24} variant={i + 3} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-sm font-semibold tracking-tight text-text-primary truncate">
                          {leg.homeTeam}
                          <span className="text-text-muted font-normal mx-0.5">vs</span>
                          {leg.awayTeam}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          <span
                            className="px-[7px] py-[2px] rounded font-semibold tracking-wide"
                            style={{
                              background: 'rgba(77,168,255,0.10)',
                              color: '#93C5FD',
                              border: '1px solid rgba(77,168,255,0.18)',
                            }}
                          >
                            {leg.competitionName}
                          </span>
                          <span className="w-[2px] h-[2px] rounded-sm bg-text-muted" />
                          <span className="font-mono text-[11px] text-text-muted">
                            {leg.market}: <span className="text-text-primary font-semibold">{leg.pick}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-text-secondary tabular-nums"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <Target size={11} />
                          {leg.confidence}%
                        </span>
                        <SettlementBadge status={leg.result} size="sm" />
                        <span
                          className="inline-flex transition-transform duration-200 text-text-muted"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        >
                          <ChevronDown size={14} />
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div
                        className="px-4 pt-3.5 pb-4 flex flex-col gap-3"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Reasoning
                          </span>
                          <LangToggle value={lang} onChange={setLang} />
                        </div>
                        <p
                          className="m-0 text-[13px] leading-[1.6] text-text-secondary"
                          style={{ textWrap: 'pretty' }}
                        >
                          {reasonText || <span className="text-text-muted italic">No reasoning provided.</span>}
                        </p>
                        {leg.odds != null && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <LegStat label="Odds" value={leg.odds.toFixed(2)} />
                            <LegStat label="Confidence" value={`${leg.confidence}%`} />
                            <LegStat label="Result" value={(leg.result || 'pending').toUpperCase()} />
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* LLM Reasoning */}
          {reasoningText && (
            <section className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setLlmOpen((o) => !o)}
                className="flex items-center justify-between px-3.5 py-3 rounded-[12px] cursor-pointer text-inherit font-inherit border-0"
                style={{ background: '#182235', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-text-primary tracking-tight">
                  <Brain size={14} className="text-accent" />
                  LLM Reasoning
                  <span className="text-text-muted font-medium ml-0.5">· coherence & correlations</span>
                </span>
                <span
                  className="inline-flex transition-transform duration-200 text-text-muted"
                  style={{ transform: llmOpen ? 'rotate(180deg)' : 'none' }}
                >
                  <ChevronDown size={14} />
                </span>
              </button>
              {llmOpen && (
                <pre
                  className="m-0 p-3.5 rounded-[12px] font-mono text-xs leading-[1.6] text-text-secondary overflow-y-auto"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 240,
                  }}
                >
                  {reasoningText}
                </pre>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </span>
  );
}

function StatDivider() {
  return <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.08)' }} />;
}

function BlockHead({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-text-primary tracking-tight">
        {title}
      </div>
      {right}
    </div>
  );
}

function LegStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn('px-2.5 py-2 rounded-lg')}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">{label}</div>
      <div className="font-display text-sm font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}
