'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';

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

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans';
const areaCls = `${inputCls} resize-none`;

export default function ChangelogPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      return d.id == null
        ? api.post('/admin/changelog', body)
        : api.put(`/admin/changelog/${d.id}`, body);
    },
    onSuccess: () => {
      setDraft(null);
      setMsg({ type: 'success', text: 'Entry saved.' });
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/changelog/${id}`),
    onSuccess: () => {
      setMsg({ type: 'success', text: 'Entry deleted.' });
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      api.put(`/admin/changelog/${id}`, { isPublished }),
    onSuccess: () => {
      setMsg(null);
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const canSave = useMemo(() => {
    if (!draft) return false;
    return (
      draft.titleEs.trim() !== '' &&
      draft.titleEn.trim() !== '' &&
      draft.bodyEs.trim() !== '' &&
      draft.bodyEn.trim() !== ''
    );
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

      {msg && (
        <p className={`text-xs font-sans mb-3 ${msg.type === 'success' ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}

      {/* Editor (create / edit) */}
      {draft && (
        <SectionCard
          title={draft.id == null ? 'New entry' : `Edit entry #${draft.id}`}
          subtitle="User-friendly copy. Spanish is neutral 'tú' and avoids betting language. Only published entries are shown in the app."
        >
          <Field label="Title (ES)">
            <input
              maxLength={120}
              value={draft.titleEs}
              onChange={(e) => setDraft({ ...draft, titleEs: e.target.value })}
              placeholder="Comparte tus combinadas"
              className={inputCls}
            />
          </Field>
          <Field label="Title (EN)">
            <input
              maxLength={120}
              value={draft.titleEn}
              onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })}
              placeholder="Share your combinadas"
              className={inputCls}
            />
          </Field>
          <Field label="Body (ES)">
            <textarea
              rows={3}
              maxLength={2000}
              value={draft.bodyEs}
              onChange={(e) => setDraft({ ...draft, bodyEs: e.target.value })}
              placeholder="Ahora puedes compartir tu combinada con una imagen y ver tu ganancia potencial."
              className={areaCls}
            />
          </Field>
          <Field label="Body (EN)">
            <textarea
              rows={3}
              maxLength={2000}
              value={draft.bodyEn}
              onChange={(e) => setDraft({ ...draft, bodyEn: e.target.value })}
              placeholder="You can now share your combinada as an image and see your potential payout."
              className={areaCls}
            />
          </Field>
          <Field label="Version label" subtitle='Optional tag, e.g. "1.2.0".'>
            <input
              maxLength={20}
              value={draft.versionLabel}
              onChange={(e) => setDraft({ ...draft, versionLabel: e.target.value })}
              placeholder="1.2.0"
              className="h-9 w-40 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
            />
          </Field>
          <Field label="Published date" subtitle="Leave empty to keep the current date.">
            <input
              type="date"
              value={draft.publishedAt}
              onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })}
              className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
            />
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
              <div
                key={e.id}
                className="flex items-start gap-3 py-3 border-b last:border-0"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {e.versionLabel && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                        v{e.versionLabel}
                      </span>
                    )}
                    <span className="text-xs text-text-muted font-mono">
                      {e.publishedAt ? e.publishedAt.slice(0, 10) : '—'}
                    </span>
                    {!e.isPublished && (
                      <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-warning">
                        DRAFT
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-primary font-sans truncate">{e.titleEs}</p>
                  <p className="text-xs text-text-muted font-sans truncate">{e.titleEn}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <Toggle
                    value={e.isPublished}
                    onChange={(v) => togglePublish.mutate({ id: e.id, isPublished: v })}
                  />
                  <Button variant="secondary" onClick={() => setDraft(toDraft(e))}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this entry?')) remove.mutate(e.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
