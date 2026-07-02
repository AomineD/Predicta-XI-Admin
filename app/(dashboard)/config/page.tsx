'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { CONFIG_TABS, DEFAULT_CONFIG_TAB, type ConfigTabId } from './_components/constants';
import type { CompetitionLite, PredictionConfig, SetField } from './_components/types';
import { GeneralTab } from './_components/GeneralTab';
import { AutomationsTab } from './_components/AutomationsTab';
import { CombinadasTab } from './_components/CombinadasTab';
import { ApiKeysTab } from './_components/ApiKeysTab';
import { SecurityTab } from './_components/SecurityTab';
import { MaintenanceTab } from './_components/MaintenanceTab';

// Las tres pestañas que editan el mismo objeto prediction-config (form) y por
// tanto comparten el botón único de guardado (barra fija).
const CONFIG_FORM_TABS: ConfigTabId[] = ['general', 'automations', 'combinadas'];

export default function ConfigPage() {
  return (
    <Suspense fallback={<ConfigLoading />}>
      <ConfigPageInner />
    </Suspense>
  );
}

function ConfigLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ConfigPageInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab: ConfigTabId = CONFIG_TABS.some((t) => t.id === tabParam) ? (tabParam as ConfigTabId) : DEFAULT_CONFIG_TAB;
  const [tab, setTab] = useState<ConfigTabId>(initialTab);

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_CONFIG_TAB) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const {
    data: cfg,
    isLoading: cfgLoading,
    isError: cfgError,
    error: cfgErrorObj,
    refetch: refetchCfg,
  } = useQuery<PredictionConfig>({
    queryKey: ['prediction-config'],
    queryFn: () => api.get('/admin/prediction-config'),
  });

  const { data: competitions } = useQuery<CompetitionLite[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/admin/competitions'),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<PredictionConfig | null>(null);

  const initialForm = useMemo<PredictionConfig | null>(() => {
    if (!cfg) return null;
    return {
      ...cfg,
      matchSyncEnabled: cfg.matchSyncEnabled ?? false,
      matchSyncIntervalHours: cfg.matchSyncIntervalHours ?? 12,
      resultSyncEnabled: cfg.resultSyncEnabled ?? false,
      resultSyncInitialDelayMinutes: cfg.resultSyncInitialDelayMinutes ?? 120,
      resultSyncRetryIntervalMinutes: cfg.resultSyncRetryIntervalMinutes ?? 5,
      resultSyncMaxRetryHours: cfg.resultSyncMaxRetryHours ?? 24,
      enrichmentSyncEnabled: cfg.enrichmentSyncEnabled ?? false,
      enrichmentSyncIntervalMinutes: cfg.enrichmentSyncIntervalMinutes ?? 15,
      teamRefreshEnabled: cfg.teamRefreshEnabled ?? false,
      userCombinadaOpinionsEnabled: cfg.userCombinadaOpinionsEnabled ?? true,
      correctScoreModelEnabled: cfg.correctScoreModelEnabled ?? false,
      marketProbabilityAnchoringEnabled: cfg.marketProbabilityAnchoringEnabled ?? false,
      statBaselinesEnabled: cfg.statBaselinesEnabled ?? false,
      independentModelEnabled: cfg.independentModelEnabled ?? false,
      calibrationEnabled: cfg.calibrationEnabled ?? false,
      neutralVenueAwarenessEnabled: cfg.neutralVenueAwarenessEnabled ?? false,
      totalsUnifiedEnabled: cfg.totalsUnifiedEnabled ?? false,
      specialMarketsEnabled: cfg.specialMarketsEnabled ?? false,
      quinielaKnockoutAutomationEnabled: cfg.quinielaKnockoutAutomationEnabled ?? false,
      quinielaKnockoutEngine: cfg.quinielaKnockoutEngine ?? 'claude_routine',
      llmTimeoutSeconds: cfg.llmTimeoutSeconds ?? 30,
      predictionWindowMinutes: cfg.predictionWindowMinutes ?? 0,
      featuredLeagueIds: cfg.featuredLeagueIds ?? [39, 140, 135],
      llmMaxTokens: cfg.llmMaxTokens ?? {},
    };
  }, [cfg]);

  const saveConfig = useMutation({
    mutationFn: (body: PredictionConfig) => api.put('/admin/prediction-config', body),
    onSuccess: () => {
      setForm(null); // resync from server so the dirty state clears
      toast.success('Configuration saved.');
      qc.invalidateQueries({ queryKey: ['prediction-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeForm = form ?? initialForm;

  const setField: SetField = (key, value) => setForm((f) => ({ ...(f ?? (activeForm as PredictionConfig)), [key]: value }));

  const dirty = !!form && !!initialForm && JSON.stringify(form) !== JSON.stringify(initialForm);
  const showSaveBar = CONFIG_FORM_TABS.includes(tab) && dirty;

  return (
    <div>
      <PageHeader title="Config" description="Prediction engine settings and API keys" />

      <Tabs value={tab} onChange={(v) => setTab(v as ConfigTabId)} items={CONFIG_TABS as unknown as { id: string; label: string }[]} />

      <div className="mt-4 pb-20">
        {cfgError ? (
          <ErrorState
            title="Couldn't load the configuration"
            message={cfgErrorObj instanceof Error ? cfgErrorObj.message : undefined}
            onRetry={() => refetchCfg()}
          />
        ) : cfgLoading || !activeForm ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div hidden={tab !== 'general'} role="tabpanel" id="tabpanel-general">
              {tab === 'general' && <GeneralTab form={activeForm} setField={setField} />}
            </div>
            <div hidden={tab !== 'automations'} role="tabpanel" id="tabpanel-automations">
              {tab === 'automations' && <AutomationsTab form={activeForm} setField={setField} competitions={competitions ?? []} />}
            </div>
            <div hidden={tab !== 'combinadas'} role="tabpanel" id="tabpanel-combinadas">
              {tab === 'combinadas' && <CombinadasTab form={activeForm} setField={setField} competitions={competitions ?? []} />}
            </div>
            <div hidden={tab !== 'apiKeys'} role="tabpanel" id="tabpanel-apiKeys">
              {tab === 'apiKeys' && <ApiKeysTab />}
            </div>
            <div hidden={tab !== 'security'} role="tabpanel" id="tabpanel-security">
              {tab === 'security' && <SecurityTab />}
            </div>
            <div hidden={tab !== 'maintenance'} role="tabpanel" id="tabpanel-maintenance">
              {tab === 'maintenance' && <MaintenanceTab />}
            </div>
          </>
        )}
      </div>

      {/* Barra de guardado fija: aparece solo con cambios sin guardar en las
          pestañas que editan el prediction-config. Un único botón, sin más
          "Save X" dispersos. */}
      {showSaveBar && activeForm && (
        <div className="sticky bottom-0 z-10 -mx-6 mt-4 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-end gap-3">
            <span className="mr-auto text-xs text-text-muted font-sans">You have unsaved changes.</span>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={saveConfig.isPending}>
              Discard
            </Button>
            <Button variant="primary" loading={saveConfig.isPending} onClick={() => saveConfig.mutate(activeForm)}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
