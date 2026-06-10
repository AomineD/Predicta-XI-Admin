'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard, Field } from '@/components/ui/form-controls';

/* ── contract (mirrors backend adminSendNotificationSchema) ─────────────────── */

const AUDIENCES = ['all', 'users'] as const;
type Audience = typeof AUDIENCES[number];

const OPT_INS = ['news', 'maintenance'] as const;
type OptIn = typeof OPT_INS[number];

const CATEGORIES = ['match', 'quiniela', 'combinada', 'group', 'store', 'rewards', 'news'] as const;
type Category = typeof CATEGORIES[number];

interface SendForm {
  title: string;
  body: string;
  imageUrl: string;
  audience: Audience;
  userIdsRaw: string;
  category: Category | '';
  route: string;
  optIn: OptIn;
}

const EMPTY_FORM: SendForm = {
  title: '',
  body: '',
  imageUrl: '',
  audience: 'all',
  userIdsRaw: '',
  category: '',
  route: '',
  optIn: 'news',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── pill selector ──────────────────────────────────────────────────────────── */

function Pills<T extends string>({ options, value, onChange, allowClear }: {
  options: readonly T[];
  value: T | '';
  onChange: (v: T | '') => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active && allowClear ? '' : opt)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors font-sans capitalize ${
              active
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-surface-2 border-border text-text-muted hover:border-text-muted'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── confirm modal (for broadcast to everyone) ──────────────────────────────── */

function ConfirmModal({ title, description, onConfirm, onCancel, loading }: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-text-primary font-sans">{title}</h3>
        <p className="text-sm text-text-secondary font-sans">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onConfirm} loading={loading}>Send</Button>
        </div>
      </div>
    </div>
  );
}

/* ── page ───────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const [f, setF] = useState<SendForm>(EMPTY_FORM);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const set = <K extends keyof SendForm>(key: K, val: SendForm[K]) => setF((p) => ({ ...p, [key]: val }));

  const sendMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ sent: number; failed: number }>('/admin/notifications/send', payload),
    onSuccess: (res) => {
      setResult(res);
      setConfirming(false);
    },
    onError: () => setConfirming(false),
  });

  const userIds = parseUserIds(f.userIdsRaw);
  const invalidIds = userIds.filter((id) => !UUID_RE.test(id));

  const errors: string[] = [];
  if (!f.title.trim()) errors.push('Title is required.');
  if (f.title.length > 120) errors.push('Title must be ≤ 120 characters.');
  if (!f.body.trim()) errors.push('Body is required.');
  if (f.body.length > 1000) errors.push('Body must be ≤ 1000 characters.');
  if (f.imageUrl.trim() && !/^https?:\/\//i.test(f.imageUrl.trim())) errors.push('Image URL must start with http(s)://');
  if (f.audience === 'users' && userIds.length === 0) errors.push('Add at least one user id (or switch audience to “all”).');
  if (f.audience === 'users' && invalidIds.length > 0) errors.push(`${invalidIds.length} id(s) are not valid UUIDs.`);

  const canSend = errors.length === 0 && !sendMut.isPending;

  const buildPayload = (): Record<string, unknown> => ({
    title: f.title.trim(),
    body: f.body.trim(),
    ...(f.imageUrl.trim() ? { imageUrl: f.imageUrl.trim() } : {}),
    audience: f.audience,
    ...(f.audience === 'users' ? { userIds } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.route.trim() ? { route: f.route.trim() } : {}),
    optIn: f.optIn,
  });

  const submit = () => {
    if (!canSend) return;
    setResult(null);
    if (f.audience === 'all') {
      setConfirming(true);
      return;
    }
    sendMut.mutate(buildPayload());
  };

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Send a one-off push (announcement / maintenance). Gated by the master switch in Credits → Notifications and each user's opt-in for the chosen channel."
        action={
          <Button variant="primary" size="sm" loading={sendMut.isPending} disabled={!canSend} onClick={submit}>
            {f.audience === 'all' ? 'Send to everyone' : `Send to ${userIds.length || 0} user(s)`}
          </Button>
        }
      />

      <SectionCard title="Message" subtitle="What the user sees in the notification.">
        <Field label="Title" subtitle="Max 120 characters.">
          <input
            type="text"
            maxLength={120}
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Mantenimiento programado"
            className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          />
        </Field>
        <Field label="Body" subtitle="Max 1000 characters.">
          <textarea
            rows={3}
            maxLength={1000}
            value={f.body}
            onChange={(e) => set('body', e.target.value)}
            placeholder="Texto del aviso…"
            className="w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans resize-none"
          />
        </Field>
        <Field label="Image URL" subtitle="Optional. Shown as a big-picture image (must be a public https URL).">
          <input
            type="url"
            value={f.imageUrl}
            onChange={(e) => set('imageUrl', e.target.value)}
            placeholder="https://…"
            className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Audience" subtitle="Who receives it. Delivery still respects each user's opt-in for the channel below.">
        <Field label="Send to" subtitle="“All” broadcasts to every opted-in user; “Users” targets a specific list.">
          <Pills options={AUDIENCES} value={f.audience} onChange={(v) => set('audience', (v || 'all') as Audience)} />
        </Field>
        {f.audience === 'users' && (
          <Field label="User IDs" subtitle="One UUID per line (or comma/space separated). Max 5000.">
            <textarea
              rows={4}
              value={f.userIdsRaw}
              onChange={(e) => set('userIdsRaw', e.target.value)}
              placeholder="3f1c…-…&#10;a92b…-…"
              className="w-full px-3 py-2 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans resize-none"
            />
          </Field>
        )}
        <Field label="Channel (opt-in)" subtitle="Which preference toggle gates delivery: News or Maintenance.">
          <Pills options={OPT_INS} value={f.optIn} onChange={(v) => set('optIn', (v || 'news') as OptIn)} />
        </Field>
      </SectionCard>

      <SectionCard title="Deep link" subtitle="Where the notification lands when tapped. Optional — defaults to the inbox.">
        <Field label="Category" subtitle="Destination screen the app maps the tap to. Leave empty for a plain news item.">
          <Pills options={CATEGORIES} value={f.category} onChange={(v) => set('category', v as Category | '')} allowClear />
        </Field>
        <Field label="Route override" subtitle='Optional explicit path (e.g. "/store"). Takes precedence over category on the client.'>
          <input
            type="text"
            maxLength={512}
            value={f.route}
            onChange={(e) => set('route', e.target.value)}
            placeholder="/store"
            className="h-9 w-full px-3 rounded-xl text-sm bg-surface-2 border border-border text-text-primary font-sans"
          />
        </Field>
      </SectionCard>

      {errors.length > 0 && (
        <div className="rounded-xl p-4 mb-4 text-xs font-sans" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <ul className="list-disc pl-4 space-y-1 text-danger">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {sendMut.isError && (
        <div className="rounded-xl p-4 mb-4 text-xs font-sans text-danger" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          {(sendMut.error as Error)?.message ?? 'Send failed.'}
        </div>
      )}

      {result && (
        <div className="rounded-xl p-4 mb-4 text-sm font-sans text-text-secondary" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          Sent: <span className="text-primary font-semibold">{result.sent}</span> · Failed: <span className="text-text-primary font-semibold">{result.failed}</span>
          {result.sent === 0 && result.failed === 0 && (
            <p className="text-xs text-text-muted mt-1">No deliveries — check the master switch (Credits → Notifications) is ON and that users are opted in to this channel.</p>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmModal
          title="Broadcast to everyone?"
          description={`This sends “${f.title.trim()}” to ALL opted-in users on the “${f.optIn}” channel. This cannot be undone.`}
          loading={sendMut.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => sendMut.mutate(buildPayload())}
        />
      )}
    </div>
  );
}
