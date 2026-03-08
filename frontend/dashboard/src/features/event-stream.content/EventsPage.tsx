import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useAuth } from '../../app/state/auth-context';
import { useLiveAlertState } from '../../app/state/live-alerts-context';
import { useUI } from '../../app/state/ui-context';
import type { DataSourceStatus } from '../../entities/data-sources';
import { fetchDataSourceRuns, fetchDataSourceStatus } from '../../shared/api/data-sources';
import { fetchEventDetail, fetchEvents } from '../../shared/api/events';
import { fetchDomains } from '../../shared/api/setup';
import { formatDateTime } from '../../shared/lib/time';
import { resolveTenantSelection } from '../../shared/lib/tenant';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DataPanel } from '../../shared/ui/DataPanel';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { DashboardPageFrame } from '../../widgets/layout/DashboardPageFrame';

const statusVariant: Record<string, 'neutral' | 'info' | 'warning' | 'critical' | 'success'> = {
  queued: 'info',
  processed: 'success',
  anomaly: 'critical',
  failed: 'warning'
};

const connectorStatusVariant: Record<string, 'neutral' | 'info' | 'warning' | 'critical' | 'success'> = {
  running: 'info',
  success: 'success',
  partial: 'warning',
  noop: 'neutral',
  failed: 'critical',
  degraded: 'warning'
};

const severityVariant: Record<string, 'neutral' | 'info' | 'warning' | 'critical' | 'success'> = {
  critical: 'critical',
  high: 'warning',
  medium: 'info',
  low: 'success'
};

const KEY_GATED_OR_PAID_SOURCES = new Set<string>([]);

function toUtcDateBoundary(date: string, boundary: 'start' | 'end') {
  return new Date(`${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`).toISOString();
}

export function EventsPage() {
  const { token, tenantId } = useAuth();
  const { tenant, timezone } = useUI();
  const live = useLiveAlertState();
  const resolvedTenant = resolveTenantSelection(tenant, tenantId);

  const [status, setStatus] = useState('');
  const [domainId, setDomainId] = useState('');
  const [severity, setSeverity] = useState('');
  const [source, setSource] = useState('');
  const [eventType, setEventType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventIdSearch, setEventIdSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [runsWindow, setRunsWindow] = useState<'24h' | '7d' | 'all'>('24h');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [showDisabledPaidSources, setShowDisabledPaidSources] = useState(false);

  const filters = useMemo(
    () => ({
      tenant_id: resolvedTenant,
      domain_id: domainId || undefined,
      status: status || undefined,
      severity: severity || undefined,
      source: source || undefined,
      event_type: eventType || undefined,
      start_date: startDate ? toUtcDateBoundary(startDate, 'start') : undefined,
      end_date: endDate ? toUtcDateBoundary(endDate, 'end') : undefined,
      page,
      limit: 20
    }),
    [domainId, endDate, eventType, page, resolvedTenant, severity, source, startDate, status]
  );

  const domainsQuery = useQuery({
    queryKey: ['tenant-domains'],
    queryFn: async () => fetchDomains(token!),
    enabled: Boolean(token),
    retry: false
  });

  const eventsQuery = useQuery({
    queryKey: ['events', filters],
    queryFn: async () => fetchEvents(token!, filters),
    enabled: Boolean(token),
    refetchInterval: live.connected && !live.stale ? 10_000 : 20_000,
    refetchIntervalInBackground: true
  });

  const eventDetailQuery = useQuery({
    queryKey: ['event-detail', selectedEventId],
    queryFn: async () => fetchEventDetail(token!, selectedEventId!),
    enabled: Boolean(token && selectedEventId)
  });

  const sourceRunsQuery = useQuery({
    queryKey: ['internet-source-runs'],
    queryFn: async () => fetchDataSourceRuns(token!, 25),
    enabled: Boolean(token),
    refetchInterval: live.connected && !live.stale ? 10_000 : 20_000,
    refetchIntervalInBackground: true
  });

  const sourceStatusQuery = useQuery({
    queryKey: ['internet-source-status'],
    queryFn: async () => fetchDataSourceStatus(token!),
    enabled: Boolean(token),
    refetchInterval: live.connected && !live.stale ? 10_000 : 20_000,
    refetchIntervalInBackground: true
  });

  const rows = (eventsQuery.data?.items ?? []).filter((item) =>
    eventIdSearch ? item.event_id.toLowerCase().includes(eventIdSearch.toLowerCase()) : true
  );
  const domains = domainsQuery.data?.items ?? [];
  const activeFilterCount = [domainId, status, severity, source, eventType, startDate, endDate, eventIdSearch].filter(
    Boolean
  ).length;

  const sourceStatusMap = useMemo(() => {
    const map = new Map<string, DataSourceStatus>();
    for (const statusItem of sourceStatusQuery.data ?? []) {
      map.set(statusItem.source_name, statusItem);
    }
    return map;
  }, [sourceStatusQuery.data]);

  const filteredSourceRuns = useMemo(() => {
    const now = Date.now();
    const horizonMs =
      runsWindow === '24h' ? 24 * 60 * 60 * 1000 : runsWindow === '7d' ? 7 * 24 * 60 * 60 * 1000 : null;

    return (sourceRunsQuery.data ?? []).filter((run) => {
      if (horizonMs != null) {
        const startedAtMs = Date.parse(run.started_at);
        if (Number.isFinite(startedAtMs) && now - startedAtMs > horizonMs) {
          return false;
        }
      }

      if (errorsOnly && !['failed', 'degraded'].includes(run.status)) {
        return false;
      }

      if (!showDisabledPaidSources) {
        const sourceState = sourceStatusMap.get(run.source_name);
        if (sourceState && !sourceState.enabled) {
          return false;
        }
        if (KEY_GATED_OR_PAID_SOURCES.has(run.source_name)) {
          return false;
        }
      }

      return true;
    });
  }, [errorsOnly, runsWindow, showDisabledPaidSources, sourceRunsQuery.data, sourceStatusMap]);

  const freshnessBreachSources = useMemo(() => {
    const set = new Set<string>();
    for (const sourceState of sourceStatusQuery.data ?? []) {
      if (
        typeof sourceState.freshness_seconds === 'number' &&
        typeof sourceState.freshness_slo_seconds === 'number' &&
        sourceState.freshness_slo_seconds > 0 &&
        sourceState.freshness_seconds > sourceState.freshness_slo_seconds
      ) {
        set.add(sourceState.source_name);
      }
    }
    return set;
  }, [sourceStatusQuery.data]);

  return (
    <DashboardPageFrame
      chips={
        <div className="inline-actions">
          <Badge variant={live.connected ? 'success' : 'critical'}>{live.connected ? 'live' : 'offline'}</Badge>
          <Badge variant="info">events {eventsQuery.data?.total_estimate ?? 0}</Badge>
          <Badge variant="neutral">filters {activeFilterCount}</Badge>
          <Badge variant="neutral">
            page {eventsQuery.data?.page ?? page}/{eventsQuery.data?.total_pages ?? 1}
          </Badge>
          <Badge variant="neutral">source runs {filteredSourceRuns.length}</Badge>
        </div>
      }
    >
      <DataPanel
        title="Event lifecycle"
        description="Historical ingestion and processing states with domain, severity, and date filters."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setDomainId('');
              setStatus('');
              setSeverity('');
              setSource('');
              setEventType('');
              setStartDate('');
              setEndDate('');
              setEventIdSearch('');
              setPage(1);
            }}
            disabled={activeFilterCount === 0 && page === 1}
          >
            Clear filters
          </Button>
        }
      >
        <div className="table-toolbar">
          <Select
            aria-label="Domain filter"
            value={domainId}
            onChange={(event) => {
              setDomainId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Domain (all)</option>
            {domains.map((item) => (
              <option key={item.domain_id} value={item.domain_id}>
                {item.hostname}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Status (all)</option>
            <option value="queued">queued</option>
            <option value="processed">processed</option>
            <option value="anomaly">anomaly</option>
            <option value="failed">failed</option>
          </Select>
          <Select
            aria-label="Severity filter"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Severity (all)</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </Select>
          <Input
            aria-label="Source filter"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setPage(1);
            }}
            placeholder="Source"
          />
          <Input
            aria-label="Event type filter"
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value);
              setPage(1);
            }}
            placeholder="Event type"
          />
          <Input
            aria-label="Start date filter"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
            type="date"
          />
          <Input
            aria-label="End date filter"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
            type="date"
          />
          <Input
            aria-label="Event id search"
            value={eventIdSearch}
            onChange={(event) => setEventIdSearch(event.target.value)}
            placeholder="Search event_id"
          />
          <Button
            onClick={() => {
              setPage(1);
            }}
          >
            Apply filters
          </Button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead className="sticky-table-head">
              <tr>
                <th scope="col">Event ID</th>
                <th scope="col">Tenant</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Source</th>
                <th scope="col">Domain</th>
                <th scope="col">Severity</th>
                <th scope="col">Risk</th>
                <th scope="col">Ingested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.event_id}
                  className="clickable-row interactive-row"
                  onClick={() => setSelectedEventId(item.event_id)}
                >
                  <td className="mono">{item.event_id}</td>
                  <td>{item.tenant_id}</td>
                  <td>{item.event_type}</td>
                  <td>
                    <Badge variant={statusVariant[item.status] ?? 'neutral'}>{item.status}</Badge>
                  </td>
                  <td>{item.source}</td>
                  <td>{item.domain_hostname ?? 'n/a'}</td>
                  <td>
                    {item.severity ? (
                      <Badge variant={severityVariant[item.severity] ?? 'neutral'}>{item.severity}</Badge>
                    ) : (
                      'n/a'
                    )}
                  </td>
                  <td>{item.risk_score != null ? item.risk_score.toFixed(3) : 'n/a'}</td>
                  <td>{formatDateTime(item.ingested_at, timezone)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No events match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager-row">
          <span className="muted">
            Page {eventsQuery.data?.page ?? page} of {eventsQuery.data?.total_pages ?? 1}. Total estimate:{' '}
            {eventsQuery.data?.total_estimate ?? 0}
          </span>
          <div className="pager-actions">
            <Button
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
              disabled={(eventsQuery.data?.page ?? page) <= 1}
            >
              Previous
            </Button>
            <Button
              onClick={() => {
                setPage((current) => current + 1);
              }}
              disabled={(eventsQuery.data?.page ?? page) >= (eventsQuery.data?.total_pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        title="Internet source update stream"
        description="Internet feeds update reference intelligence used by scoring and enrichment."
        badge={<Badge variant="info">reference_data.updated</Badge>}
      >
        {sourceRunsQuery.isError && (
          <p className="inline-warning">
            Unable to load source run stream. Sign in with a tenant-scoped token that includes `connectors:read`.
          </p>
        )}

        <div className="table-toolbar">
          <Select value={runsWindow} onChange={(event) => setRunsWindow(event.target.value as typeof runsWindow)}>
            <option value="24h">last 24h</option>
            <option value="7d">last 7d</option>
            <option value="all">all history</option>
          </Select>
          <Button variant={errorsOnly ? 'primary' : 'secondary'} onClick={() => setErrorsOnly((current) => !current)}>
            {errorsOnly ? 'errors only' : 'all statuses'}
          </Button>
          <Button
            variant={showDisabledPaidSources ? 'primary' : 'secondary'}
            onClick={() => setShowDisabledPaidSources((current) => !current)}
          >
            {showDisabledPaidSources ? 'showing disabled/paid' : 'hide disabled/paid'}
          </Button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead className="sticky-table-head">
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Fetched</th>
                <th scope="col">Upserted</th>
                <th scope="col">Started</th>
                <th scope="col">Finished</th>
              </tr>
            </thead>
            <tbody>
              {filteredSourceRuns.map((run) => (
                <tr key={run.run_id} className="interactive-row">
                  <td className="mono">
                    {run.source_name}
                    {freshnessBreachSources.has(run.source_name) && (
                      <>
                        {' '}
                        <Badge variant="warning">freshness breach</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    <Badge variant={connectorStatusVariant[run.status] ?? 'neutral'}>{run.status}</Badge>
                  </td>
                  <td>{run.fetched_records}</td>
                  <td>{run.upserted_records}</td>
                  <td>{formatDateTime(run.started_at, timezone)}</td>
                  <td>{run.finished_at ? formatDateTime(run.finished_at, timezone) : 'running'}</td>
                </tr>
              ))}
              {filteredSourceRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No source runs match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <Dialog open={Boolean(selectedEventId)} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <DialogContent>
          <DialogTitle>Event Detail</DialogTitle>
          <DialogDescription>{selectedEventId}</DialogDescription>

          {eventDetailQuery.isLoading && <p className="muted">Loading event detail...</p>}
          {eventDetailQuery.isError && <p className="inline-error">Unable to load event detail.</p>}
          {eventDetailQuery.data && (
            <div className="stack-md">
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-stroke bg-zinc-50 p-3 text-sm sm:grid-cols-2">
                <p>
                  Tenant <strong>{eventDetailQuery.data.tenant_id}</strong>
                </p>
                <p>
                  Type <strong>{eventDetailQuery.data.event_type}</strong>
                </p>
                <p>
                  Status <strong>{eventDetailQuery.data.status}</strong>
                </p>
                <p className="mono">Submitted by {eventDetailQuery.data.submitted_by}</p>
              </div>

              {(eventDetailQuery.data.risk_score != null || eventDetailQuery.data.risk_level) && (
                <div className="grid grid-cols-1 gap-2 rounded-2xl border border-stroke bg-zinc-50 p-3 text-sm sm:grid-cols-2">
                  <p>
                    Risk score{' '}
                    <strong>
                      {eventDetailQuery.data.risk_score != null ? eventDetailQuery.data.risk_score.toFixed(3) : 'n/a'}
                    </strong>
                  </p>
                  <p>
                    Risk level <strong>{eventDetailQuery.data.risk_level ?? 'n/a'}</strong>
                  </p>
                  {eventDetailQuery.data.decision_latency_ms != null && (
                    <p>
                      Decision latency <strong>{eventDetailQuery.data.decision_latency_ms}ms</strong>
                    </p>
                  )}
                  {eventDetailQuery.data.reasons && eventDetailQuery.data.reasons.length > 0 && (
                    <p>
                      Reasons <strong>{eventDetailQuery.data.reasons.join(', ')}</strong>
                    </p>
                  )}
                </div>
              )}

              <pre className="json-block">{JSON.stringify(eventDetailQuery.data.payload, null, 2)}</pre>

              <h4>Processing timeline</h4>
              <div className="timeline">
                {eventDetailQuery.data.processing_history.map((item) => (
                  <article key={item.id} className="timeline-item">
                    <p className="mono">
                      {item.model_name}:{item.model_version}
                    </p>
                    <p>
                      score {item.anomaly_score.toFixed(4)} / threshold {item.threshold.toFixed(4)}
                    </p>
                    <p className="muted">{formatDateTime(item.processed_at, timezone)}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardPageFrame>
  );
}
