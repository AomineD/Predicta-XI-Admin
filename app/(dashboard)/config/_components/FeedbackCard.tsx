'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import type { MaintenanceCreditsConfig } from './types';

/**
 * Master switch del canal de feedback (fase 5 del plan de 2026-09-15). Comparte
 * la query de `MaintenanceTab` para no pedir el credits-config dos veces.
 */
export function FeedbackCard() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery<MaintenanceCreditsConfig>({
    queryKey: ['credits-config-maintenance'],
    queryFn: () => api.get('/admin/credits-config'),
  });

  const [draft, setDraft] = useState<boolean | null>(null);
  const saved = data ? (data.feedbackEnabled ?? true) : null;
  const value = draft ?? saved;

  const save = useMutation({
    mutationFn: (feedbackEnabled: boolean) => api.put('/admin/credits-config', { feedbackEnabled }),
    onSuccess: () => {
      setDraft(null);
      toast.success('Feedback setting saved.');
      qc.invalidateQueries({ queryKey: ['credits-config-maintenance'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <SectionCard
      title="User feedback"
      subtitle="Reports and comments"
      info="Master switch for the in-app feedback channel: 'Report a problem' on the Intelligence Report and on AI combinadas, 'Send feedback' in Settings → Support and 'Report a bug' in the Help center. Reports land in Business → Feedback. It is one-way: users do not get a reply in the app. Off = the app hides every entry point and the backend rejects new reports (403). Already received reports stay in the inbox."
    >
      {value === null ? (
        <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
      ) : (
        <>
          <Field
            label="Feedback enabled"
            info="Shows the report and feedback entry points in the app. Each user can send up to 10 reports per hour, and the same report on the same target is accepted once every 10 minutes."
          >
            <Toggle value={value} onChange={(v) => setDraft(v)} />
          </Field>
          <div className="flex items-center gap-3 pt-3">
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={draft === null || draft === saved}
              onClick={() => save.mutate(value)}
            >
              Save feedback
            </Button>
            {!value && (
              <span className="text-xs font-sans text-warning">The app hides every report entry point.</span>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
