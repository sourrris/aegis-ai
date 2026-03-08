import { z } from 'zod';

export const tenantDomainSchema = z.object({
  domain_id: z.string(),
  tenant_id: z.string(),
  hostname: z.string(),
  created_by: z.string().nullable().optional(),
  created_at: z.string()
});

export const tenantDomainsResponseSchema = z.object({
  items: z.array(tenantDomainSchema)
});

export const apiKeySchema = z.object({
  key_id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  active: z.boolean(),
  scopes: z.array(z.string()),
  domain_id: z.string().nullable().optional(),
  domain_hostname: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
  created_at: z.string(),
  last_used_at: z.string().nullable().optional()
});

export const apiKeysResponseSchema = z.object({
  items: z.array(apiKeySchema)
});

export const apiKeyCreateResponseSchema = apiKeySchema.extend({
  token: z.string()
});

export type TenantDomain = z.infer<typeof tenantDomainSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
