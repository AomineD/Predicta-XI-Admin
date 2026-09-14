'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/ui/form-controls';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Input, Select } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import { cn, formatDateTime } from '@/lib/utils';
import { PROVIDERS, PROVIDER_LABELS } from './constants';
import type { ApiKey } from './types';

type ApiKeyTestResult = { testResult: 'success' | 'failed'; error?: string };
const TESTABLE_PROVIDERS = new Set(['deepseek', 'openai', 'google', 'google_translate']);

const providerLabel = (provider: string) =>
  provider in PROVIDER_LABELS
    ? PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS]
    : provider;

export function ApiKeysTab() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: apiKeys } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/admin/api-keys'),
  });

  const [newProvider, setNewProvider] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const activeApiKeys = (apiKeys ?? []).filter((key) => key.isActive);

  const addKey = useMutation({
    mutationFn: () => api.post('/admin/api-keys', { provider: newProvider, key: newKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setNewProvider('');
      setNewKey('');
      toast.success('API key added.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKey = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setDeleteTarget(null);
      toast.success('API key removed.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testKey = useMutation({
    mutationFn: (id: number) => api.post<ApiKeyTestResult>(`/admin/api-keys/${id}/test`, {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      if (result.testResult === 'success') toast.success('API key test succeeded.');
      else toast.error(result.error ? `API key test failed: ${result.error}` : 'API key test failed.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // App API Key
  const { data: appKeyInfo } = useQuery<{ prefix: string; isActive: boolean; createdAt: string } | null>({
    queryKey: ['app-key-info'],
    queryFn: async () => {
      try {
        return (await api.get('/admin/app-key/info')) as { prefix: string; isActive: boolean; createdAt: string } | null;
      } catch {
        return null;
      }
    },
  });

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const regenerateAppKey = useMutation({
    mutationFn: () => api.post('/admin/app-key/regenerate', {}) as Promise<{ key: string; prefix: string }>,
    onSuccess: (data: { key: string; prefix: string }) => {
      setGeneratedKey(data.key);
      setShowRegenerateConfirm(false);
      setKeyCopied(false);
      qc.invalidateQueries({ queryKey: ['app-key-info'] });
      toast.success('New app API key generated.');
    },
    onError: (err: Error) => {
      setShowRegenerateConfirm(false);
      toast.error(err.message);
    },
  });

  const copyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
    }
  };

  const dismissKey = () => {
    setGeneratedKey(null);
    setKeyCopied(false);
  };

  return (
    <div>
      <SectionCard title="API Keys" subtitle="Encrypted provider keys for predictions and auxiliary services">
        {activeApiKeys.length > 0 && (
          <div className="divide-y divide-border mb-4">
            {activeApiKeys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary font-sans">{providerLabel(k.provider)}</span>
                    <span className="text-xs text-text-muted font-sans">••••••••••••</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold font-sans',
                        k.testStatus === 'success' && 'bg-success/15 text-success',
                        k.testStatus === 'failed' && 'bg-danger/15 text-danger',
                        !k.testStatus && 'bg-surface-3 text-text-muted',
                      )}
                    >
                      {k.testStatus === 'success' ? 'Test passed' : k.testStatus === 'failed' ? 'Test failed' : 'Not tested'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted/60 font-sans">
                    {k.lastTestedAt ? `Last tested ${formatDateTime(k.lastTestedAt)}` : 'No connectivity test has run yet.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={testKey.isPending && testKey.variables === k.id}
                    disabled={testKey.isPending || !TESTABLE_PROVIDERS.has(k.provider)}
                    onClick={() => testKey.mutate(k.id)}
                    aria-label={`Test ${providerLabel(k.provider)} API key`}
                    title={TESTABLE_PROVIDERS.has(k.provider) ? undefined : 'Connectivity test is not available for this provider.'}
                  >
                    Test
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(k)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted font-sans">Provider</label>
            <Select className="w-36" value={newProvider} onChange={(e) => setNewProvider(e.target.value)}>
              <option value="">Select provider</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-text-muted font-sans">API Key</label>
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-text-muted text-xs hover:text-text-primary px-2 cursor-pointer"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <Button variant="secondary" loading={addKey.isPending} disabled={!newProvider || !newKey} onClick={() => addKey.mutate()}>
            Add Key
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="App API Key" info="Authentication key for the Flutter app to communicate with the backend API.">
        {appKeyInfo ? (
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-text-primary font-sans">
                Current key: <span className="text-text-muted font-mono">{appKeyInfo.prefix}••••••••</span>
              </p>
              <p className="text-xs text-text-muted/60 font-sans mt-1">
                Generated on{' '}
                {new Date(appKeyInfo.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <span
              className={`text-xs font-sans px-2 py-0.5 rounded-full ${
                appKeyInfo.isActive ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
              }`}
            >
              {appKeyInfo.isActive ? 'Active' : 'Revoked'}
            </span>
          </div>
        ) : (
          <p className="text-sm text-text-muted font-sans py-2">No app API key has been generated yet.</p>
        )}

        {/* Generated key display — shown only once */}
        {generatedKey && (
          <div className="mt-3 p-3 rounded-xl border border-success/20 bg-success/10">
            <p className="text-xs text-success font-sans font-semibold mb-2">New key generated — copy it now. It will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-text-primary bg-surface-3 px-3 py-2 rounded-lg break-all select-all">
                {generatedKey}
              </code>
              <Button variant="secondary" size="sm" onClick={copyKey}>
                {keyCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={dismissKey} className="text-xs text-text-muted hover:text-text-primary font-sans cursor-pointer">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="danger" loading={regenerateAppKey.isPending} onClick={() => setShowRegenerateConfirm(true)}>
            Regenerate Key
          </Button>
          {/* La consecuencia queda visible sin hover: es una acción irreversible. */}
          <span className="text-xs text-text-muted/60 font-sans">Revoca la clave activa</span>
          <InfoPopover label="Qué hace regenerar la clave">
            This will revoke the current key and generate a new one. The Flutter app will need to be updated with the new key.
          </InfoPopover>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove API key?"
        message={
          deleteTarget
            ? `The ${providerLabel(deleteTarget.provider)} key will be permanently removed. Features that rely on this provider will fail until a new key is added.`
            : ''
        }
        confirmLabel="Remove key"
        variant="danger"
        loading={deleteKey.isPending}
        onConfirm={() => deleteTarget && deleteKey.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={showRegenerateConfirm}
        title="Regenerate App API Key?"
        message="The current key will be permanently revoked. The Flutter app will stop working until you update it with the new key."
        confirmLabel="Yes, regenerate"
        variant="danger"
        loading={regenerateAppKey.isPending}
        onConfirm={() => regenerateAppKey.mutate()}
        onClose={() => setShowRegenerateConfirm(false)}
      />
    </div>
  );
}
