import { TENANT_OPTIONS } from './constants';

export function resolveTenantSelection(selectedTenant: string, sessionTenantId: string | null): string | undefined {
  if (selectedTenant && selectedTenant !== 'all') {
    return selectedTenant;
  }
  return sessionTenantId ?? undefined;
}

export function buildTenantOptions(sessionTenantId: string | null, selectedTenant: string): string[] {
  return Array.from(new Set(['all', sessionTenantId ?? '', selectedTenant, ...TENANT_OPTIONS].filter(Boolean)));
}
