import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Shield,
} from 'lucide-react';
import { apiKeysApi } from '../lib/api.js';
import type { ApiKey, ApiKeyCreated } from '@appk3s/shared';
import { formatDate, relativeTime } from '../lib/utils.js';
import toast from 'react-hot-toast';

// ─── Create Key Modal ─────────────────────────────────────────────────────────
function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        name,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setCreatedKey(data);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Failed to create API key'),
  });

  const handleCopy = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // If key was just created, show it
  if (createdKey) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <Check className="w-5 h-5" />
            <h2 className="font-semibold text-white">API key created</h2>
          </div>

          <div className="p-3 bg-amber-900/30 border border-amber-600/40 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300">
                This key will never be shown again. Copy it now and store it securely.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Your new API key</label>
            <div className="flex gap-2">
              <input
                className="input font-mono text-sm flex-1"
                value={createdKey.key}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="btn-primary shrink-0"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-slate-400">
            <div>
              <span className="text-slate-500">Name:</span>{' '}
              <span className="text-slate-200">{createdKey.name}</span>
            </div>
            <div>
              <span className="text-slate-500">Prefix:</span>{' '}
              <code className="text-accent">{createdKey.keyPrefix}…</code>
            </div>
            {createdKey.expiresAt && (
              <div className="col-span-2">
                <span className="text-slate-500">Expires:</span>{' '}
                <span className="text-slate-200">{formatDate(createdKey.expiresAt)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={onClose}>
              Done — I have saved my key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-accent" /> Create API key
        </h2>

        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="My CI/CD key"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="label">
            Expiry date{' '}
            <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            className="input"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">Leave empty for a non-expiring key.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create key
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Key Row ───────────────────────────────────────────────────────────────────
function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const qc = useQueryClient();

  const revokeMut = useMutation({
    mutationFn: () => apiKeysApi.revoke(apiKey.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
    onError: () => toast.error('Failed to revoke key'),
  });

  const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-surface-300 flex items-center justify-center shrink-0">
          <Key className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate flex items-center gap-2">
            {apiKey.name}
            {isExpired && (
              <span className="text-xs text-red-400 font-normal">(expired)</span>
            )}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <code className="text-xs text-accent">{apiKey.keyPrefix}…</code>
            {apiKey.lastUsedAt ? (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last used {relativeTime(apiKey.lastUsedAt)}
              </span>
            ) : (
              <span className="text-xs text-slate-600">Never used</span>
            )}
            {apiKey.expiresAt && !isExpired && (
              <span className="text-xs text-slate-500">
                Expires {relativeTime(apiKey.expiresAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        className="btn-ghost p-1.5 text-slate-400 hover:text-red-400 shrink-0"
        title="Revoke key"
        onClick={() => {
          if (confirm(`Revoke API key "${apiKey.name}"? This cannot be undone.`)) {
            revokeMut.mutate();
          }
        }}
        disabled={revokeMut.isPending}
      >
        {revokeMut.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  });

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-slate-400 text-sm mt-1">
            Create API keys to authenticate with the AppK3s API or CLI.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Create key
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Your API keys</h2>
        </div>

        <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg mb-4">
          <p className="text-xs text-blue-300">
            API keys grant access to the AppK3s API with your permissions. Use them in the
            CLI (<code className="font-mono">appk3s login --key &lt;key&gt;</code>) or in
            HTTP requests via the <code className="font-mono">X-API-Key</code> header.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No API keys yet.</p>
            <button
              className="btn-primary mt-3 text-sm"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4" /> Create your first key
            </button>
          </div>
        ) : (
          <div>
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
