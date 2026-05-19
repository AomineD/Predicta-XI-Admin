'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type NewsType = 'injury' | 'suspension' | 'lineup' | 'transfer' | 'tactical' | 'other';
type Severity = 'critical' | 'major' | 'minor';

interface AffectedPlayer {
  playerId?: number | null;
  name: string;
  position?: string | null;
  returnDate?: string | null;
  note?: string | null;
}

interface TeamNewsRow {
  id: number;
  teamId: number;
  source: string;
  sourceUrl: string | null;
  headline: string;
  body: string | null;
  publishedAt: string;
  scrapedAt: string;
  newsType: NewsType;
  severity: Severity | null;
  affectedPlayers: AffectedPlayer[];
  createdAt: string;
}

const NEWS_TYPES: NewsType[] = ['injury', 'suspension', 'lineup', 'transfer', 'tactical', 'other'];
const SEVERITIES: Array<{ value: Severity | ''; label: string }> = [
  { value: '', label: '—' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
];

const SEVERITY_BADGE: Record<Severity, { bg: string; color: string; border: string }> = {
  critical: { bg: 'rgba(239,68,68,0.15)', color: '#FCA5A5', border: 'rgba(239,68,68,0.35)' },
  major:    { bg: 'rgba(255,176,46,0.15)', color: '#FFB02E', border: 'rgba(255,176,46,0.35)' },
  minor:    { bg: 'rgba(124,196,255,0.12)', color: '#7CC4FF', border: 'rgba(124,196,255,0.3)' },
};

const NEWS_TYPE_EMOJI: Record<NewsType, string> = {
  injury: '🤕',
  suspension: '🚫',
  lineup: '📋',
  transfer: '🔄',
  tactical: '🎯',
  other: 'ℹ️',
};

function toLocalDatetimeInputValue(date: Date): string {
  // <input type="datetime-local"> expects YYYY-MM-DDTHH:mm in local time.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Defense-in-depth: only allow http(s) source URLs to be rendered as
 * clickable links. Backend stores admin-curated + Flashscore-scraped URLs
 * which today are all http(s), but a future scrape bug or template change
 * could surface `javascript:` / `data:` hrefs. React's escaping handles
 * textContent but NOT href values — see security review item 3 (HIGH-ish).
 */
function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return raw;
  } catch {
    // Not a parseable URL — drop it.
  }
  return null;
}

export function TeamNewsManager({
  teamId,
  teamName,
  onClose,
}: {
  teamId: number;
  teamName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: news, isLoading, error } = useQuery<TeamNewsRow[]>({
    queryKey: ['team-news', teamId],
    queryFn: () => api.get<TeamNewsRow[]>(`/admin/teams/${teamId}/news?limit=50`),
  });

  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [newsType, setNewsType] = useState<NewsType>('injury');
  const [severity, setSeverity] = useState<Severity | ''>('major');
  const [sourceUrl, setSourceUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState<string>(() => toLocalDatetimeInputValue(new Date()));
  const [affectedRaw, setAffectedRaw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setHeadline('');
    setBody('');
    setNewsType('injury');
    setSeverity('major');
    setSourceUrl('');
    setPublishedAt(toLocalDatetimeInputValue(new Date()));
    setAffectedRaw('');
    setFormError(null);
  };

  const createMut = useMutation({
    mutationFn: () => {
      const affectedPlayers = affectedRaw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          // Lightweight per-line shape: "Name | returnDate"  (returnDate optional)
          // e.g. "Lamine Yamal | 2026-06-25"
          const [name, returnDate] = line.split('|').map((s) => s.trim());
          return {
            name,
            ...(returnDate ? { returnDate } : {}),
          };
        });
      return api.post<TeamNewsRow>(`/admin/teams/${teamId}/news`, {
        headline: headline.trim(),
        body: body.trim() || null,
        newsType,
        severity: severity || null,
        sourceUrl: sourceUrl.trim() || null,
        publishedAt: new Date(publishedAt).toISOString(),
        affectedPlayers,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-news', teamId] });
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/team-news/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-news', teamId] }),
  });

  const syncMut = useMutation<{
    teamId: number;
    teamName: string;
    scraped: number;
    alreadyKnown: number;
    tooOld: number;
    classified: number;
    skippedNotRelevant: number;
    inserted: number;
    skippedNoSlug?: boolean;
    error?: string;
  }>({
    mutationFn: () => api.post(`/admin/teams/${teamId}/news/sync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-news', teamId] }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!headline.trim()) {
      setFormError('Headline es obligatorio');
      return;
    }
    createMut.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-2xl flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div>
            <h2 className="text-base font-bold text-text-primary font-sans">📰 Team News</h2>
            <p className="text-xs text-text-muted font-sans">{teamName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncMut.mutate()}
              loading={syncMut.isPending}
              title="Scrape Flashscore /team/news/, classify via LLM, persist new entries"
            >
              🔄 Sync from Flashscore
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>

        {syncMut.data && !syncMut.isPending && (
          <div
            className="mx-6 mt-3 rounded-xl p-2 text-xs"
            style={{
              background: syncMut.data.error
                ? 'rgba(239,68,68,0.1)'
                : syncMut.data.skippedNoSlug
                  ? 'rgba(255,176,46,0.1)'
                  : 'rgba(124,255,91,0.1)',
              border: `1px solid ${syncMut.data.error
                ? 'rgba(239,68,68,0.3)'
                : syncMut.data.skippedNoSlug
                  ? 'rgba(255,176,46,0.3)'
                  : 'rgba(124,255,91,0.3)'}`,
              color: syncMut.data.error
                ? '#FCA5A5'
                : syncMut.data.skippedNoSlug
                  ? '#FFB02E'
                  : '#7CFF5B',
            }}
          >
            {syncMut.data.error
              ? `Error: ${syncMut.data.error}`
              : syncMut.data.skippedNoSlug
                ? 'Skipped: team has no flashscore_slug. Edit the team to add one.'
                : `Synced: scraped ${syncMut.data.scraped} · classified ${syncMut.data.classified} · inserted ${syncMut.data.inserted} · already known ${syncMut.data.alreadyKnown} · too old ${syncMut.data.tooOld} · not relevant ${syncMut.data.skippedNotRelevant}`}
          </div>
        )}
        {syncMut.error && (
          <div
            className="mx-6 mt-3 rounded-xl p-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
          >
            Sync failed: {(syncMut.error as Error).message}
          </div>
        )}

        {/* Body — form + list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted font-sans mb-1">Headline *</label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Lamine Yamal lesión muscular grado 2"
                maxLength={280}
                className="w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted font-sans mb-1">News type</label>
                <select
                  value={newsType}
                  onChange={(e) => setNewsType(e.target.value as NewsType)}
                  className="w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
                >
                  {NEWS_TYPES.map((t) => (
                    <option key={t} value={t}>{NEWS_TYPE_EMOJI[t]} {t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted font-sans mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity | '')}
                  className="w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted font-sans mb-1">
                Affected players (uno por línea, formato <span className="font-mono">Name | returnDate (YYYY-MM-DD)</span>)
              </label>
              <textarea
                value={affectedRaw}
                onChange={(e) => setAffectedRaw(e.target.value)}
                placeholder="Lamine Yamal | 2026-06-25
Pedri"
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted font-mono"
              />
              <p className="text-[10px] text-text-muted mt-1">
                Los nombres se normalizan contra el squad snapshot del equipo. returnDate es opcional.
              </p>
            </div>

            <div>
              <label className="block text-xs text-text-muted font-sans mb-1">Body (opcional)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Detalle ampliatorio. Hasta 4000 caracteres."
                maxLength={4000}
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted font-sans mb-1">Published at *</label>
                <input
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted font-sans mb-1">Source URL (opcional, http(s))</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
                />
              </div>
            </div>

            {formError && <p className="text-xs text-danger">{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Reset</Button>
              <Button type="submit" variant="primary" size="sm" loading={createMut.isPending}>
                Add news
              </Button>
            </div>
          </form>

          {/* Divider */}
          <div className="border-t border-white/8" />

          {/* List */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans mb-2">
              Recent news ({news?.length ?? 0})
            </h3>
            {isLoading && <p className="text-text-muted text-sm font-sans">Cargando…</p>}
            {error && <p className="text-danger text-sm font-sans">{(error as Error).message}</p>}
            {!isLoading && (news ?? []).length === 0 && (
              <p className="text-text-muted text-sm font-sans">Sin noticias todavía.</p>
            )}
            <div className="space-y-2">
              {(news ?? []).map((n) => {
                const badge = n.severity ? SEVERITY_BADGE[n.severity] : null;
                return (
                  <div
                    key={n.id}
                    className="rounded-xl p-3"
                    style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs">{NEWS_TYPE_EMOJI[n.newsType]}</span>
                          <span className="text-xs font-mono text-text-muted uppercase">{n.newsType}</span>
                          {badge && (
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                            >
                              {n.severity}
                            </span>
                          )}
                          <span className="text-[10px] text-text-muted font-mono">{daysAgo(n.publishedAt)}d ago</span>
                          {n.source !== 'manual' && (
                            <span className="text-[10px] text-text-muted font-mono">via {n.source}</span>
                          )}
                        </div>
                        <p className="text-sm text-text-primary font-sans">{n.headline}</p>
                        {n.body && <p className="text-xs text-text-secondary mt-1 font-sans">{n.body}</p>}
                        {n.affectedPlayers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {n.affectedPlayers.map((p, idx) => (
                              <span
                                key={`${n.id}-${idx}`}
                                className="text-[11px] font-mono bg-surface-3 rounded px-1.5 py-0.5 text-text-secondary"
                              >
                                {p.name}{p.returnDate ? ` → ${p.returnDate}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const safeUrl = safeHttpUrl(n.sourceUrl);
                          return safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] text-text-muted underline hover:text-text-primary mt-1 inline-block"
                            >
                              source
                            </a>
                          ) : null;
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Eliminar noticia "${n.headline}"?`)) {
                            deleteMut.mutate(n.id);
                          }
                        }}
                        disabled={deleteMut.isPending}
                        className="text-xs text-danger hover:text-danger/70 font-sans disabled:opacity-50 shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
