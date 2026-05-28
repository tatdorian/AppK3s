import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { authApi } from '../lib/api.js';
import toast from 'react-hot-toast';

const ERROR_MESSAGES: Record<string, string> = {
  github_app_not_configured: 'GitHub App non configurée. Contactez un administrateur.',
  invalid_state: 'Requête invalide. Veuillez réessayer.',
  token_exchange_failed: 'Échec de l\'authentification GitHub. Veuillez réessayer.',
  no_github_email: 'Aucune adresse email vérifiée trouvée sur GitHub.',
  github_api_error: 'Erreur de communication avec GitHub. Veuillez réessayer.',
  auth_failed: 'Échec de l\'authentification. Veuillez réessayer.',
};

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const isPopup = Boolean(window.opener && window.opener !== window);

  const handleError = (error: string) => {
    const msg = ERROR_MESSAGES[error] ?? 'Erreur d\'authentification.';
    if (isPopup) {
      window.opener?.postMessage({ type: 'oauth_error', error: msg }, window.location.origin);
      window.close();
    } else {
      toast.error(msg);
      navigate('/login', { replace: true });
    }
  };

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) { handleError(error); return; }
    if (!token) { handleError('auth_failed'); return; }

    // Fetch user profile with the new token
    localStorage.setItem('token', token);
    authApi
      .me()
      .then((user) => {
        if (isPopup) {
          // Post token + user to the parent window, then close this popup
          window.opener?.postMessage(
            { type: 'oauth_success', token, user },
            window.location.origin,
          );
          window.close();
        } else {
          setAuth(token, user);
          if (user.mustChangePassword) {
            navigate('/change-password', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        handleError('auth_failed');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
