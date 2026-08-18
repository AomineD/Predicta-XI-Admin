'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { useToast } from '@/components/ui/ToastProvider';
import type { MaintenanceCreditsConfig, MatchRatingsConfig, PredictionGradeScale } from './types';

type ReEnrichPreview = {
  dryRun: true;
  validCount: number;
  invalidCount: number;
  preview: Array<{ matchId: number; kickoff: string | null; status: string | null; enrichmentPhase: number | null; home: string; away: string }>;
  invalid: Array<{ matchId: number; reason: string }>;
};

function parseReEnrichIds(raw: string): number[] {
  const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const t of tokens) {
    const n = Number.parseInt(t, 10);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Encabezado que agrupa un bloque de cards dentro de la pestaña Maintenance,
 * para romper el "muro" de tarjetas apiladas. */
function GroupHeader({ title, subtitle, info }: { title: string; subtitle?: string; info?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-6 first:mt-0">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-text-primary font-display">{title}</h3>
        {info && <InfoPopover label={`Qué es "${title}"`}>{info}</InfoPopover>}
      </div>
      {subtitle && <p className="text-xs text-text-muted font-sans mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function MaintenanceTab() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: maintCfg } = useQuery<MaintenanceCreditsConfig>({
    queryKey: ['credits-config-maintenance'],
    queryFn: () => api.get('/admin/credits-config'),
  });

  const invalidateMaint = () => qc.invalidateQueries({ queryKey: ['credits-config-maintenance'] });

  // ── App maintenance mode ──
  const [maintForm, setMaintForm] = useState<{ enabled: boolean; message: string } | null>(null);
  const maintInitial = useMemo(
    () => (maintCfg ? { enabled: maintCfg.maintenanceMode, message: maintCfg.maintenanceMessage ?? '' } : null),
    [maintCfg],
  );
  const maint = maintForm ?? maintInitial;

  const saveMaintenance = useMutation({
    mutationFn: (body: { maintenanceMode: boolean; maintenanceMessage: string | null }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setMaintForm(null);
      toast.success('Maintenance settings saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Force Update Gate ──
  const [forceForm, setForceForm] = useState<{ build: number; version: string } | null>(null);
  const forceInitial = useMemo(
    () => (maintCfg ? { build: maintCfg.minSupportedBuild, version: maintCfg.minSupportedVersion ?? '' } : null),
    [maintCfg],
  );
  const force = forceForm ?? forceInitial;

  const saveForceUpdate = useMutation({
    mutationFn: (body: { minSupportedBuild: number; minSupportedVersion: string | null }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setForceForm(null);
      toast.success('Force-update settings saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Recommended Update ──
  const [recForm, setRecForm] = useState<{ build: number; version: string } | null>(null);
  const recInitial = useMemo(
    () => (maintCfg ? { build: maintCfg.minRecommendedBuild, version: maintCfg.recommendedVersion ?? '' } : null),
    [maintCfg],
  );
  const rec = recForm ?? recInitial;

  const saveRecommended = useMutation({
    mutationFn: (body: { minRecommendedBuild: number; recommendedVersion: string | null }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setRecForm(null);
      toast.success('Recommended-update settings saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Social features ──
  type SocialForm = {
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
  };
  const [socialForm, setSocialForm] = useState<SocialForm | null>(null);
  const socialInitial = useMemo<SocialForm | null>(
    () =>
      maintCfg
        ? {
            socialEnabled: maintCfg.socialEnabled,
            combinadaSharesEnabled: maintCfg.combinadaSharesEnabled,
            socialXEnabled: maintCfg.socialXEnabled,
            socialXUrl: maintCfg.socialXUrl ?? '',
            socialFacebookEnabled: maintCfg.socialFacebookEnabled,
            socialFacebookUrl: maintCfg.socialFacebookUrl ?? '',
            socialTelegramEnabled: maintCfg.socialTelegramEnabled,
            socialTelegramUrl: maintCfg.socialTelegramUrl ?? '',
            socialInstagramEnabled: maintCfg.socialInstagramEnabled,
            socialInstagramUrl: maintCfg.socialInstagramUrl ?? '',
          }
        : null,
    [maintCfg],
  );
  const social = socialForm ?? socialInitial;

  const saveSocial = useMutation({
    mutationFn: (body: SocialForm) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setSocialForm(null);
      toast.success('Social settings saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Live match tracker ──
  const [liveTrackerForm, setLiveTrackerForm] = useState<{ liveTrackerEnabled: boolean } | null>(null);
  const liveTrackerInitial = useMemo(() => (maintCfg ? { liveTrackerEnabled: maintCfg.liveTrackerEnabled } : null), [maintCfg]);
  const liveTracker = liveTrackerForm ?? liveTrackerInitial;

  const saveLiveTracker = useMutation({
    mutationFn: (body: { liveTrackerEnabled: boolean }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setLiveTrackerForm(null);
      toast.success('Live tracker setting saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Live scores (real-time via ESPN) + goal celebration (idea #28) ──
  // Both live in the same card because the celebration is driven by the live score:
  // with `liveScoresEnabled` off there is no score change to detect, so turning the
  // celebration on alone does nothing.
  type LiveScoresForm = { liveScoresEnabled: boolean; goalCelebrationEnabled: boolean };
  const [liveScoresForm, setLiveScoresForm] = useState<LiveScoresForm | null>(null);
  const liveScoresInitial = useMemo(
    () =>
      maintCfg
        ? { liveScoresEnabled: maintCfg.liveScoresEnabled, goalCelebrationEnabled: maintCfg.goalCelebrationEnabled }
        : null,
    [maintCfg],
  );
  const liveScores = liveScoresForm ?? liveScoresInitial;

  const saveLiveScores = useMutation({
    mutationFn: (body: LiveScoresForm) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setLiveScoresForm(null);
      toast.success('Live scores setting saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Home announcements ──
  const [homeAnnouncementsForm, setHomeAnnouncementsForm] = useState<{ homeAnnouncementsEnabled: boolean } | null>(null);
  const homeAnnouncementsInitial = useMemo(
    () => (maintCfg ? { homeAnnouncementsEnabled: maintCfg.homeAnnouncementsEnabled } : null),
    [maintCfg],
  );
  const homeAnnouncements = homeAnnouncementsForm ?? homeAnnouncementsInitial;

  const saveHomeAnnouncements = useMutation({
    mutationFn: (body: { homeAnnouncementsEnabled: boolean }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setHomeAnnouncementsForm(null);
      toast.success('Home announcements setting saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Subscriber identity (idea #22) ──
  const [subIdentityForm, setSubIdentityForm] = useState<{ subscriberIdentityEnabled: boolean } | null>(null);
  const subIdentityInitial = useMemo(
    () => (maintCfg ? { subscriberIdentityEnabled: maintCfg.subscriberIdentityEnabled } : null),
    [maintCfg],
  );
  const subIdentity = subIdentityForm ?? subIdentityInitial;

  const saveSubIdentity = useMutation({
    mutationFn: (body: { subscriberIdentityEnabled: boolean }) => api.put('/admin/credits-config', body),
    onSuccess: () => {
      setSubIdentityForm(null);
      toast.success('Subscriber identity setting saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Match ratings (idea #30) ──
  const [matchRatingsForm, setMatchRatingsForm] = useState<{
    matchRatingsEnabled: boolean;
    matchRatingsConfig: MatchRatingsConfig;
  } | null>(null);
  const matchRatingsInitial = useMemo(
    () =>
      maintCfg
        ? {
            matchRatingsEnabled: maintCfg.matchRatingsEnabled,
            matchRatingsConfig: maintCfg.matchRatingsConfig,
          }
        : null,
    [maintCfg],
  );
  const matchRatings = matchRatingsForm ?? matchRatingsInitial;

  const saveMatchRatings = useMutation({
    mutationFn: (body: { matchRatingsEnabled: boolean; matchRatingsConfig: MatchRatingsConfig }) =>
      api.put('/admin/credits-config', body),
    onSuccess: () => {
      setMatchRatingsForm(null);
      toast.success('Match ratings setting saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /** Ajusta un tunable sin perder el resto del objeto. */
  const setRatingsTunable = (key: keyof MatchRatingsConfig, value: number) => {
    if (!matchRatings) return;
    setMatchRatingsForm({
      ...matchRatings,
      matchRatingsConfig: { ...matchRatings.matchRatingsConfig, [key]: value },
    });
  };

  // ── Escala de grados de la predicción ──
  const [gradeScaleForm, setGradeScaleForm] = useState<PredictionGradeScale | null>(null);
  const gradeScale = gradeScaleForm ?? maintCfg?.predictionGradeScale ?? null;

  const saveGradeScale = useMutation({
    mutationFn: (body: { predictionGradeScale: PredictionGradeScale }) =>
      api.put('/admin/credits-config', body),
    onSuccess: () => {
      setGradeScaleForm(null);
      toast.success('Prediction grade scale saved.');
      invalidateMaint();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setGradeCut = (key: keyof PredictionGradeScale, value: number) => {
    if (!gradeScale) return;
    setGradeScaleForm({ ...gradeScale, [key]: value });
  };

  // Los cortes tienen que ir estrictamente descendentes. El backend lo corrige
  // al guardar, pero avisarlo aquí evita que Diego guarde algo que reaparece
  // cambiado sin explicación.
  const gradeScaleOutOfOrder =
    !!gradeScale && !(gradeScale.excelente > gradeScale.bueno && gradeScale.bueno > gradeScale.medio);

  /** Cuántos aciertos de 14 caen en cada grado con los cortes actuales. */
  const gradePreview = (() => {
    if (!gradeScale) return null;
    const gradeOf = (won: number): string => {
      if (won <= 0) return 'FATAL';
      const pct = Math.round((won / 14) * 100);
      if (pct >= 100) return 'PERFECTO';
      if (pct >= gradeScale.excelente) return 'EXCELENTE';
      if (pct >= gradeScale.bueno) return 'BUENO';
      if (pct >= gradeScale.medio) return 'MEDIO';
      return 'BAJO';
    };
    const rows: { grade: string; from: number; to: number }[] = [];
    for (let won = 14; won >= 0; won--) {
      const grade = gradeOf(won);
      const last = rows[rows.length - 1];
      if (last && last.grade === grade) last.to = won;
      else rows.push({ grade, from: won, to: won });
    }
    return rows;
  })();

  // ── Data Maintenance: backfill stats ──
  const [showBackfillConfirm, setShowBackfillConfirm] = useState(false);
  const backfillStats = useMutation({
    mutationFn: () => api.post('/admin/results/backfill-stats', {}) as Promise<{ jobId: number }>,
    onSuccess: (data: { jobId: number }) => {
      localStorage.setItem('predicta:stats-backfill-done', '1');
      setShowBackfillConfirm(false);
      toast.success(`Backfill job #${data.jobId} started. Check Jobs page for progress.`);
    },
    onError: (err: Error) => {
      setShowBackfillConfirm(false);
      toast.error(err.message);
    },
  });

  // ── Data Maintenance: re-enrich batch ──
  const [reEnrichInput, setReEnrichInput] = useState('');
  const [reEnrichPreview, setReEnrichPreview] = useState<ReEnrichPreview | null>(null);
  const [showReEnrichConfirm, setShowReEnrichConfirm] = useState(false);

  const reEnrichPreviewMutation = useMutation({
    mutationFn: (ids: number[]) => api.post('/admin/enrichment/re-enrich-batch', { matchIds: ids, dryRun: true }) as Promise<ReEnrichPreview>,
    onSuccess: (data) => setReEnrichPreview(data),
    onError: (err: Error) => {
      setReEnrichPreview(null);
      toast.error(err.message);
    },
  });

  const reEnrichRunMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post('/admin/enrichment/re-enrich-batch', { matchIds: ids, dryRun: false }) as Promise<{ jobId: number; accepted: number; rejected: number }>,
    onSuccess: (data) => {
      setShowReEnrichConfirm(false);
      toast.success(
        `Job #${data.jobId} started — ${data.accepted} match${data.accepted === 1 ? '' : 'es'} queued (${data.rejected} rejected). Check Jobs page for progress.`,
      );
      setReEnrichPreview(null);
      setReEnrichInput('');
    },
    onError: (err: Error) => {
      setShowReEnrichConfirm(false);
      toast.error(err.message);
    },
  });

  // ── Danger zone ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const deleteAllMatches = useMutation({
    mutationFn: () => api.post('/admin/matches/delete-all', {}) as Promise<{ matchesDeleted: number; predictionsDeleted: number }>,
    onSuccess: (data) => {
      setShowDeleteConfirm(false);
      toast.success(`Deleted ${data.matchesDeleted} matches and ${data.predictionsDeleted} predictions.`);
      qc.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err: Error) => {
      setShowDeleteConfirm(false);
      toast.error(err.message);
    },
  });

  const deleteAllSportsData = useMutation({
    mutationFn: () =>
      api.post('/admin/sports-data/delete-all', {}) as Promise<{
        matchesDeleted: number;
        predictionsDeleted: number;
        teamsDeleted: number;
        competitionsDeleted: number;
      }>,
    onSuccess: (data) => {
      setShowDeleteAllConfirm(false);
      toast.success(
        `Deleted: ${data.matchesDeleted} matches, ${data.predictionsDeleted} predictions, ${data.teamsDeleted} teams, ${data.competitionsDeleted} competitions.`,
      );
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: Error) => {
      setShowDeleteAllConfirm(false);
      toast.error(err.message);
    },
  });

  const reEnrichIds = parseReEnrichIds(reEnrichInput);

  return (
    <div>
      <GroupHeader title="App gates" subtitle="Screens that block or nudge the mobile app." />

      {/* App Maintenance Mode */}
      <SectionCard title="App Maintenance Mode" info="Blocking maintenance screen for the mobile app. Turn this on for a controlled pause while the server stays up (e.g. fixing a bug). A real backend outage is handled separately — the app detects that on its own and shows the offline screen.">
        {!maint ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Maintenance mode" info="When on, the app shows the blocking maintenance screen to all users on launch and on resume.">
              <Toggle value={maint.enabled} onChange={(v) => setMaintForm({ ...maint, enabled: v })} />
            </Field>
            <Field label="Custom message" subtitle="Vacío = texto por defecto" info="Optional copy shown on the maintenance screen.">
              <Textarea
                maxLength={200}
                rows={2}
                className="resize-none"
                value={maint.message}
                onChange={(e) => setMaintForm({ ...maint, message: e.target.value })}
                placeholder="Estamos haciendo mejoras. Vuelve en un momento."
              />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveMaintenance.isPending}
                onClick={() => saveMaintenance.mutate({ maintenanceMode: maint.enabled, maintenanceMessage: maint.message.trim() === '' ? null : maint.message })}
              >
                Save maintenance
              </Button>
              {maint.enabled && <span className="text-xs font-sans text-warning">App is in maintenance mode for users.</span>}
            </div>
          </>
        )}
      </SectionCard>

      {/* Force Update Gate */}
      <SectionCard title="Force Update Gate" subtitle="0 = gate apagado" info="When the app's build number is below the minimum, it shows a blocking update screen — the only way to force an update on iOS. Raise it ONLY after a newer build is live on both stores.">
        {!force ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Minimum supported build" subtitle="0 = gate off" info="App builds with a buildNumber below this are forced to update.">
              <Input type="number" min={0} className="w-32" value={force.build} onChange={(e) => setForceForm({ ...force, build: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })} />
            </Field>
            <Field label="Minimum supported version" subtitle='Display-only label shown on the update screen, e.g. "1.4.0". Optional.'>
              <Input type="text" maxLength={20} value={force.version} onChange={(e) => setForceForm({ ...force, version: e.target.value })} placeholder="1.4.0" />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveForceUpdate.isPending}
                onClick={() => saveForceUpdate.mutate({ minSupportedBuild: force.build, minSupportedVersion: force.version.trim() === '' ? null : force.version.trim() })}
              >
                Save force-update
              </Button>
              {force.build > 0 && <span className="text-xs font-sans text-warning">Builds below {force.build} are blocked.</span>}
            </div>
          </>
        )}
      </SectionCard>

      {/* Recommended Update */}
      <SectionCard title="Recommended Update" subtitle="0 = apagado" info="Shows a DISMISSIBLE 'a new version is available' modal when the app's build number is below this — it never blocks the app, just nudges. The force-update gate above always wins when both thresholds apply.">
        {!rec ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Minimum recommended build" subtitle="0 = off" info="App builds with a buildNumber below this see a dismissible update modal.">
              <Input type="number" min={0} className="w-32" value={rec.build} onChange={(e) => setRecForm({ ...rec, build: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })} />
            </Field>
            <Field label="Recommended version" subtitle='Display-only label shown on the modal, e.g. "1.4.0". Optional.'>
              <Input type="text" maxLength={20} value={rec.version} onChange={(e) => setRecForm({ ...rec, version: e.target.value })} placeholder="1.4.0" />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveRecommended.isPending}
                onClick={() => saveRecommended.mutate({ minRecommendedBuild: rec.build, recommendedVersion: rec.version.trim() === '' ? null : rec.version.trim() })}
              >
                Save recommended-update
              </Button>
              {rec.build > 0 && <span className="text-xs font-sans text-text-muted">Builds below {rec.build} see the dismissible modal.</span>}
            </div>
          </>
        )}
      </SectionCard>

      <GroupHeader title="Feature flags" info="Ship-dark switches — turn on only once the build that contains them is live in the stores." />

      {/* Social features */}
      <SectionCard title="Social" subtitle="Ship-dark" info="Feature flags for the social layer. The code ships in the app build but stays hidden until turned on here. Turn these on only once the build that contains the social screens is live in the stores — otherwise users on an older build read about features they don't have.">
        {!social ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Social enabled (master)" info="Master switch for the whole social structure: friends (add / accept / block) and inviting a friend straight into a quiniela. Off = the app hides every social entry point and the endpoints respond 403.">
              <Toggle value={social.socialEnabled} onChange={(v) => setSocialForm({ ...social, socialEnabled: v })} />
            </Field>
            <Field label="Combinada sharing" info="Lets a user share a combinada with friends — each friend gets their own copy to compete. Off = the app hides the share CTA and the endpoints respond 403. Needs the master switch on to be useful.">
              <Toggle value={social.combinadaSharesEnabled} onChange={(v) => setSocialForm({ ...social, combinadaSharesEnabled: v })} />
            </Field>

            <div className="pt-2 border-t border-border mt-1">
              <p className="text-sm font-sans text-text-primary font-medium">Social links (Settings → Support)</p>
              <p className="text-xs font-sans text-text-muted mb-2">Per-network access shown in the app. Needs the master switch on. URL must be http(s); blank hides it.</p>
              {(
                [
                  { key: 'x', label: 'X (Twitter)', enabledKey: 'socialXEnabled', urlKey: 'socialXUrl', placeholder: 'https://x.com/predictaxi' },
                  { key: 'facebook', label: 'Facebook', enabledKey: 'socialFacebookEnabled', urlKey: 'socialFacebookUrl', placeholder: 'https://facebook.com/predictaxi' },
                  { key: 'telegram', label: 'Telegram', enabledKey: 'socialTelegramEnabled', urlKey: 'socialTelegramUrl', placeholder: 'https://t.me/predictaxi' },
                  { key: 'instagram', label: 'Instagram', enabledKey: 'socialInstagramEnabled', urlKey: 'socialInstagramUrl', placeholder: 'https://instagram.com/predictaxi' },
                ] as const
              ).map((net) => (
                <div key={net.key} className="flex items-center gap-3 py-2">
                  <span className="w-28 shrink-0 text-sm font-sans text-text-primary">{net.label}</span>
                  <Toggle value={social[net.enabledKey]} onChange={(v) => setSocialForm({ ...social, [net.enabledKey]: v })} />
                  <Input type="text" className="flex-1" value={social[net.urlKey]} onChange={(e) => setSocialForm({ ...social, [net.urlKey]: e.target.value })} placeholder={net.placeholder} />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-3">
              <Button variant="primary" loading={saveSocial.isPending} onClick={() => saveSocial.mutate(social)}>
                Save social
              </Button>
              {social.socialEnabled && <span className="text-xs font-sans text-success">Social is live for users on a build that includes it.</span>}
            </div>
          </>
        )}
      </SectionCard>

      {/* Live match tracker */}
      <SectionCard title="Live match tracker" subtitle="POC — mantener OFF" info="The 'Live' animated pitch on the match detail (idea #8). The widget is resolved live from aiscore/TheSports and shown de-branded. The code ships in the app build but stays hidden until turned on here. Keep it off until the legal decision is made.">
        {!liveTracker ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Live tracker enabled" info="Shows the animated live pitch (loaded in a webview) under the scoreboard while a match is live. Off = the app never shows the Live block. The endpoint also gates by live state and whether the match resolves to a tracker, so turning this on only reveals it where available.">
              <Toggle value={liveTracker.liveTrackerEnabled} onChange={(v) => setLiveTrackerForm({ liveTrackerEnabled: v })} />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button variant="primary" loading={saveLiveTracker.isPending} onClick={() => saveLiveTracker.mutate({ liveTrackerEnabled: liveTracker.liveTrackerEnabled })}>
                Save live tracker
              </Button>
              {liveTracker.liveTrackerEnabled && <span className="text-xs font-sans text-success">Live tracker is on for users on a build that includes it.</span>}
            </div>
          </>
        )}
      </SectionCard>

      {/* Live scores (real-time via ESPN) */}
      <SectionCard title="Live scores (real-time)" subtitle="Ship-dark" info="Real-time scoreboard on the match detail, polled directly from ESPN (idea #16). Master switch for both the backend event-binding scheduler and the app's live score polling. The code ships in the app build but stays hidden until turned on here — turn it on only once the build that includes it is live in the stores.">
        {!liveScores ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Live scores enabled" info="When on, the match screen updates the live score in real time (no more stale 0-0) and the backend runs the ESPN event-binding scheduler. Off = neither the scheduler nor the app polling run.">
              <Toggle value={liveScores.liveScoresEnabled} onChange={(v) => setLiveScoresForm({ ...liveScores, liveScoresEnabled: v })} />
            </Field>
            <Field label="Goal celebration" subtitle="Requiere live scores" info="Idea #28. When on, a goal animation plays and a sound fires as soon as the live score goes up — on the match screen and as a flash on the list cards. With no live score there is no goal to detect. Users can mute the sound and disable animations in the app's settings.">
              <Toggle
                value={liveScores.goalCelebrationEnabled}
                onChange={(v) => setLiveScoresForm({ ...liveScores, goalCelebrationEnabled: v })}
              />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button variant="primary" loading={saveLiveScores.isPending} onClick={() => saveLiveScores.mutate(liveScores)}>
                Save live scores
              </Button>
              {liveScores.liveScoresEnabled && <span className="text-xs font-sans text-success">Live scores are on for users on a build that includes it.</span>}
              {liveScores.goalCelebrationEnabled && !liveScores.liveScoresEnabled && (
                <span className="text-xs font-sans text-warning">Goal celebration does nothing while live scores are off.</span>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* Home announcements */}
      <SectionCard title="Home announcements" subtitle="Ship-dark" info="Master switch for the Home carousel (idea #11). The carousel ships in the app build but stays hidden until turned on here. Content is managed on the Home announcements page — but with this flag off, even published announcements never reach the app.">
        {!homeAnnouncements ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Home announcements enabled" info="Shows the announcements carousel on Home. Off = the app never shows it, regardless of how many announcements are published. Turn this on AND publish at least one announcement for the carousel to appear.">
              <Toggle value={homeAnnouncements.homeAnnouncementsEnabled} onChange={(v) => setHomeAnnouncementsForm({ homeAnnouncementsEnabled: v })} />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveHomeAnnouncements.isPending}
                onClick={() => saveHomeAnnouncements.mutate({ homeAnnouncementsEnabled: homeAnnouncements.homeAnnouncementsEnabled })}
              >
                Save home announcements
              </Button>
              {homeAnnouncements.homeAnnouncementsEnabled && (
                <span className="text-xs font-sans text-success">Home announcements are on for users on a build that includes the carousel.</span>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* Subscriber identity (idea #22) */}
      <SectionCard title="Subscriber identity" subtitle="Ship-dark" info="Animated PRO/CLUB visual identity wherever a person shows up (idea #22): friends, search, add-friend, quiniela management, the leaderboard table and King of the hill — tier ring, animated tag, gold name and 'member since'. The code ships in the app build but stays hidden until turned on here — turn it on only once the build that includes it is live in the stores.">
        {!subIdentity ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field label="Subscriber identity enabled" info="When on, subscriber (PRO/CLUB) surfaces show the enriched animated identity. Off = the app uses the plain previous tier render: no rings, tags or animations, and no 'member since'.">
              <Toggle value={subIdentity.subscriberIdentityEnabled} onChange={(v) => setSubIdentityForm({ subscriberIdentityEnabled: v })} />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveSubIdentity.isPending}
                onClick={() => saveSubIdentity.mutate({ subscriberIdentityEnabled: subIdentity.subscriberIdentityEnabled })}
              >
                Save subscriber identity
              </Button>
              {subIdentity.subscriberIdentityEnabled && (
                <span className="text-xs font-sans text-success">Subscriber identity is on for users on a build that includes it.</span>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* Match ratings (idea #30) */}
      <SectionCard
        title="Match ratings"
        subtitle="Ship-dark · 1 a 10" info="Community rating of a finished match (idea #30). Users rate from the match detail screen and see their rated-matches history in their profile. The published score is a Bayesian average, not the raw mean, so a handful of votes can't push a match to 10 or 1. The code ships in the app build but stays hidden until turned on here — turn it on only once the build that includes it is live in the stores."
      >
        {!matchRatings ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field
              label="Match ratings enabled"
              info="When on, users can rate finished matches. Off = the app hides the block and the endpoint rejects fail-closed. Already-submitted ratings are kept and stay visible in the user's history."
            >
              <Toggle
                value={matchRatings.matchRatingsEnabled}
                onChange={(v) => setMatchRatingsForm({ ...matchRatings, matchRatingsEnabled: v })}
              />
            </Field>
            <Field
              label="Rating window (hours)"
              subtitle="def. 72 h" info="Hours after kickoff during which a match can be rated or the rating changed. Keeps old matches from being rated en masse."
            >
              <Input
                type="number"
                min={1}
                max={336}
                value={matchRatings.matchRatingsConfig.windowHours}
                onChange={(e) => setRatingsTunable('windowHours', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Minimum votes to publish"
              subtitle="def. 10" info="Below this many votes the community score stays hidden. The vote count is still shown."
            >
              <Input
                type="number"
                min={1}
                max={10000}
                value={matchRatings.matchRatingsConfig.minVotesToShow}
                onChange={(e) => setRatingsTunable('minVotesToShow', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Prior weight"
              subtitle="def. 8" info="How many 'virtual votes' the prior is worth. Higher = the score moves away from the prior mean more slowly, so it resists review-bombing harder."
            >
              <Input
                type="number"
                min={1}
                max={1000}
                value={matchRatings.matchRatingsConfig.priorWeight}
                onChange={(e) => setRatingsTunable('priorWeight', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Prior mean"
              subtitle="def. 6.5" info="The score a match with few votes is pulled toward. It should sit near the global average rating."
            >
              <Input
                type="number"
                min={1}
                max={10}
                step="0.1"
                value={matchRatings.matchRatingsConfig.priorMean}
                onChange={(e) => setRatingsTunable('priorMean', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Max ratings per hour"
              subtitle="def. 10" info="Per-user cap. It applies to edits too, so a user can't keep flipping their own rating."
            >
              <Input
                type="number"
                min={1}
                max={1000}
                value={matchRatings.matchRatingsConfig.maxPerHour}
                onChange={(e) => setRatingsTunable('maxPerHour', Number(e.target.value))}
              />
            </Field>
            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveMatchRatings.isPending}
                onClick={() =>
                  saveMatchRatings.mutate({
                    matchRatingsEnabled: matchRatings.matchRatingsEnabled,
                    matchRatingsConfig: matchRatings.matchRatingsConfig,
                  })
                }
              >
                Save match ratings
              </Button>
              {matchRatings.matchRatingsEnabled && (
                <span className="text-xs font-sans text-success">
                  Match ratings are on for users on a build that includes it.
                </span>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* Escala de grados de la predicción */}
      <SectionCard
        title="Prediction grade scale"
        subtitle="Cortes en % de aciertos"
        info="How a settled prediction is graded from its hit rate (won markets / settled markets). The same scale is used by the app badge, the settled-result push and the badge in Predictions here, so moving a cut changes all three at once — no new app build needed. Only the three middle cuts are configurable: PERFECTO is always 100% (every market hit) and FATAL is always 0 hits, and anything between the last cut and FATAL is BAJO. The names themselves ship in the app build."
      >
        {!gradeScale ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : (
          <>
            <Field
              label="EXCELENTE from (%)"
              subtitle="def. 75" info="Lowest hit rate that still counts as EXCELENTE. Anything at or above 100% is PERFECTO instead."
            >
              <Input
                type="number"
                min={1}
                max={99}
                value={gradeScale.excelente}
                onChange={(e) => setGradeCut('excelente', Number(e.target.value))}
              />
            </Field>
            <Field
              label="BUENO from (%)"
              subtitle="def. 60" info="Lowest hit rate that counts as BUENO. Must be below the EXCELENTE cut."
            >
              <Input
                type="number"
                min={1}
                max={99}
                value={gradeScale.bueno}
                onChange={(e) => setGradeCut('bueno', Number(e.target.value))}
              />
            </Field>
            <Field
              label="MEDIO from (%)"
              subtitle="def. 40" info="Lowest hit rate that counts as MEDIO. Below this, with at least one hit, the prediction is BAJO. Must be below the BUENO cut."
            >
              <Input
                type="number"
                min={1}
                max={99}
                value={gradeScale.medio}
                onChange={(e) => setGradeCut('medio', Number(e.target.value))}
              />
            </Field>

            {gradeScaleOutOfOrder && (
              <p className="text-xs font-sans text-warning pt-2">
                The cuts must go strictly down: EXCELENTE &gt; BUENO &gt; MEDIO. Saving as-is will push the
                lower cuts down to fit, so a grade doesn&apos;t become unreachable.
              </p>
            )}

            {gradePreview && (
              <div className="pt-3">
                <p className="text-xs font-sans text-text-muted pb-1.5">
                  With these cuts, a 14-market prediction grades like this:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gradePreview.map((r) => (
                    <span
                      key={r.grade}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-surface-2 text-text-secondary"
                    >
                      {r.grade} {r.from === r.to ? `${r.from}` : `${r.to}-${r.from}`}/14
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-3">
              <Button
                variant="primary"
                loading={saveGradeScale.isPending}
                onClick={() => saveGradeScale.mutate({ predictionGradeScale: gradeScale })}
              >
                Save grade scale
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      <GroupHeader title="Data & danger zone" subtitle="One-time pipeline actions and destructive operations." />

      {/* Data Maintenance */}
      <SectionCard title="Data Maintenance" subtitle="One-time actions for data pipeline health">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-text-primary font-sans">Backfill match stats</p>
            <InfoPopover label="Qué hace el backfill de stats">
              Scrape corners, cards, fouls and penalty data for completed matches from the last 60 days. Required for deep stats
              (new markets). This only needs to run once.
            </InfoPopover>
          </div>
          <Button variant="secondary" loading={backfillStats.isPending} onClick={() => setShowBackfillConfirm(true)}>
            Run Backfill
          </Button>
        </div>

        <div className="border-t border-border mt-3 pt-3">
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-text-primary font-sans">Re-enrich phase 3 (manual)</p>
            <InfoPopover label="Qué hace el re-enrich manual">
              Re-run the full enrichment pipeline for an explicit list of match IDs. Use this for matches that got stuck on a
              particular phase and won&apos;t be retried by the regular scheduler (e.g. their pre-match window has passed). Live
              matches, missing match IDs, and matches already at phase 3 are rejected during preview.
            </InfoPopover>
          </div>

          <Textarea
            className="mt-3 font-mono min-h-[80px]"
            placeholder="16656, 16659, 16660 — separate by comma, space or newline"
            value={reEnrichInput}
            onChange={(e) => {
              setReEnrichInput(e.target.value);
              if (reEnrichPreview) setReEnrichPreview(null);
            }}
          />

          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <p className="text-xs text-text-muted/60 font-sans">
              {reEnrichIds.length === 0
                ? 'No match IDs detected.'
                : reEnrichIds.length > 100
                  ? `${reEnrichIds.length} IDs detected — capped at 100 per batch.`
                  : `${reEnrichIds.length} unique match ID${reEnrichIds.length === 1 ? '' : 's'} detected.`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                loading={reEnrichPreviewMutation.isPending}
                disabled={reEnrichIds.length === 0 || reEnrichIds.length > 100}
                onClick={() => {
                  if (reEnrichIds.length === 0 || reEnrichIds.length > 100) return;
                  reEnrichPreviewMutation.mutate(reEnrichIds);
                }}
              >
                Preview
              </Button>
              <Button
                variant="primary"
                loading={reEnrichRunMutation.isPending}
                disabled={!reEnrichPreview || reEnrichPreview.validCount === 0}
                onClick={() => setShowReEnrichConfirm(true)}
              >
                Run
              </Button>
            </div>
          </div>

          {reEnrichPreview && (
            <div className="mt-3 rounded-lg p-3 text-xs font-mono border border-border bg-background">
              <p className="text-text-primary mb-2">
                <span className="text-success">Valid: {reEnrichPreview.validCount}</span>
                <span className="mx-2 text-text-muted/40">·</span>
                <span className={reEnrichPreview.invalidCount > 0 ? 'text-danger' : 'text-text-muted'}>Invalid: {reEnrichPreview.invalidCount}</span>
              </p>
              {reEnrichPreview.preview.length > 0 && (
                <div className="mb-2">
                  <p className="text-text-muted/60 mb-1">First {reEnrichPreview.preview.length} valid match(es):</p>
                  <ul className="space-y-0.5">
                    {reEnrichPreview.preview.map((m) => (
                      <li key={m.matchId} className="text-text-muted">
                        #{m.matchId} · {m.status ?? '?'} · phase={m.enrichmentPhase ?? 0} · {m.home} vs {m.away}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reEnrichPreview.invalid.length > 0 && (
                <div>
                  <p className="text-text-muted/60 mb-1">Rejected:</p>
                  <ul className="space-y-0.5">
                    {reEnrichPreview.invalid.slice(0, 20).map((row) => (
                      <li key={row.matchId} className="text-danger/80">
                        #{row.matchId} → {row.reason}
                      </li>
                    ))}
                    {reEnrichPreview.invalid.length > 20 && <li className="text-text-muted/40">... and {reEnrichPreview.invalid.length - 20} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Danger Zone */}
      <div className="rounded-2xl p-5 mb-4 border border-danger/25 bg-danger/5">
        <h2 className="text-xs font-semibold text-danger uppercase tracking-wider mb-1 font-sans">Danger Zone</h2>
        <p className="text-xs text-danger/60 font-sans mb-4">Destructive actions that cannot be undone</p>

        <div className="flex items-center justify-between py-3 border-b border-danger/10">
          <div>
            <p className="text-sm text-text-primary font-sans">Delete all matches</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">Remove all matches and associated predictions. Teams and leagues are kept.</p>
          </div>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete Matches
          </Button>
        </div>

        <div className="flex items-center justify-between py-3 mt-1">
          <div>
            <p className="text-sm text-text-primary font-sans">Delete all sports data</p>
            <p className="text-xs text-text-muted/60 font-sans mt-0.5">Remove matches, predictions, teams and leagues. Users and credits are NOT affected.</p>
          </div>
          <Button variant="danger" onClick={() => setShowDeleteAllConfirm(true)}>
            Delete All Sports Data
          </Button>
        </div>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={showBackfillConfirm}
        title="Run stats backfill?"
        message="This will scrape match stats for all completed matches from the last 60 days. It may take several minutes."
        confirmLabel="Run backfill"
        loading={backfillStats.isPending}
        onConfirm={() => backfillStats.mutate()}
        onClose={() => setShowBackfillConfirm(false)}
      />

      <ConfirmDialog
        open={showReEnrichConfirm}
        title="Run full enrichment?"
        message={
          reEnrichPreview
            ? `Run full enrichment for ${reEnrichPreview.validCount} match${reEnrichPreview.validCount === 1 ? '' : 'es'}? This may take several minutes.`
            : ''
        }
        confirmLabel="Run enrichment"
        loading={reEnrichRunMutation.isPending}
        onConfirm={() => {
          if (!reEnrichPreview || reEnrichPreview.validCount === 0) return;
          if (reEnrichIds.length === 0) return;
          reEnrichRunMutation.mutate(reEnrichIds);
        }}
        onClose={() => setShowReEnrichConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete all matches?"
        message="This will permanently delete all matches and their associated predictions from the database. This action cannot be undone."
        confirmLabel="Yes, delete all"
        variant="danger"
        loading={deleteAllMatches.isPending}
        onConfirm={() => deleteAllMatches.mutate()}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title="Delete ALL sports data?"
        message={
          <span>
            This permanently deletes <strong className="text-text-primary">all matches and predictions</strong>,{' '}
            <strong className="text-text-primary">all teams</strong> and{' '}
            <strong className="text-text-primary">all leagues / competitions</strong>. Users, credits, purchases and API keys are
            NOT affected. This cannot be undone.
          </span>
        }
        confirmLabel="Yes, delete everything"
        variant="danger"
        loading={deleteAllSportsData.isPending}
        onConfirm={() => deleteAllSportsData.mutate()}
        onClose={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  );
}
