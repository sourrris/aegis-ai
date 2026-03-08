import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchEvents = vi.fn();
const mockFetchEventDetail = vi.fn();
const mockFetchDataSourceRuns = vi.fn();
const mockFetchDataSourceStatus = vi.fn();

vi.mock('../../../app/state/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' })
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
    mockFetchEvents.mockResolvedValue({
      items: [
        {
          event_id: 'event-1',
          tenant_id: 'tenant-alpha',
          source: 'connector:ofac_sls',
          event_type: 'reference_update',
          status: 'processed',
          occurred_at: '2026-03-07T17:41:37Z',
          ingested_at: '2026-03-07T17:41:37Z'
        }
      ],
      next_cursor: null,
      total_estimate: 1
    });
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
  });

  it('renders event detail payloads when a row is opened', async () => {
    renderPage();

    const eventCell = await screen.findByText('event-1');
    fireEvent.click(eventCell.closest('tr')!);

    await waitFor(() => {
      expect(screen.getByText('Event Detail')).toBeInTheDocument();
      expect(screen.getByText(/Submitted by connector-service/)).toBeInTheDocument();
      expect(screen.getByText(/"transaction_id": "ref-ofac-1"/)).toBeInTheDocument();
      expect(screen.getByText(/"connector_status": "noop"/)).toBeInTheDocument();
    });
  });
});
