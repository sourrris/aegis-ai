export function buildMonitoringLoginUrl(baseUrl: string, returnTo: string): string {
  const url = new URL('/login', baseUrl);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
