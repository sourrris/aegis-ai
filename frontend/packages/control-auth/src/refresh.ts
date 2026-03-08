const inFlightRefreshRequests = new Map<string, Promise<string | null>>();

export async function refreshAccessTokenOnce(apiBaseUrl: string): Promise<string | null> {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
  const existing = inFlightRefreshRequests.get(normalizedBaseUrl);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const response = await fetch(`${normalizedBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { access_token?: string };
    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      return null;
    }
    return payload.access_token;
  })().finally(() => {
    inFlightRefreshRequests.delete(normalizedBaseUrl);
  });

  inFlightRefreshRequests.set(normalizedBaseUrl, request);
  return request;
}
