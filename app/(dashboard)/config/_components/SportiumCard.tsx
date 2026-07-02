'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/inputs';
import { Toggle } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { CouponUrlsEditor } from './controls';
import type { CompetitionLite, SportiumConfig } from './types';

/**
 * Sportium odds scraping — autocontenida (su propia tabla sportium_config con
 * GET/PUT propios). Vive en la pestaña Automations junto a las tareas programadas.
 */
export function SportiumCard({ competitions }: { competitions: CompetitionLite[] }) {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: sportiumCfg } = useQuery<{ config: SportiumConfig | null }>({
    queryKey: ['sportium-config'],
    queryFn: () => api.get('/admin/sportium/config'),
  });

  const [sportiumForm, setSportiumForm] = useState<SportiumConfig | null>(null);
  const sportiumInitial = useMemo<SportiumConfig | null>(() => {
    const c = sportiumCfg?.config;
    if (!c) return null;
    return {
      enabled: c.enabled ?? false,
      influencePredictions: c.influencePredictions ?? false,
      // numeric column arrives as a string from the API
      matchConfidenceMin: Number(c.matchConfidenceMin ?? 0.85),
      couponUrls: Array.isArray(c.couponUrls) ? c.couponUrls : [],
      captureV1: c.captureV1 ?? true,
      captureV2: c.captureV2 ?? true,
      requestTimeoutMs: c.requestTimeoutMs ?? 15000,
    };
  }, [sportiumCfg]);
  const sportium = sportiumForm ?? sportiumInitial;

  const saveSportium = useMutation({
    mutationFn: (body: SportiumConfig) =>
      api.put('/admin/sportium/config', {
        enabled: body.enabled,
        influencePredictions: body.influencePredictions,
        matchConfidenceMin: body.matchConfidenceMin,
        captureV1: body.captureV1,
        captureV2: body.captureV2,
        requestTimeoutMs: body.requestTimeoutMs,
        // drop blank rows; the backend requires a non-empty url per entry
        couponUrls: body.couponUrls
          .filter((c) => c.url.trim() !== '' && Number.isInteger(c.competitionId))
          .map((c) => ({ competitionId: c.competitionId, url: c.url.trim() })),
      }),
    onSuccess: () => {
      setSportiumForm(null);
      toast.success('Sportium settings saved.');
      qc.invalidateQueries({ queryKey: ['sportium-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Auto-detect coupons: scrapes Sportium's competition list and proposes a slug
  // per V1 competition (by country + name). Fills the editor; the admin reviews
  // and Saves. Read-only on the backend — it never writes the config.
  const detectCoupons = useMutation({
    mutationFn: () =>
      api.post('/admin/sportium/detect-coupons', {}) as Promise<{
        proposals: Array<{ competitionId: number; competitionName: string; sportiumName: string; slug: string; confidence: number }>;
        unmatched: string[];
      }>,
    onSuccess: (data) => {
      const base = sportium ?? sportiumInitial;
      if (!base) return;
      const byId = new Map(base.couponUrls.map((c) => [c.competitionId, { ...c }]));
      for (const p of data.proposals) byId.set(p.competitionId, { competitionId: p.competitionId, url: p.slug });
      setSportiumForm({ ...base, couponUrls: [...byId.values()] });
      const um = data.unmatched.length ? ` No match (likely off-season): ${data.unmatched.join(', ')}.` : '';
      toast.success(`Detected ${data.proposals.length} coupon(s) — applied below. Review & Save.${um}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <SectionCard
      title="Sportium odds (scraping)"
      subtitle="Scrapes Sportium Colombia odds during enrichment (V1/V2) and uses them as the PRIMARY odds source (Flashscore fallback). Also requires SPORTIUM_ENABLED in the Backend + Worker environment. Inert until the master switch below is on and at least one coupon is set."
    >
      {!sportium ? (
        <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
      ) : (
        <>
          <Field label="Module enabled" subtitle="Master switch. Off = nothing is scraped or matched. With the env flag on too, captures start resolving + snapshotting.">
            <Toggle value={sportium.enabled} onChange={(v) => setSportiumForm({ ...sportium, enabled: v })} />
          </Field>
          <Field label="Influence predictions" subtitle="Off (recommended at first): only snapshots odds so you can validate the matching. On: Sportium odds enter the prediction context (primary, Flashscore fallback).">
            <Toggle value={sportium.influencePredictions} onChange={(v) => setSportiumForm({ ...sportium, influencePredictions: v })} />
          </Field>
          <Field label="Capture at V1" subtitle="Capture during early enrichment (no lineups yet).">
            <Toggle value={sportium.captureV1} onChange={(v) => setSportiumForm({ ...sportium, captureV1: v })} />
          </Field>
          <Field label="Capture at V2" subtitle="Capture during lineup enrichment (gives V1→V2 line movement).">
            <Toggle value={sportium.captureV2} onChange={(v) => setSportiumForm({ ...sportium, captureV2: v })} />
          </Field>
          <Field label="Min match confidence" subtitle="0–1. At or above = auto-linked; just below = sent to the review queue. Default 0.85.">
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="w-24"
              value={sportium.matchConfidenceMin}
              onChange={(e) => setSportiumForm({ ...sportium, matchConfidenceMin: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Scrape timeout (ms)" subtitle="Short per-scrape cap so a slow Sportium degrades to Flashscore fast (2000–60000).">
            <Input
              type="number"
              min={2000}
              max={60000}
              step={500}
              className="w-28"
              value={sportium.requestTimeoutMs}
              onChange={(e) => setSportiumForm({ ...sportium, requestTimeoutMs: Math.min(60000, Math.max(2000, Number(e.target.value) || 15000)) })}
            />
          </Field>
          <Field label="Coupons per competition" subtitle="Explicit map: each competition → its Sportium coupon (slug soccer-<cc>-sb_type_<id> or full URL). Empty = nothing scraped. World Cup 2026: soccer-int2-sb_type_296772.">
            <div className="space-y-2 w-full">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" loading={detectCoupons.isPending} onClick={() => detectCoupons.mutate()}>
                  Auto-detect
                </Button>
                <span className="text-xs text-text-muted/60 font-sans">
                  Scrapes Sportium and fills the rows by country + name. Off-season leagues won&apos;t be found.
                </span>
              </div>
              <CouponUrlsEditor
                competitions={competitions}
                value={sportium.couponUrls}
                onChange={(v) => setSportiumForm({ ...sportium, couponUrls: v })}
              />
            </div>
          </Field>
          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={saveSportium.isPending} onClick={() => saveSportium.mutate(sportium)}>
              Save Sportium
            </Button>
            {sportium.enabled && !sportium.influencePredictions && (
              <span className="text-xs font-sans text-warning">Enabled in validation mode (does not affect predictions yet).</span>
            )}
            {sportium.enabled && sportium.influencePredictions && (
              <span className="text-xs font-sans text-success">Enabled and influencing predictions.</span>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
