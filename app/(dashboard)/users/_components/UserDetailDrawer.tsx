'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { X } from 'lucide-react';

interface UserDetail {
  profile: {
    id: string;
    email: string | null;
    displayName: string | null;
    plan: string;
    credits: number;
    createdAt: string | null;
    lastLoginAt: string | null;
    deletedAt: string | null;
    totalPredictions: number;
    successRate: number | null;
    referredBy: string | null;
    updatedAt: string | null;
  };
  subscription:
    | { tier: string; status: string; platform: string; productId: string; expiresAt: string | null; createdAt: string | null }
    | null;
  creditTransactions: Array<{ type: string; amount: number; reason: string; balanceAfter: number | null; createdAt: string | null }>;
  purchases: Array<{ platform: string; productId: string; creditsAdded: number; createdAt: string | null }>;
  accessCounts: { predictions: number; combinadas: number; quinielas: number };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-text-primary">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function UserDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<UserDetail>({
    queryKey: ['user-detail', id],
    queryFn: () => api.get(`/admin/users/${id}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto p-6"
        style={{ background: '#0E1626', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">Detalle de usuario</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {isLoading && <p className="text-sm text-text-muted">Cargando…</p>}

        {data && (
          <div className="space-y-6">
            <div>
              <p className="text-text-primary font-medium">{data.profile.displayName ?? '—'}</p>
              <p className="text-xs text-text-muted">{data.profile.email ?? '—'}</p>
              <p className="text-[10px] text-text-muted mt-1 font-mono break-all">{data.profile.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Plan" value={data.profile.plan} />
              <Field label="Créditos" value={String(data.profile.credits)} />
              <Field label="Predicciones" value={String(data.profile.totalPredictions)} />
              <Field label="Acierto" value={data.profile.successRate != null ? `${data.profile.successRate}%` : '—'} />
              <Field label="Registro" value={data.profile.createdAt ? formatDateTime(data.profile.createdAt) : '—'} />
              <Field label="Último login" value={data.profile.lastLoginAt ? formatDateTime(data.profile.lastLoginAt) : '—'} />
              <Field label="Referido por" value={data.profile.referredBy ?? '—'} />
              <Field label="Borrado" value={data.profile.deletedAt ? formatDateTime(data.profile.deletedAt) : 'No'} />
            </div>

            <Section title="Suscripción">
              {data.subscription ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Tier" value={data.subscription.tier} />
                  <Field label="Estado" value={data.subscription.status} />
                  <Field label="Plataforma" value={data.subscription.platform} />
                  <Field label="Expira" value={data.subscription.expiresAt ? formatDateTime(data.subscription.expiresAt) : '—'} />
                </div>
              ) : (
                <p className="text-sm text-text-muted">Sin suscripción.</p>
              )}
            </Section>

            <Section title="Accesos">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Field label="Predicciones" value={String(data.accessCounts.predictions)} />
                <Field label="Combinadas" value={String(data.accessCounts.combinadas)} />
                <Field label="Quinielas" value={String(data.accessCounts.quinielas)} />
              </div>
            </Section>

            <Section title="Compras IAP">
              {data.purchases.length === 0 ? (
                <p className="text-sm text-text-muted">Sin compras.</p>
              ) : (
                <ul className="space-y-2">
                  {data.purchases.map((p) => (
                    <li key={`${p.createdAt ?? ''}-${p.productId}`} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{p.productId}</span>
                      <span className="text-text-muted text-xs">
                        +{p.creditsAdded} · {p.platform} · {p.createdAt ? formatDateTime(p.createdAt) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Movimientos de crédito (últimos 30)">
              {data.creditTransactions.length === 0 ? (
                <p className="text-sm text-text-muted">Sin movimientos.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.creditTransactions.map((t) => (
                    <li
                      key={`${t.createdAt ?? ''}-${t.reason}-${t.amount}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-text-secondary">{t.reason}</span>
                      <span className={cn('font-mono text-xs', t.type === 'add' ? 'text-success' : 'text-danger')}>
                        {t.type === 'add' ? '+' : ''}
                        {t.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
