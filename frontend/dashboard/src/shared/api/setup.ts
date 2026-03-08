import { z } from 'zod';

import { apiKeyCreateResponseSchema, apiKeysResponseSchema, tenantDomainSchema, tenantDomainsResponseSchema } from '../../entities/setup';
import { requestJson } from './http';

const statusSchema = z.object({
  status: z.string()
});

export async function fetchDomains(token: string) {
  return requestJson('/v1/domains', tenantDomainsResponseSchema, {
    token,
    retries: 1
  });
}

export async function createDomain(token: string, hostname: string) {
  return requestJson('/v1/domains', tenantDomainSchema, {
    method: 'POST',
    token,
    body: { hostname }
  });
}

export async function fetchApiKeys(token: string) {
  return requestJson('/v1/api-keys', apiKeysResponseSchema, {
    token,
    retries: 1
  });
}

export async function createApiKey(token: string, name: string, domainId: string) {
  return requestJson('/v1/api-keys', apiKeyCreateResponseSchema, {
    method: 'POST',
    token,
    body: {
      name,
      domain_id: domainId
    }
  });
}

export async function revokeApiKey(token: string, keyId: string) {
  return requestJson('/v1/api-keys/' + keyId, statusSchema, {
    method: 'DELETE',
    token
  });
}
