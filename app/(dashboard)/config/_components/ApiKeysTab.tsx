'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import { PROVIDERS } from './constants';
import type { ApiKey } from './types';

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
    mutationFn: (id: string) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setDeleteTarget(null);
      toast.success('API key removed.');
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
      <SectionCard title="API Keys" subtitle="Encrypted LLM provider keys for prediction generation">
        {(apiKeys ?? []).length > 0 && (
          <div className="divide-y divide-border mb-4">
            {(apiKeys ?? []).map((k) => (
              <div key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium text-text-primary font-sans">{k.provider}</span>
                  <span className="ml-3 text-xs text-text-muted font-sans">••••••••••••</span>
                </div>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(k)}>
                  Remove
                </Button>
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
                  {p}
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

      <SectionCard title="App API Key" subtitle="Authentication key for the Flutter app to communicate with the backend API">
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

        <div className="mt-4">
          <Button variant="danger" loading={regenerateAppKey.isPending} onClick={() => setShowRegenerateConfirm(true)}>
            Regenerate Key
          </Button>
          <p className="text-xs text-text-muted/50 font-sans mt-2">
            This will revoke the current key and generate a new one. The Flutter app will need to be updated with the new key.
          </p>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove API key?"
        message={
          deleteTarget
            ? `The ${deleteTarget.provider} key will be permanently removed. Predictions that rely on this provider will fail until a new key is added.`
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
