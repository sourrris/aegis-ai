import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../app/state/auth-context';
import { buildControlHandoffUrl } from '../../../../packages/control-auth/src/handoff';
import { register } from '../../shared/api/auth';
import { AmbientBackground } from '../../shared/ui/AmbientBackground';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Input } from '../../shared/ui/input';

export function RegisterPage() {
  const navigate = useNavigate();
  const { token, username: currentUsername, setSession } = useAuth();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo');
  const [username, setUsername] = useState('test@example.com');
  const [password, setPassword] = useState('TestPass123');
  const [organizationName, setOrganizationName] = useState('TestOrg');

  const mutation = useMutation({
    mutationFn: async () => register(username, password, organizationName),
    onSuccess: (result) => {
      setSession(result.access_token, username);
      if (returnTo) {
        window.location.assign(buildControlHandoffUrl(returnTo, result.access_token, username));
        return;
      }
      navigate('/settings', { replace: true });
    }
  });

  if (token && returnTo) {
    window.location.replace(buildControlHandoffUrl(returnTo, token, currentUsername ?? username));
    return null;
  }

  if (token) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <div className="login-layout">
      <AmbientBackground variant="hero" />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.2fr_420px] lg:items-center">
        <section className="stack-md">
          <p className="inline-flex w-fit items-center rounded-pill border border-stroke bg-white px-3 py-1 text-sm font-semibold text-zinc-700">
            Tenant Bootstrap
          </p>
          <h1 className="text-balance text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
            Launch a clean workspace in one pass.
          </h1>
          <p className="max-w-2xl text-lg text-ink-muted">
            Create an organization, land in settings, register a domain, and mint the first ingest key without leaving the dashboard.
          </p>
        </section>

        <Card className="login-card">
          <h2 className="text-2xl font-bold tracking-tight">Create workspace</h2>
          <p className="muted">This creates a tenant-scoped admin account and signs you in immediately.</p>

          <label htmlFor="register-username">Work email</label>
          <Input id="register-username" type="email" value={username} onChange={(event) => setUsername(event.target.value)} />

          <label htmlFor="register-password">Password</label>
          <Input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <label htmlFor="organization-name">Organization</label>
          <Input
            id="organization-name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />

          <Button variant="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating workspace...' : 'Create workspace'}
          </Button>

          <p className="muted">
            Already have access? <Link to="/login">Sign in</Link>
          </p>

          {mutation.isError && <p className="inline-error">{(mutation.error as Error).message}</p>}
        </Card>
      </div>
    </div>
  );
}
