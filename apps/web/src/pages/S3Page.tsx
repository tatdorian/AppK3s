/**
 * S3 Storage management page — like Coolify
 * Accessible: super-admin only
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { s3Api } from '../lib/api.js';
import type { S3Storage } from '@appk3s/shared';
import { useAuthStore } from '../store/auth.js';
import {
  HardDrive, Plus, Trash2, Loader2, CheckCircle, AlertTriangle,
  Edit2, Star, Wifi, X, Save, ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface S3FormData {
  name: string;
  description: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  pathStyle: boolean;
}

const EMPTY_FORM: S3FormData = {
  name: '',
  description: '',
  endpoint: '',
  region: 'us-east-1',
  bucket: '',
  accessKey: '',
  secretKey: '',
  pathStyle: false,
};

// Common presets
const PRESETS = [
  { label: 'AWS S3',        endpoint: 'https://s3.amazonaws.com',           region: 'us-east-1', pathStyle: false },
  { label: 'Cloudflare R2', endpoint: 'https://<account>.r2.cloudflarestorage.com', region: 'auto', pathStyle: false },
  { label: 'MinIO',         endpoint: 'http://minio:9000',                  region: 'us-east-1', pathStyle: true },
  { label: 'Scaleway',      endpoint: 'https://s3.fr-par.scw.cloud',        region: 'fr-par',    pathStyle: false },
  { label: 'OVH',           endpoint: 'https://s3.gra.cloud.ovh.net',       region: 'gra',       pathStyle: false },
  { label: 'Hetzner',       endpoint: 'https://fsn1.your-objectstorage.com', region: 'eu-central', pathStyle: false },
];

// ─── Storage Card ─────────────────────────────────────────────────────────────

function S3Card({
  storage,
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
  testing,
  canManage,
}: {
  storage: S3Storage;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  testing: boolean;
  canManage: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className={`card p-5 border ${storage.isDefault ? 'border-accent/40' : 'border-slate-700/50'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            storage.isDefault ? 'bg-accent/20' : 'bg-slate-700/50'
          }`}>
            <HardDrive className={`w-4 h-4 ${storage.isDefault ? 'text-accent' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm truncate">{storage.name}</h3>
              {storage.isDefault && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent flex items-center gap-1 shrink-0">
                  <Star className="w-2.5 h-2.5" /> Défaut
                </span>
              )}
            </div>
            {storage.description && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{storage.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canManage && !storage.isDefault && (
            <button
              onClick={onSetDefault}
              className="btn-ghost p-1.5 text-slate-500 hover:text-amber-400"
              title="Définir comme défaut"
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          )}
          {canManage && (
            <button
              onClick={onTest}
              disabled={testing}
              className="btn-ghost p-1.5 text-slate-500 hover:text-blue-400"
              title="Tester la connexion"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            </button>
          )}
          {canManage && (
            <button
              onClick={onEdit}
              className="btn-ghost p-1.5 text-slate-500 hover:text-white"
              title="Modifier"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {canManage && (
            <button
              onClick={() => {
                if (!confirmDel) {
                  setConfirmDel(true);
                  setTimeout(() => setConfirmDel(false), 3000);
                } else {
                  onDelete();
                  setConfirmDel(false);
                }
              }}
              className={`btn-ghost p-1.5 ${confirmDel ? 'text-red-400 animate-pulse' : 'text-slate-500 hover:text-red-400'}`}
              title={confirmDel ? 'Confirmer la suppression ?' : 'Supprimer'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-500 mb-0.5">Endpoint</p>
          <p className="text-slate-300 font-mono truncate">{storage.endpoint}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Bucket</p>
          <p className="text-slate-300 font-mono truncate">{storage.bucket}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Région</p>
          <p className="text-slate-300">{storage.region}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Path style</p>
          <p className={`font-medium ${storage.pathStyle ? 'text-amber-400' : 'text-slate-400'}`}>
            {storage.pathStyle ? 'Activé (MinIO)' : 'Désactivé'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── S3 Form ──────────────────────────────────────────────────────────────────

function S3Form({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: S3FormData;
  onSave: (data: S3FormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<S3FormData>(initial);
  const [showSecret, setShowSecret] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const set = (field: keyof S3FormData, val: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const applyPreset = (p: typeof PRESETS[0]) => {
    setForm((prev) => ({ ...prev, endpoint: p.endpoint, region: p.region, pathStyle: p.pathStyle }));
    setShowPresets(false);
  };

  const handleTest = async () => {
    if (!form.endpoint || !form.bucket || !form.accessKey || !form.secretKey) {
      toast.error('Remplissez endpoint, bucket, access key et secret key pour tester');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await s3Api.testConfig({
        endpoint: form.endpoint,
        region: form.region,
        bucket: form.bucket,
        accessKey: form.accessKey,
        secretKey: form.secretKey,
        pathStyle: form.pathStyle,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.response?.data?.message ?? 'Erreur de connexion' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <button
          type="button"
          onClick={() => setShowPresets((v) => !v)}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {showPresets ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Utiliser un preset
        </button>
        {showPresets && (
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-md bg-slate-700/60 border border-slate-600 text-xs text-slate-300 hover:border-accent hover:text-white transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nom *</label>
          <input
            className="input"
            placeholder="Mon bucket S3"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            placeholder="Backups de production"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      </div>

      {/* Endpoint */}
      <div>
        <label className="label">Endpoint *</label>
        <input
          className="input font-mono text-sm"
          placeholder="https://s3.amazonaws.com"
          value={form.endpoint}
          onChange={(e) => set('endpoint', e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">URL du serveur S3 compatible (AWS, MinIO, Cloudflare R2, etc.)</p>
      </div>

      {/* Region + Bucket */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Région</label>
          <input
            className="input"
            placeholder="us-east-1"
            value={form.region}
            onChange={(e) => set('region', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Bucket *</label>
          <input
            className="input font-mono text-sm"
            placeholder="my-bucket-name"
            value={form.bucket}
            onChange={(e) => set('bucket', e.target.value)}
          />
        </div>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Access Key *</label>
          <input
            className="input font-mono text-sm"
            placeholder="AKIA..."
            value={form.accessKey}
            onChange={(e) => set('accessKey', e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label">Secret Key *</label>
          <div className="relative">
            <input
              className="input font-mono text-sm pr-10"
              type={showSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={form.secretKey}
              onChange={(e) => set('secretKey', e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Path style toggle */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
        <button
          type="button"
          onClick={() => set('pathStyle', !form.pathStyle)}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            form.pathStyle ? 'bg-accent' : 'bg-slate-600'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            form.pathStyle ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
        <div>
          <p className="text-sm text-white font-medium">Path-style endpoint</p>
          <p className="text-xs text-slate-500">Activer pour MinIO et certains serveurs S3 auto-hébergés</p>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          testResult.ok
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {testResult.ok
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end pt-2 border-t border-slate-700/50">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="btn-ghost text-sm flex items-center gap-2"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
          Tester la connexion
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.name || !form.endpoint || !form.bucket || !form.accessKey || !form.secretKey}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Sauvegarder
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function S3Page() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<S3FormData | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: storages = [], isLoading } = useQuery({
    queryKey: ['s3-storages'],
    queryFn: s3Api.list,
  });

  const createMut = useMutation({
    mutationFn: s3Api.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['s3-storages'] });
      toast.success('Stockage S3 créé');
      setShowCreate(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur de création'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<S3FormData> }) => s3Api.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['s3-storages'] });
      toast.success('Stockage S3 mis à jour');
      setEditId(null);
      setEditData(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur de mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: s3Api.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['s3-storages'] });
      toast.success('Stockage S3 supprimé');
    },
    onError: () => toast.error('Erreur de suppression'),
  });

  const defaultMut = useMutation({
    mutationFn: s3Api.setDefault,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['s3-storages'] });
      toast.success('Stockage défini par défaut');
    },
    onError: () => toast.error('Erreur'),
  });

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await s3Api.test(id);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur de test');
    } finally {
      setTestingId(null);
    }
  };

  const handleEdit = async (storage: S3Storage) => {
    try {
      const full = await s3Api.get(storage.id);
      setEditData({
        name: full.name,
        description: full.description ?? '',
        endpoint: full.endpoint,
        region: full.region,
        bucket: full.bucket,
        accessKey: full.accessKey ?? '',
        secretKey: full.secretKey ?? '',
        pathStyle: full.pathStyle,
      });
      setEditId(storage.id);
      setShowCreate(false);
    } catch {
      toast.error('Erreur de chargement');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <HardDrive className="w-5 h-5 text-slate-300" />
            <h1 className="text-2xl font-bold text-white">Stockage S3</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Gérez vos fournisseurs de stockage objet S3-compatibles. Utilisé pour les sauvegardes et assets statiques.
          </p>
        </div>
        {isAdmin && (
          <button
            className="btn-primary"
            onClick={() => {
              setShowCreate((v) => !v);
              setEditId(null);
              setEditData(null);
            }}
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        )}
      </div>

      {/* Create form */}
      {isAdmin && showCreate && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Nouveau stockage S3</h2>
            <button onClick={() => setShowCreate(false)} className="btn-ghost p-1 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <S3Form
            initial={EMPTY_FORM}
            onSave={(data) => createMut.mutate(data)}
            onCancel={() => setShowCreate(false)}
            saving={createMut.isPending}
          />
        </div>
      )}

      {/* Edit form */}
      {editId && editData && (
        <div className="card p-5 mb-6 border-accent/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Modifier le stockage</h2>
            <button onClick={() => { setEditId(null); setEditData(null); }} className="btn-ghost p-1 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <S3Form
            initial={editData}
            onSave={(data) => updateMut.mutate({ id: editId, data })}
            onCancel={() => { setEditId(null); setEditData(null); }}
            saving={updateMut.isPending}
          />
        </div>
      )}

      {/* Storage list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : storages.length === 0 ? (
        <div className="card p-12 text-center">
          <HardDrive className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">Aucun stockage S3 configuré</p>
          <p className="text-slate-500 text-xs mt-1">
            {isAdmin
              ? 'Ajoutez un fournisseur S3 compatible pour activer les sauvegardes cloud.'
              : 'Aucun fournisseur S3 n\'a encore été configuré par un administrateur.'}
          </p>
          {isAdmin && (
            <button
              className="btn-primary text-sm mt-4"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4" />
              Ajouter un stockage
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {storages.map((s) => (
            <S3Card
              key={s.id}
              storage={s}
              onEdit={() => handleEdit(s)}
              onDelete={() => deleteMut.mutate(s.id)}
              onTest={() => handleTest(s.id)}
              onSetDefault={() => defaultMut.mutate(s.id)}
              testing={testingId === s.id}
              canManage={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-500 space-y-2">
        <p className="font-medium text-slate-400">Fournisseurs compatibles</p>
        <div className="grid grid-cols-3 gap-2">
          {['AWS S3', 'Cloudflare R2', 'MinIO', 'Scaleway', 'OVH Object Storage', 'Hetzner'].map((p) => (
            <span key={p} className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500 shrink-0" /> {p}
            </span>
          ))}
        </div>
        <p className="pt-1">
          La clé d'accès et la clé secrète sont stockées chiffrées en AES-256-GCM.
          Le stockage défaut est utilisé par les nouvelles configurations de sauvegarde.
        </p>
      </div>
    </div>
  );
}
