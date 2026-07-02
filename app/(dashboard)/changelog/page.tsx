'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/inputs';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';

interface ChangelogEntry {
  id: number;
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  versionLabel: string | null;
  isPublished: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface DraftEntry {
  id: number | null; // null = new
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  versionLabel: string;
  isPublished: boolean;
  publishedAt: string; // YYYY-MM-DD (date input)
}

const EMPTY_DRAFT: DraftEntry = {
  id: null,
  titleEs: '',
  titleEn: '',
  bodyEs: '',
  bodyEn: '',
  versionLabel: '',
  isPublished: false,
  publishedAt: '',
};

function toDraft(e: ChangelogEntry): DraftEntry {
  return {
    id: e.id,
    titleEs: e.titleEs,
    titleEn: e.titleEn,
    bodyEs: e.bodyEs,
    bodyEn: e.bodyEn,
    versionLabel: e.versionLabel ?? '',
    isPublished: e.isPublished,
    publishedAt: e.publishedAt ? e.publishedAt.slice(0, 10) : '',
  };
}

/** Campo de texto con contador de caracteres (el cuerpo se leía largo en la app). */
function TextField({
  label,
  subtitle,
  value,
  onChange,
  max,
  placeholder,
  multiline,
}: {
  label: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <Field label={label} subtitle={subtitle}>
      <div>
        {multiline ? (
          <Textarea rows={3} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="resize-none" />
        ) : (
          <Input maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        )}
        <div className="mt-1 text-right text-[10px] font-mono text-text-muted/60">
          {value.length}/{max}
        </div>
      </div>
    </Field>
  );
}

export default function ChangelogPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChangelogEntry | null>(null);

  const { data: entries, isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ['admin-changelog'],
    queryFn: () => api.get('/admin/changelog'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-changelog'] });

  const save = useMutation({
    mutationFn: (d: DraftEntry) => {
      const body = {
        titleEs: d.titleEs.trim(),
        titleEn: d.titleEn.trim(),
        bodyEs: d.bodyEs.trim(),
        bodyEn: d.bodyEn.trim(),
        versionLabel: d.versionLabel.trim() === '' ? null : d.versionLabel.trim(),
        isPublished: d.isPublished,
        publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : undefined,
      };
      return d.id == null ? api.post('/admin/changelog', body) : api.put(`/admin/changelog/${d.id}`, body);
    },
    onSuccess: () => {
      setDraft(null);
      toast.success('Entry saved.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/changelog/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success('Entry deleted.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) => api.put(`/admin/changelog/${id}`, { isPublished }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave = useMemo(() => {
    if (!draft) return false;
    return draft.titleEs.trim() !== '' && draft.titleEn.trim() !== '' && draft.bodyEs.trim() !== '' && draft.bodyEn.trim() !== '';
  }, [draft]);

  return (
    <div>
      <PageHeader
        title="Changelog"
        description="Manage the in-app '¿Qué hay de nuevo?' release notes (bilingual)."
        action={
          <Button variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            New entry
          </Button>
        }
      />

      {/* Editor (create / edit) */}
      {draft && (
        <SectionCard
          title={draft.id == null ? 'New entry' : `Edit entry #${draft.id}`}
          subtitle="User-friendly copy. Spanish is neutral 'tú' and avoids betting language. Only published entries are shown in the app."
        >
          <TextField label="Title (ES)" value={draft.titleEs} onChange={(v) => setDraft({ ...draft, titleEs: v })} max={120} placeholder="Comparte tus combinadas" />
          <TextField label="Title (EN)" value={draft.titleEn} onChange={(v) => setDraft({ ...draft, titleEn: v })} max={120} placeholder="Share your combinadas" />
          <TextField
            label="Body (ES)"
            multiline
            value={draft.bodyEs}
            onChange={(v) => setDraft({ ...draft, bodyEs: v })}
            max={2000}
            placeholder="Ahora puedes compartir tu combinada con una imagen y ver tu ganancia potencial."
          />
          <TextField
            label="Body (EN)"
            multiline
            value={draft.bodyEn}
            onChange={(v) => setDraft({ ...draft, bodyEn: v })}
            max={2000}
            placeholder="You can now share your combinada as an image and see your potential payout."
          />
          <Field label="Version label" subtitle='Optional tag, e.g. "1.2.0".'>
            <Input maxLength={20} className="w-40" value={draft.versionLabel} onChange={(e) => setDraft({ ...draft, versionLabel: e.target.value })} placeholder="1.2.0" />
          </Field>
          <Field label="Published date" subtitle="Leave empty to keep the current date.">
            <Input type="date" className="w-48" value={draft.publishedAt} onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })} />
          </Field>
          <Field label="Published" subtitle="When on, the entry is visible in the app.">
            <Toggle value={draft.isPublished} onChange={(v) => setDraft({ ...draft, isPublished: v })} />
          </Field>
          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate(draft)}>
              Save entry
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </SectionCard>
      )}

      {/* List */}
      <SectionCard title="Entries" subtitle="Newest first. Toggle publish, edit or delete.">
        {isLoading ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-text-muted text-sm font-sans py-3">No entries yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {e.versionLabel && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">v{e.versionLabel}</span>
                    )}
                    <span className="text-xs text-text-muted font-mono">{e.publishedAt ? e.publishedAt.slice(0, 10) : '—'}</span>
                    {!e.isPublished && <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-warning">DRAFT</span>}
                  </div>
                  <p className="text-sm text-text-primary font-sans truncate">{e.titleEs}</p>
                  <p className="text-xs text-text-muted font-sans truncate">{e.titleEn}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <Toggle value={e.isPublished} onChange={(v) => togglePublish.mutate({ id: e.id, isPublished: v })} />
                  <Button variant="secondary" onClick={() => setDraft(toDraft(e))}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleteTarget(e)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this entry?"
        message={deleteTarget ? `"${deleteTarget.titleEs}" will be permanently removed.` : ''}
        confirmLabel="Delete entry"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
