import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchEvents = vi.fn();
const mockFetchEventDetail = vi.fn();
const mockFetchDataSourceRuns = vi.fn();
const mockFetchDataSourceStatus = vi.fn();
const mockFetchDomains = vi.fn();

vi.mock('../../../app/state/auth-context', () => ({
  useAuth: () => ({ token: 'test-token', tenantId: 'tenant-alpha' })
}));

vi.mock('../../../app/state/ui-context', () => ({
  useUI: () => ({ tenant: 'tenant-alpha', timezone: 'utc' })
}));

vi.mock('../../../app/state/live-alerts-context', () => ({
  useLiveAlertState: () => ({ connected: false, stale: true, alerts: [], metrics: [] })
}));

vi.mock('../../../shared/api/events', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
  fetchEventDetail: (...args: unknown[]) => mockFetchEventDetail(...args)
}));

vi.mock('../../../shared/api/data-sources', () => ({
  fetchDataSourceRuns: (...args: unknown[]) => mockFetchDataSourceRuns(...args),
  fetchDataSourceStatus: (...args: unknown[]) => mockFetchDataSourceStatus(...args)
}));

vi.mock('../../../shared/api/setup', () => ({
  fetchDomains: (...args: unknown[]) => mockFetchDomains(...args)
}));

import { EventsPage } from '../EventsPage';

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={routerFuture} initialEntries={['/events']}>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchEvents.mockImplementation(async (_token: string, query: { page?: number }) => ({
      items: [
        {
          event_id: 'event-1',
          tenant_id: 'tenant-alpha',
          source: 'connector:ofac_sls',
          event_type: 'reference_update',
          status: 'processed',
          occurred_at: '2026-03-07T17:41:37Z',
          ingested_at: '2026-03-07T17:41:37Z',
          risk_score: 0.82,
          risk_level: 'high',
          severity: 'high',
          domain_id: 'domain-1',
          domain_hostname: 'app.example.com'
        }
      ],
      next_cursor: query.page === 2 ? null : '20',
      total_estimate: 21,
      page: query.page ?? 1,
      page_size: 20,
      total_pages: 2
    }));
    mockFetchEventDetail.mockResolvedValue({
      event_id: 'event-1',
      tenant_id: 'tenant-alpha',
      source: 'connector:ofac_sls',
      event_type: 'reference_update',
      status: 'processed',
      occurred_at: '2026-03-07T17:41:37Z',
      ingested_at: '2026-03-07T17:41:37Z',
      payload: {
        transaction_id: 'ref-ofac-1',
        metadata: {
          connector_status: 'noop'
        }
      },
      features: [1, 0, 0, 0, 0, 0.7, 0.078, 0.835],
      submitted_by: 'connector-service',
      risk_score: 0.82,
      risk_level: 'high',
      reasons: ['sanctions_hit', 'ml_threshold_breach'],
      decision_latency_ms: 17,
      processing_history: [
        {
          id: 1,
          model_name: 'risk_autoencoder',
          model_version: '20260301000000',
          anomaly_score: 0.2759,
          threshold: 4.3524,
          is_anomaly: false,
          processed_at: '2026-03-07T17:41:37Z'
        }
      ]
    });
    mockFetchDataSourceRuns.mockResolvedValue([]);
    mockFetchDataSourceStatus.mockResolvedValue([]);
    mockFetchDomains.mockResolvedValue({
      items: [
        {
          domain_id: 'domain-1',
          tenant_id: 'tenant-alpha',
          hostname: 'app.example.com',
          created_by: 'admin@example.com',
          created_at: '2026-03-07T17:41:37Z'
        }
      ]
    });
  });

  it('renders event detail payloads when a row is opened', async () => {
    renderPage();

    const eventCell = await screen.findByText('event-1');
    fireEvent.click(eventCell.closest('tr')!);

    await waitFor(() => {
      expect(screen.getByText('Event Detail')).toBeInTheDocument();
      expect(screen.getByText(/Submitted by connector-service/)).toBeInTheDocument();
      expect(screen.getByText(/Risk score/i)).toBeInTheDocument();
      expect(screen.getAllByText(/0.820/)).toHaveLength(2);
      expect(screen.getByText(/Reasons/i)).toBeInTheDocument();
      expect(screen.getByText(/sanctions_hit, ml_threshold_breach/)).toBeInTheDocument();
      expect(screen.getByText(/"transaction_id": "ref-ofac-1"/)).toBeInTheDocument();
      expect(screen.getByText(/"connector_status": "noop"/)).toBeInTheDocument();
    });
  });

  it('applies domain, severity, and date filters and renders page-based navigation controls', async () => {
    renderPage();

    await screen.findByText('event-1');
    await screen.findByRole('option', { name: 'app.example.com' });

    fireEvent.change(screen.getByLabelText('Domain filter'), { target: { value: 'domain-1' } });
    fireEvent.change(screen.getByLabelText('Severity filter'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Start date filter'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('End date filter'), { target: { value: '2026-03-07' } });
    fireEvent.click(screen.getByText('Apply filters'));

    await waitFor(() => {
      expect(mockFetchEvents).toHaveBeenLastCalledWith(
        'test-token',
        expect.objectContaining({
          tenant_id: 'tenant-alpha',
          domain_id: 'domain-1',
          severity: 'high',
          start_date: '2026-03-01T00:00:00.000Z',
          end_date: '2026-03-07T23:59:59.999Z',
          page: 1,
          limit: 20
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('event-1')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeDisabled();
      expect(screen.getByText('Next')).toBeEnabled();
    });
  });
});
