import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchAlerts = vi.fn();
const mockFetchAlertDetail = vi.fn();

vi.mock('../../../app/state/auth-context', () => ({
  useAuth: () => ({ token: 'test-token', tenantId: 'tenant-alpha' })
}));

vi.mock('../../../app/state/ui-context', () => ({
  useUI: () => ({ tenant: 'tenant-alpha', timezone: 'utc' })
}));

vi.mock('../../../app/state/live-alerts-context', () => ({
  useLiveAlertState: () => ({ connected: false, stale: true, alerts: [], metrics: [] })
}));

vi.mock('../../../shared/api/alerts', () => ({
  fetchAlerts: (...args: unknown[]) => mockFetchAlerts(...args),
  fetchAlertDetail: (...args: unknown[]) => mockFetchAlertDetail(...args)
}));

import { AlertsPage } from '../AlertsPage';

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
      <MemoryRouter future={routerFuture} initialEntries={['/alerts']}>
        <AlertsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AlertsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAlerts.mockResolvedValue({
      items: [
        {
          alert_id: 'alert-1',
          numeric_alert_id: 1,
          event_id: 'event-1',
          tenant_id: 'tenant-alpha',
          event_type: 'reference_update',
          source: 'connector:ofac_sls',
          severity: 'medium',
          model_name: 'risk_autoencoder',
          model_version: '20260301000000',
          anomaly_score: 0.2759,
          threshold: 4.3524,
          created_at: '2026-03-07T17:41:37Z'
        }
      ],
      next_cursor: null,
      total_estimate: 1
    });
    mockFetchAlertDetail.mockResolvedValue({
      alert_id: 'alert-1',
      numeric_alert_id: 1,
      event_id: 'event-1',
      tenant_id: 'tenant-alpha',
      event_type: 'reference_update',
      source: 'connector:ofac_sls',
      severity: 'medium',
      model_name: 'risk_autoencoder',
      model_version: '20260301000000',
      anomaly_score: 0.2759,
      threshold: 4.3524,
      is_anomaly: false,
      created_at: '2026-03-07T17:41:37Z',
      event_payload: {
        transaction_id: 'ref-ofac-1',
        metadata: {
          source_name: 'ofac_sls',
          connector_status: 'noop'
        }
      }
    });
  });

  it('renders alert detail payloads when a row is opened', async () => {
    renderPage();

    const alertCell = await screen.findByText('alert-1');
    fireEvent.click(alertCell.closest('tr')!);

    await waitFor(() => {
      expect(screen.getByText('Alert Detail')).toBeInTheDocument();
      expect(screen.getByText(/"transaction_id": "ref-ofac-1"/)).toBeInTheDocument();
      expect(screen.getByText(/"source_name": "ofac_sls"/)).toBeInTheDocument();
    });
  });
});
