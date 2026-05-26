import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCreateApp } from '../hooks/useApps.js';
import { settingsApi } from '../lib/api.js';
import { EnvVarsEditor } from '../components/EnvVarsEditor.js';
import { TEMPLATES } from '@appk3s/shared';
import type { EnvVar, Port, Volume } from '@appk3s/shared';

type AppType = 'docker-image' | 'compose';

export function CreateApp() {
  const navigate = useNavigate();
  const createMut = useCreateApp();

  // Load global defaults
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const [type, setType] = useState<AppType>('docker-image');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('default');
  const [image, setImage] = useState('');
  const [imageTag, setImageTag] = useState('latest');
  const [composeContent, setComposeContent] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [subdomain, setSubdomain] = useState('');
  const [domain, setDomain] = useState('');
  const [ingressClass, setIngressClass] = useState('traefik');
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [replicas, setReplicas] = useState(1);
  const [cpuLimit, setCpuLimit] = useState('');
  const [memoryLimit, setMemoryLimit] = useState('');
  const [autoDeploy, setAutoDeploy] = useState(true);

  // Pre-fill domain settings once loaded (only if user hasn't typed anything yet)
  useEffect(() => {
    if (!settings) return;
    if (!domain && settings.defaultDomain) setDomain(settings.defaultDomain);
    if (settings.defaultIngressClass) setIngressClass(settings.defaultIngressClass);
    if (settings.defaultTls === 'true') setTlsEnabled(true);
  }, [settings]);

  const addPort = () => setPorts([...ports, { containerPort: 80, protocol: 'TCP' }]);
  const removePort = (i: number) => setPorts(ports.filter((_, idx) => idx !== i));

  // Auto-détection du port depuis le nom de l'image (matcher contre les templates)
  const handleImageBlur = () => {
    if (ports.length > 0) return; // ne pas écraser ce que l'user a déjà saisi
    const imageBase = image.split(':')[0]; // ignorer le tag
    const match = TEMPLATES.find(
      (t) => t.defaults.image === imageBase || t.defaults.image === image,
    );
    if (match && match.defaults.ports.length > 0) {
      setPorts([...match.defaults.ports]);
    }
  };

  const addVolume = () =>
    setVolumes([...volumes, { name: `vol-${volumes.length}`, mountPath: '/data', size: '1Gi' }]);
  const removeVolume = (i: number) => setVolumes(volumes.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const app = await createMut.mutateAsync({
      name,
      namespace,
      type,
      image: type === 'docker-image' ? image : undefined,
      imageTag,
      composeContent: type === 'compose' ? composeContent : undefined,
      envVars,
      ports,
      volumes,
      subdomain: subdomain || undefined,
      domain: domain || undefined,
      ingressClass,
      tlsEnabled,
      replicas,
      cpuLimit: cpuLimit || undefined,
      memoryLimit: memoryLimit || undefined,
    });

    if (autoDeploy) {
      const { appsApi } = await import('../lib/api.js');
      await appsApi.deploy(app.id).catch(() => {});
    }

    navigate(`/apps/${app.id}`);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/apps" className="btn-ghost p-2">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Application</h1>
          <p className="text-slate-400 text-sm">Deploy to your k3s cluster</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Type selector */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Source</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['docker-image', 'compose'] as AppType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`p-4 rounded-lg border text-sm font-medium text-left transition-all ${
                  type === t
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {t === 'docker-image' ? '🐳 Docker Image' : '📄 Docker Compose'}
              </button>
            ))}
          </div>
        </div>

        {/* General */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">General</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">App Name *</label>
              <input
                className="input"
                placeholder="my-app"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
              />
              <p className="text-xs text-slate-600 mt-1">lowercase, hyphens only</p>
            </div>
            <div>
              <label className="label">Namespace</label>
              <input
                className="input"
                placeholder="default"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
          </div>

          {type === 'docker-image' ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label">Image *</label>
                <input
                  className="input"
                  placeholder="nginx"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  onBlur={handleImageBlur}
                  required
                />
              </div>
              <div>
                <label className="label">Tag</label>
                <input
                  className="input"
                  placeholder="latest"
                  value={imageTag}
                  onChange={(e) => setImageTag(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">docker-compose.yml content *</label>
              <textarea
                className="input font-mono text-xs h-48 resize-none"
                placeholder={'version: "3"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"'}
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                required
              />
            </div>
          )}
        </div>

        {/* Domain */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Domain & Ingress</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Subdomain</label>
              <input
                className="input"
                placeholder={name || 'my-app'}
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Wildcard Domain</label>
              <input
                className="input"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
          </div>
          {subdomain && domain && (
            <p className="text-xs text-accent">
              → Hostname: {subdomain}.{domain}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Ingress Class</label>
              <select
                className="input"
                value={ingressClass}
                onChange={(e) => setIngressClass(e.target.value)}
              >
                <option value="traefik">Traefik (k3s default)</option>
                <option value="nginx">nginx</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="tls"
                checked={tlsEnabled}
                onChange={(e) => setTlsEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-accent"
              />
              <label htmlFor="tls" className="text-sm text-slate-300">Enable TLS</label>
            </div>
          </div>
        </div>

        {/* Ports */}
        {type === 'docker-image' && (
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Ports</h2>
              <button type="button" onClick={addPort} className="btn-ghost text-xs py-1">
                <Plus className="w-3.5 h-3.5" /> Add Port
              </button>
            </div>
            {ports.map((p, i) => (
              <div key={i} className="flex gap-3 items-center">
                <input
                  type="number"
                  className="input"
                  placeholder="Port"
                  value={p.containerPort}
                  onChange={(e) => {
                    const next = [...ports];
                    next[i] = { ...next[i], containerPort: Number(e.target.value) };
                    setPorts(next);
                  }}
                />
                <select
                  className="input w-24 shrink-0"
                  value={p.protocol}
                  onChange={(e) => {
                    const next = [...ports];
                    next[i] = { ...next[i], protocol: e.target.value as 'TCP' | 'UDP' };
                    setPorts(next);
                  }}
                >
                  <option>TCP</option>
                  <option>UDP</option>
                </select>
                <button type="button" onClick={() => removePort(i)} className="btn-danger p-2 shrink-0">
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Volumes */}
        {type === 'docker-image' && (
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Persistent Volumes</h2>
              <button type="button" onClick={addVolume} className="btn-ghost text-xs py-1">
                <Plus className="w-3.5 h-3.5" /> Add Volume
              </button>
            </div>
            {volumes.map((v, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <input
                  className="input"
                  placeholder="vol-name"
                  value={v.name}
                  onChange={(e) => {
                    const next = [...volumes];
                    next[i] = { ...next[i], name: e.target.value };
                    setVolumes(next);
                  }}
                />
                <input
                  className="input"
                  placeholder="/data"
                  value={v.mountPath}
                  onChange={(e) => {
                    const next = [...volumes];
                    next[i] = { ...next[i], mountPath: e.target.value };
                    setVolumes(next);
                  }}
                />
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="1Gi"
                    value={v.size}
                    onChange={(e) => {
                      const next = [...volumes];
                      next[i] = { ...next[i], size: e.target.value };
                      setVolumes(next);
                    }}
                  />
                  <button type="button" onClick={() => removeVolume(i)} className="btn-danger p-2 shrink-0">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Env vars */}
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Environment Variables</h2>
          <EnvVarsEditor value={envVars} onChange={setEnvVars} />
        </div>

        {/* Resources */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Resources</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Replicas</label>
              <input
                type="number"
                className="input"
                min={0}
                max={50}
                value={replicas}
                onChange={(e) => setReplicas(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">CPU Limit</label>
              <input
                className="input"
                placeholder="500m"
                value={cpuLimit}
                onChange={(e) => setCpuLimit(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Memory Limit</label>
              <input
                className="input"
                placeholder="512Mi"
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoDeploy}
              onChange={(e) => setAutoDeploy(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            Deploy immediately after creation
          </label>
          <div className="flex gap-3">
            <Link to="/apps" className="btn-ghost">Cancel</Link>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMut.isPending}
            >
              {createMut.isPending ? 'Creating...' : 'Create Application'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
