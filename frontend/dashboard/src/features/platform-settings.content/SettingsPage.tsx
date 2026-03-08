import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../app/state/auth-context';
import { buildControlHandoffUrl } from '../../../../packages/control-auth/src/handoff';
import { useUI } from '../../app/state/ui-context';
import type { ApiKey } from '../../entities/setup';
import { createApiKey, createDomain, fetchApiKeys, fetchDomains, revokeApiKey } from '../../shared/api/setup';
import { API_BASE_URL, CONTROL_OPS_URL, CONTROL_TENANT_URL, WS_BASE_URL } from '../../shared/lib/constants';
import { formatDateTime } from '../../shared/lib/time';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DataPanel } from '../../shared/ui/DataPanel';
import { DensityToggle } from '../../shared/ui/DensityToggle';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { useToast } from '../../shared/ui/toaster';
import { DashboardPageFrame } from '../../widgets/layout/DashboardPageFrame';

export function SettingsPage() {
  const { token, username, tenantId } = useAuth();
  const { theme, setTheme, timezone, setTimezone, tenant, window, density } = useUI();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openShortcuts, setOpenShortcuts] = useState(false);
  const [domainHostname, setDomainHostname] = useState('test-domain.example.com');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('Web ingest key');
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<ApiKey & { token: string } | null>(null);

  const tenantConsoleUrl = token && username ? buildControlHandoffUrl(CONTROL_TENANT_URL, token, username) : CONTROL_TENANT_URL;
  const opsConsoleUrl = token && username ? buildControlHandoffUrl(CONTROL_OPS_URL, token, username) : CONTROL_OPS_URL;

  const domainsQuery = useQuery({
    queryKey: ['tenant-domains'],
    queryFn: async () => fetchDomains(token!),
    enabled: Boolean(token)
  });

  const apiKeysQuery = useQuery({
    queryKey: ['tenant-api-keys'],
    queryFn: async () => fetchApiKeys(token!),
    enabled: Boolean(token)
  });

  useEffect(() => {
    const firstDomainId = domainsQuery.data?.items[0]?.domain_id ?? '';
    if (!firstDomainId) {
      setSelectedDomainId('');
      return;
    }
    setSelectedDomainId((current) => {
      if (current && domainsQuery.data?.items.some((item) => item.domain_id === current)) {
        return current;
      }
      return firstDomainId;
    });
  }, [domainsQuery.data]);

  const createDomainMutation = useMutation({
    mutationFn: async () => createDomain(token!, domainHostname),
    onSuccess: async (created) => {
      setDomainError(null);
      setDomainHostname('');
      setSelectedDomainId(created.domain_id);
      await queryClient.invalidateQueries({ queryKey: ['tenant-domains'] });
      toast({
        title: 'Domain registered',
        description: `${created.hostname} is ready for scoped API keys.`,
        type: 'success'
      });
    },
    onError: (error) => {
      setDomainError((error as Error).message);
    }
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDomainId) {
        throw new Error('Register a domain before creating an API key');
      }
      return createApiKey(token!, keyName, selectedDomainId);
    },
    onSuccess: async (created) => {
      setKeyError(null);
      setRevealedKey(created);
      setKeyName('Web ingest key');
      await queryClient.invalidateQueries({ queryKey: ['tenant-api-keys'] });
      toast({
        title: 'API key created',
        description: `${created.name} is active for ${created.domain_hostname ?? 'the selected domain'}.`,
        type: 'success'
      });
    },
    onError: (error) => {
      setKeyError((error as Error).message);
    }
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => revokeApiKey(token!, keyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-api-keys'] });
      toast({
        title: 'API key revoked',
        description: 'The key can no longer ingest events.',
        type: 'success'
      });
    },
    onError: (error) => {
      toast({
        title: 'Unable to revoke key',
        description: (error as Error).message,
        type: 'error'
      });
    }
  });

  const domains = domainsQuery.data?.items ?? [];
  const apiKeys = apiKeysQuery.data?.items ?? [];

  return (
    <DashboardPageFrame
      chips={
        <div className="inline-actions">
          <Badge variant="info">density {density}</Badge>
          <Badge variant="neutral">domains {domains.length}</Badge>
          <Badge variant="neutral">keys {apiKeys.length}</Badge>
        </div>
      }
    >
      <DataPanel title="Session" description="Current signed-in profile and tenant context.">
        <div className="stack-sm">
          <p>
            User: <strong>{username ?? 'unknown'}</strong>
          </p>
          <p>
            Tenant: <strong>{tenantId ?? tenant}</strong>
          </p>
          <p>
            Time window: <strong>{window}</strong>
          </p>
        </div>
      </DataPanel>

      <div className="grid-two">
        <DataPanel title="Display preferences" description="Theme, timezone, and density controls for your workspace.">
          <div className="stack-sm">
            <label htmlFor="theme">Theme</label>
            <Select id="theme" value={theme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}>
              <option value="light">light</option>
              <option value="dark">dark (legacy)</option>
            </Select>

            <label htmlFor="timezone">Timezone</label>
            <Select
              id="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value as 'local' | 'utc')}
            >
              <option value="local">local</option>
              <option value="utc">utc</option>
            </Select>

            <label>Density</label>
            <DensityToggle className="w-fit" />
          </div>
        </DataPanel>

        <DataPanel title="Endpoint diagnostics" description="Current API and websocket targets used by this session.">
          <div className="stack-sm">
            <p>
              API <Badge variant="info">{API_BASE_URL}</Badge>
            </p>
            <p>
              WebSocket <Badge variant="info">{WS_BASE_URL}</Badge>
            </p>
          </div>
        </DataPanel>
      </div>

      <div className="grid-two">
        <DataPanel
          title="Registered domains"
          description="Create the hostnames your org can issue ingest keys for. Duplicate hostnames are blocked."
          actions={
            <Button
              variant="primary"
              onClick={() => createDomainMutation.mutate()}
              disabled={createDomainMutation.isPending || domainHostname.trim().length === 0}
            >
              {createDomainMutation.isPending ? 'Adding domain...' : 'Add domain'}
            </Button>
          }
        >
          <div className="stack-sm">
            <label htmlFor="domain-hostname">Hostname</label>
            <Input
              id="domain-hostname"
              placeholder="app.example.com"
              value={domainHostname}
              onChange={(event) => {
                setDomainHostname(event.target.value);
                setDomainError(null);
              }}
            />

            {domainError && <p className="inline-error">{domainError}</p>}
            {domainsQuery.isError && <p className="inline-error">{(domainsQuery.error as Error).message}</p>}

            {domains.length === 0 && !domainsQuery.isLoading && (
              <p className="inline-warning">No domains configured yet. Add one before creating an API key.</p>
            )}

            {domains.map((item) => (
              <article key={item.domain_id} className="rounded-2xl border border-stroke bg-zinc-50 p-3">
                <p className="mono">{item.hostname}</p>
                <p className="muted">Created {formatDateTime(item.created_at, timezone)}</p>
              </article>
            ))}
          </div>
        </DataPanel>

        <DataPanel
          title="API keys"
          description="Tenant-scoped ingest keys bound to a registered domain. Plaintext is shown only once."
          actions={
            <Button
              variant="primary"
              onClick={() => createApiKeyMutation.mutate()}
              disabled={createApiKeyMutation.isPending || domains.length === 0}
            >
              {createApiKeyMutation.isPending ? 'Creating key...' : 'Create API key'}
            </Button>
          }
        >
          <div className="stack-sm">
            <label htmlFor="api-key-name">Key name</label>
            <Input
              id="api-key-name"
              value={keyName}
              onChange={(event) => {
                setKeyName(event.target.value);
                setKeyError(null);
              }}
            />

            <label htmlFor="api-key-domain">Bound domain</label>
            <Select
              id="api-key-domain"
              value={selectedDomainId}
              onChange={(event) => {
                setSelectedDomainId(event.target.value);
                setKeyError(null);
              }}
              disabled={domains.length === 0}
            >
              {domains.length === 0 ? (
                <option value="">Add a domain first</option>
              ) : (
                domains.map((item) => (
                  <option key={item.domain_id} value={item.domain_id}>
                    {item.hostname}
                  </option>
                ))
              )}
            </Select>

            {keyError && <p className="inline-error">{keyError}</p>}
            {apiKeysQuery.isError && <p className="inline-error">{(apiKeysQuery.error as Error).message}</p>}

            {revealedKey && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="font-semibold">Copy this key now</p>
                <p className="muted">It will not be shown again after you leave this page.</p>
                <pre className="json-block">{revealedKey.token}</pre>
              </div>
            )}

            {apiKeys.length === 0 && !apiKeysQuery.isLoading && (
              <p className="inline-warning">No API keys created yet.</p>
            )}

            {apiKeys.map((item) => (
              <article key={item.key_id} className="rounded-2xl border border-stroke bg-zinc-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.name}</p>
                  <Badge variant={item.active ? 'success' : 'warning'}>{item.active ? 'active' : 'revoked'}</Badge>
                </div>
                <p className="mono">{item.key_prefix}</p>
                <p className="muted">
                  {item.domain_hostname ?? 'unbound domain'} | created {formatDateTime(item.created_at, timezone)}
                </p>
                <p className="muted">
                  Last used {item.last_used_at ? formatDateTime(item.last_used_at, timezone) : 'never'}
                </p>
                <Button
                  variant="danger"
                  onClick={() => revokeApiKeyMutation.mutate(item.key_id)}
                  disabled={!item.active || revokeApiKeyMutation.isPending}
                >
                  Revoke
                </Button>
              </article>
            ))}
          </div>
        </DataPanel>
      </div>

      <DataPanel title="Control Plane Consoles" description="Open dedicated tenant and operations consoles.">
        <div className="stack-sm">
          <a href={tenantConsoleUrl} target="_blank" rel="noreferrer">
            Open Tenant Control Console
          </a>
          <a href={opsConsoleUrl} target="_blank" rel="noreferrer">
            Open Ops Control Console
          </a>
        </div>
      </DataPanel>

      <DataPanel
        title="Keyboard shortcuts"
        description="Keyboard-first workflow support scaffolded for operational users."
        actions={
          <Button variant="secondary" onClick={() => setOpenShortcuts(true)}>
            <Keyboard size={14} />
            Open shortcuts
          </Button>
        }
      >
        <p className="muted">Open the shortcuts panel to review navigation and triage commands.</p>
      </DataPanel>

      <Dialog open={openShortcuts} onOpenChange={setOpenShortcuts}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Use these shortcuts for faster triage.</DialogDescription>
          <ul className="shortcut-list">
            <li>
              <kbd>g</kbd>
              <span>then</span>
              <kbd>o</kbd>
              <span>Go to overview</span>
            </li>
            <li>
              <kbd>g</kbd>
              <span>then</span>
              <kbd>a</kbd>
              <span>Go to alerts</span>
            </li>
            <li>
              <kbd>/</kbd>
              <span>Focus global search</span>
            </li>
            <li>
              <kbd>i</kbd>
              <span>Ingest synthetic event</span>
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </DashboardPageFrame>
  );
}
