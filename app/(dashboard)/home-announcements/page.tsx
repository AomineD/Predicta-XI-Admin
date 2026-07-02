'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard, Field, Toggle } from '@/components/ui/form-controls';
import { Input, Select, Textarea } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';

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

function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <div className="mt-1 text-right text-[10px] font-mono text-text-muted/60">
      {value.length}/{max}
    </div>
  );
}

// Same catalogue the Config page exposes. '' = use the globally active model.
const MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.4-think',
  'gemini-3.1-pro',
  'gemini-3.1-flash-lite-preview',
  'glm-5',
  'kimi-k2.5',
];

interface GeneratedDraft {
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
}

export default function HomeAnnouncementsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeAnnouncement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── AI generator modal state ──
  const [genOpen, setGenOpen] = useState(false);
  const [genBrief, setGenBrief] = useState('');
  const [genToday, setGenToday] = useState(true);
  const [genModel, setGenModel] = useState(''); // '' = active model

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
      return d.id == null ? api.post('/admin/home-announcements', body) : api.put(`/admin/home-announcements/${d.id}`, body);
    },
    onSuccess: (saved: unknown) => {
      // Keep editing a freshly-created entry so the admin can upload its image.
      const row = saved as HomeAnnouncement | undefined;
      if (draft && draft.id == null && row && typeof row.id === 'number') {
        setDraft(toDraft(row));
      } else {
        setDraft(null);
      }
      toast.success('Announcement saved.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/home-announcements/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success('Announcement deleted.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) => api.put(`/admin/home-announcements/${id}`, { isPublished }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadImage = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      return api.post(`/admin/home-announcements/${id}/image`, { imageBase64: dataUrl, contentType: file.type });
    },
    onSuccess: (saved: unknown) => {
      const row = saved as HomeAnnouncement | undefined;
      if (draft && row && typeof row.imageUrl === 'string') {
        setDraft({ ...draft, imageUrl: row.imageUrl });
      }
      toast.success('Image uploaded.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Generate an ephemeral bilingual draft with the active LLM, then drop it into
  // the editor as an unpublished draft. Nothing is published automatically.
  const generate = useMutation<GeneratedDraft, Error, void>({
    mutationFn: () =>
      api.post('/admin/home-announcements/generate', {
        brief: genBrief.trim() || undefined,
        includeTodayMatches: genToday,
        model: genModel || undefined,
      }),
    onSuccess: (d) => {
      setDraft({ ...EMPTY_DRAFT, titleEs: d.titleEs, titleEn: d.titleEn, bodyEs: d.bodyEs, bodyEn: d.bodyEn, isPublished: false });
      setGenOpen(false);
      setGenBrief('');
      toast.success('Borrador generado. Revísalo, edita si quieres y guárdalo.');
    },
    onError: (err: Error) => toast.error(err.message),
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
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setGenOpen(true)}>
              ✨ Generar con IA
            </Button>
            <Button variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              New announcement
            </Button>
          </div>
        }
      />

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generar anuncio con IA"
        description="El modelo redacta un borrador bilingüe. Lo revisas y editas en el formulario antes de guardarlo; nada se publica automáticamente."
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generate.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" loading={generate.isPending} onClick={() => generate.mutate()}>
              Generar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-text-muted font-sans">Tema / brief (opcional)</span>
            <Textarea
              rows={3}
              className="mt-1 resize-none"
              value={genBrief}
              onChange={(e) => setGenBrief(e.target.value)}
              placeholder="Ej.: anuncia las combinadas compartidas con amigos. Si lo dejas vacío, la IA propone una idea."
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted font-sans">Basar en los partidos de hoy</span>
            <Toggle value={genToday} onChange={setGenToday} />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted font-sans">Modelo (opcional)</span>
            <Select className="mt-1" value={genModel} onChange={(e) => setGenModel(e.target.value)}>
              <option value="">Modelo activo</option>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Modal>

      {draft && (
        <SectionCard
          title={draft.id == null ? 'New announcement' : `Edit announcement #${draft.id}`}
          subtitle="User-friendly copy. Spanish is neutral 'tú' and avoids betting language. Save first, then upload an image."
        >
          <Field label="Title (ES)">
            <div>
              <Input maxLength={120} value={draft.titleEs} onChange={(e) => setDraft({ ...draft, titleEs: e.target.value })} placeholder="Partidos de hoy" />
              <CharCount value={draft.titleEs} max={120} />
            </div>
          </Field>
          <Field label="Title (EN)">
            <div>
              <Input maxLength={120} value={draft.titleEn} onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })} placeholder="Today's matches" />
              <CharCount value={draft.titleEn} max={120} />
            </div>
          </Field>
          <Field label="Body (ES)" subtitle="Optional.">
            <div>
              <Textarea rows={2} maxLength={600} className="resize-none" value={draft.bodyEs} onChange={(e) => setDraft({ ...draft, bodyEs: e.target.value })} />
              <CharCount value={draft.bodyEs} max={600} />
            </div>
          </Field>
          <Field label="Body (EN)" subtitle="Optional.">
            <div>
              <Textarea rows={2} maxLength={600} className="resize-none" value={draft.bodyEn} onChange={(e) => setDraft({ ...draft, bodyEn: e.target.value })} />
              <CharCount value={draft.bodyEn} max={600} />
            </div>
          </Field>
          <Field label="Link type" subtitle="none = informational; route = internal app path; url = external https link.">
            <Select className="w-40" value={draft.linkType} onChange={(e) => setDraft({ ...draft, linkType: e.target.value as LinkType })}>
              <option value="none">none</option>
              <option value="route">route</option>
              <option value="url">url</option>
            </Select>
          </Field>
          {draft.linkType !== 'none' && (
            <Field
              label={draft.linkType === 'url' ? 'Link URL (https)' : 'Link route'}
              subtitle={
                draft.linkType === 'url'
                  ? 'External https:// URL opened in the browser.'
                  : 'Internal GoRouter location, e.g. /featured-fixtures, /store, /quinielas.'
              }
            >
              <Input
                maxLength={1024}
                value={draft.linkValue}
                onChange={(e) => setDraft({ ...draft, linkValue: e.target.value })}
                placeholder={draft.linkType === 'url' ? 'https://…' : '/featured-fixtures'}
              />
            </Field>
          )}
          <Field label="Priority" subtitle="Higher shows first (the carousel sorts by priority then recency).">
            <Input type="number" min={0} max={1000} className="w-28" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Starts at" subtitle="Optional. Empty = visible immediately.">
            <Input type="date" className="w-48" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
          </Field>
          <Field label="Ends at" subtitle="Optional. Empty = no expiry.">
            <Input type="date" className="w-48" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
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
              <div key={e.id} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                {e.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.imageUrl} alt="" className="h-10 w-16 object-cover rounded-lg border border-border flex-none" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">P{e.priority}</span>
                    {e.source === 'auto_today' && <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">AUTO</span>}
                    {!e.isPublished && <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-surface-3 text-warning">DRAFT</span>}
                    {e.linkType !== 'none' && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">{e.linkType}</span>}
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
        title="Delete this announcement?"
        message={deleteTarget ? `"${deleteTarget.titleEs}" will be permanently removed.` : ''}
        confirmLabel="Delete announcement"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
