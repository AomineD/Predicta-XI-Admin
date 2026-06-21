'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';

type LinkType = 'none' | 'route' | 'url';

interface HomeAnnouncement {
  id: number;
  titleEs: string;
  titleEn: string;
  bodyEs: string | null;
  bodyEn: string | null;
  imageUrl: string | null;
  linkType: LinkType;
  linkValue: string | null;
  priority: number;
  isPublished: boolean;
  startsAt: string | null;
  endsAt: string | null;
  source: 'manual' | 'auto_today';
  dayKey: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface Draft {
  id: number | null; // null = new
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  imageUrl: string;
  linkType: LinkType;
  linkValue: string;
  priority: number;
  isPublished: boolean;
  startsAt: string; // YYYY-MM-DD
  endsAt: string; // YYYY-MM-DD
}

const EMPTY_DRAFT: Draft = {
  id: null,
  titleEs: '',
  titleEn: '',
  bodyEs: '',
  bodyEn: '',
  imageUrl: '',
  linkType: 'none',
  linkValue: '',
  priority: 0,
  isPublished: false,
  startsAt: '',
  endsAt: '',
};

function toDraft(e: HomeAnnouncement): Draft {
  return {
    id: e.id,
    titleEs: e.titleEs,
    titleEn: e.titleEn,
    bodyEs: e.bodyEs ?? '',
    bodyEn: e.bodyEn ?? '',
    imageUrl: e.imageUrl ?? '',
    linkType: e.linkType,
    linkValue: e.linkValue ?? '',
    priority: e.priority,
    isPublished: e.isPublished,
    startsAt: e.startsAt ? e.startsAt.slice(0, 10) : '',
    endsAt: e.endsAt ? e.endsAt.slice(0, 10) : '',
  };
}

const inputCls =
  'w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans';
const areaCls = `${inputCls} resize-none`;
const selectCls =
  'h-9 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans';

export default function HomeAnnouncementsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: entries, isLoading } = useQuery<HomeAnnouncement[]>({
    queryKey: ['admin-home-announcements'],
    queryFn: () => api.get('/admin/home-announcements'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-home-announcements'] });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        titleEs: d.titleEs.trim(),
        titleEn: d.titleEn.trim(),
        bodyEs: d.bodyEs.trim() === '' ? null : d.bodyEs.trim(),
        bodyEn: d.bodyEn.trim() === '' ? null : d.bodyEn.trim(),
        linkType: d.linkType,
        linkValue: d.linkValue.trim() === '' ? null : d.linkValue.trim(),
        priority: d.priority,
        isPublished: d.isPublished,
        startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
        endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
      };
      return d.id == null
        ? api.post('/admin/home-announcements', body)
        : api.put(`/admin/home-announcements/${d.id}`, body);
    },
    onSuccess: (saved: unknown) => {
      // Keep editing a freshly-created entry so the admin can upload its image.
      const row = saved as HomeAnnouncement | undefined;
      if (draft && draft.id == null && row && typeof row.id === 'number') {
        setDraft(toDraft(row));
      } else {
        setDraft(null);
      }
      setMsg({ type: 'success', text: 'Announcement saved.' });
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/home-announcements/${id}`),
    onSuccess: () => {
      setMsg({ type: 'success', text: 'Announcement deleted.' });
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      api.put(`/admin/home-announcements/${id}`, { isPublished }),
    onSuccess: () => {
      setMsg(null);
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const uploadImage = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      return api.post(`/admin/home-announcements/${id}/image`, {
        imageBase64: dataUrl,
        contentType: file.type,
      });
    },
    onSuccess: (saved: unknown) => {
      const row = saved as HomeAnnouncement | undefined;
      if (draft && row && typeof row.imageUrl === 'string') {
        setDraft({ ...draft, imageUrl: row.imageUrl });
      }
      setMsg({ type: 'success', text: 'Image uploaded.' });
      invalidate();
    },
    onError: (err: Error) => setMsg({ type: 'error', text: err.message }),
  });

  const canSave = useMemo(() => {
    if (!draft) return false;
    if (draft.titleEs.trim() === '' || draft.titleEn.trim() === '') return false;
    if (draft.linkType !== 'none' && draft.linkValue.trim() === '') return false;
    if (draft.linkType === 'url' && !draft.linkValue.trim().startsWith('https://')) return false;
    return true;
  }, [draft]);

  return (
    <div>
      <PageHeader
        title="Home announcements"
        description="Manage the Home carousel announcements (bilingual, image-capable). The app shows the last 5 published, highest priority first."
        action={
          <Button variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            New announcement
          </Button>
        }
      />

      {msg && (
        <p className={`text-xs font-sans mb-3 ${msg.type === 'success' ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}

      {draft && (
        <SectionCard
          title={draft.id == null ? 'New announcement' : `Edit announcement #${draft.id}`}
          subtitle="User-friendly copy. Spanish is neutral 'tú' and avoids betting language. Save first, then upload an image."
        >
          <Field label="Title (ES)">
            <input
              maxLength={120}
              value={draft.titleEs}
              onChange={(e) => setDraft({ ...draft, titleEs: e.target.value })}
              placeholder="Partidos de hoy"
              className={inputCls}
            />
          </Field>
          <Field label="Title (EN)">
            <input
              maxLength={120}
              value={draft.titleEn}
              onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })}
              placeholder="Today's matches"
              className={inputCls}
            />
          </Field>
          <Field label="Body (ES)" subtitle="Optional.">
            <textarea
              rows={2}
              maxLength={600}
              value={draft.bodyEs}
              onChange={(e) => setDraft({ ...draft, bodyEs: e.target.value })}
              className={areaCls}
            />
          </Field>
          <Field label="Body (EN)" subtitle="Optional.">
            <textarea
              rows={2}
              maxLength={600}
              value={draft.bodyEn}
              onChange={(e) => setDraft({ ...draft, bodyEn: e.target.value })}
              className={areaCls}
            />
          </Field>
          <Field label="Link type" subtitle="none = informational; route = internal app path; url = external https link.">
            <select
              value={draft.linkType}
              onChange={(e) => setDraft({ ...draft, linkType: e.target.value as LinkType })}
              className={selectCls}
            >
              <option value="none">none</option>
              <option value="route">route</option>
              <option value="url">url</option>
            </select>
          </Field>
          {draft.linkType !== 'none' && (
            <Field
              label={draft.linkType === 'url' ? 'Link URL (https)' : 'Link route'}
              subtitle={
                draft.linkType === 'url'
                  ? 'External https:// URL opened in the browser.'
                  : "Internal GoRouter location, e.g. /featured-fixtures, /store, /quinielas."
              }
            >
              <input
                maxLength={1024}
                value={draft.linkValue}
                onChange={(e) => setDraft({ ...draft, linkValue: e.target.value })}
                placeholder={draft.linkType === 'url' ? 'https://…' : '/featured-fixtures'}
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Priority" subtitle="Higher shows first (the carousel sorts by priority then recency).">
            <input
              type="number"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
              min={0}
              max={1000}
              className="h-9 w-28 px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
            />
          </Field>
          <Field label="Starts at" subtitle="Optional. Empty = visible immediately.">
            <input
              type="date"
              value={draft.startsAt}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              className={selectCls}
            />
          </Field>
          <Field label="Ends at" subtitle="Optional. Empty = no expiry.">
            <input
              type="date"
              value={draft.endsAt}
              onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              className={selectCls}
            />
          </Field>
          <Field label="Published" subtitle="When on, the announcement can appear in the app (if the Home announcements flag is enabled).">
            <Toggle value={draft.isPublished} onChange={(v) => setDraft({ ...draft, isPublished: v })} />
          </Field>

          {/* Image: only after the entry exists (upload needs an id). */}
          <Field label="Image" subtitle={draft.id == null ? 'Save the announcement first, then upload an image.' : 'PNG / JPEG / WebP, up to 2 MB.'}>
            <div className="flex items-center gap-3">
              {draft.imageUrl !== '' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.imageUrl} alt="" className="h-12 w-20 object-cover rounded-lg border border-border" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={draft.id == null || uploadImage.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && draft.id != null) uploadImage.mutate({ id: draft.id, file });
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="text-xs text-text-secondary font-sans"
              />
            </div>
          </Field>

          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate(draft)}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Close
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Announcements" subtitle="Highest priority first. Auto 'matches of the day' rows are managed by the scheduler.">
        {isLoading ? (
          <p className="text-text-muted text-sm font-sans py-3">Loading…</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-text-muted text-sm font-sans py-3">No announcements yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 py-3 border-b last:border-0"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                {e.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.imageUrl} alt="" className="h-10 w-16 object-cover rounded-lg border border-border flex-none" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                      P{e.priority}
                    </span>
                    {e.source === 'auto_today' && (
                      <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                        AUTO
                      </span>
                    )}
                    {!e.isPublished && (
                      <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-warning">
                        DRAFT
                      </span>
                    )}
                    {e.linkType !== 'none' && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                        {e.linkType}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-primary font-sans truncate">{e.titleEs}</p>
                  <p className="text-xs text-text-muted font-sans truncate">{e.titleEn}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <Toggle value={e.isPublished} onChange={(v) => togglePublish.mutate({ id: e.id, isPublished: v })} />
                  <Button variant="secondary" onClick={() => setDraft(toDraft(e))}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this announcement?')) remove.mutate(e.id);
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
