import { useAuthStore } from '../store/auth.js';

export function SettingsPage() {
  const { user } = useAuthStore();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Account & cluster configuration</p>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Account</h2>
        <div>
          <label className="label">Email</label>
          <input className="input" value={user?.email ?? ''} disabled />
        </div>
        <div>
          <label className="label">Role</label>
          <input className="input" value={user?.role ?? ''} disabled />
        </div>
      </div>

      <div className="card p-5 mt-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Cluster</h2>
        <p className="text-sm text-slate-400">
          AppK3s connects to your k3s cluster via the in-cluster service account when deployed inside
          the cluster, or via <code className="text-accent">~/.kube/config</code> in local development.
        </p>
        <p className="text-sm text-slate-500">
          Set <code className="text-slate-300">KUBECONFIG</code> environment variable to use a custom
          kubeconfig path.
        </p>
      </div>
    </div>
  );
}
