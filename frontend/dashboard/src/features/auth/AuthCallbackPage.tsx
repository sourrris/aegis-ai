import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../app/state/auth-context';

export function AuthCallbackPage() {
  const { token, setSession } = useAuth();
  const [params] = useSearchParams();

  useEffect(() => {
    const accessToken = params.get('token');
    const username = params.get('username');

    if (accessToken && username) {
      setSession(accessToken, username);
    }
  }, [params, setSession]);

  if (token) {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className="login-layout">
      <div className="login-card">
        <h1>Completing sign in...</h1>
      </div>
    </div>
  );
}
