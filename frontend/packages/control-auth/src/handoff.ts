const CONTROL_HANDOFF_PREFIX = 'aegis-handoff:';

function resolveUrl(target: string): URL {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  return new URL(target, origin);
}

export function buildMonitoringLoginUrl(baseUrl: string, returnTo: string): string {
  const url = new URL('/login', baseUrl);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

export function buildControlHandoffUrl(target: string, token: string, username: string): string {
  const url = resolveUrl(target);
  const params = new URLSearchParams({
    token,
    username
  });
  url.hash = `${CONTROL_HANDOFF_PREFIX}${params.toString()}`;
  return url.toString();
}

export function consumeControlHandoff(): { token: string; username: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash.startsWith(CONTROL_HANDOFF_PREFIX)) {
    return null;
  }

  url.hash = '';
  window.history.replaceState(null, '', url.toString());

  const params = new URLSearchParams(hash.slice(CONTROL_HANDOFF_PREFIX.length));
  const token = params.get('token')?.trim() ?? '';
  const username = params.get('username')?.trim() ?? '';
  if (!token || !username) {
    return null;
  }

  return { token, username };
}
