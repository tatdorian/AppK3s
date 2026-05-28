/**
 * Page de landing après installation de la GitHub App sur GitHub.
 * GitHub redirige ici avec ?installation_id=xxx&setup_action=install
 *
 * Cette page :
 *  1. Lit l'installation_id depuis l'URL
 *  2. Appelle POST /api/github-app/installations pour enregistrer
 *  3. Redirige vers /github-app
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertTriangle, Github } from 'lucide-react';
import { githubAppApi } from '../lib/api.js';

export function GithubAppInstalledPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const installationId = searchParams.get('installation_id');
    const setupAction = searchParams.get('setup_action') ?? 'install';
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(decodeURIComponent(error));
      return;
    }

    if (!installationId) {
      setStatus('error');
      setMessage('installation_id manquant dans l\'URL');
      return;
    }

    // Si c'est une mise à jour (request), juste afficher un message de succès
    if (setupAction === 'request') {
      setStatus('success');
      setMessage('Demande d\'accès envoyée à l\'administrateur.');
      setTimeout(() => navigate('/github-app'), 2000);
      return;
    }

    // Enregistrer l'installation
    githubAppApi.registerInstallation(Number(installationId))
      .then(() => {
        setStatus('success');
        setMessage('Installation enregistrée avec succès !');
        setTimeout(() => navigate('/github-app?installed=1'), 1500);
      })
      .catch((err: any) => {
        // Si l'installation existe déjà, c'est OK
        if (err?.response?.status === 409 || err?.response?.data?.error?.includes('already exists')) {
          setStatus('success');
          setMessage('Installation déjà enregistrée.');
          setTimeout(() => navigate('/github-app'), 1500);
        } else {
          setStatus('error');
          setMessage(err?.response?.data?.error ?? err?.message ?? 'Erreur inconnue');
        }
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="card p-8 max-w-md w-full text-center space-y-4">
        <Github className="w-12 h-12 mx-auto text-white" />
        <h1 className="text-xl font-bold text-white">GitHub App</h1>

        {status === 'loading' && (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-accent" />
            <p className="text-slate-400">Enregistrement de l'installation…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-10 h-10 mx-auto text-green-400" />
            <p className="text-green-300 font-medium">{message}</p>
            <p className="text-slate-500 text-sm">Redirection en cours…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle className="w-10 h-10 mx-auto text-red-400" />
            <p className="text-red-300 font-medium">Erreur</p>
            <p className="text-slate-400 text-sm">{message}</p>
            <button
              onClick={() => window.location.href = '/github-app'}
              className="btn-primary text-sm"
            >
              Retour à GitHub App
            </button>
          </>
        )}
      </div>
    </div>
  );
}
