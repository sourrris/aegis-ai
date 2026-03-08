import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../app/state/auth-context', () => ({
  useAuth: () => ({ token: 'test-token', username: 'admin' })
}));

vi.mock('../../../app/state/ui-context', () => ({
  useUI: () => ({
    theme: 'light',
    setTheme: vi.fn(),
    timezone: 'local',
    setTimezone: vi.fn(),
    tenant: 'all',
    window: '24h',
    density: 'compact'
  })
}));

import { SettingsPage } from '../SettingsPage';

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
      <MemoryRouter future={routerFuture} initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  it('renders clean control console links without token or username query params', () => {
    renderPage();

    const tenantLink = screen.getByRole('link', { name: 'Open Tenant Control Console' });
    const opsLink = screen.getByRole('link', { name: 'Open Ops Control Console' });

    expect(tenantLink).toHaveAttribute('href', 'http://control.localhost');
    expect(opsLink).toHaveAttribute('href', 'http://ops-control.localhost');
    expect(tenantLink.getAttribute('href')).not.toContain('token=');
    expect(tenantLink.getAttribute('href')).not.toContain('username=');
    expect(opsLink.getAttribute('href')).not.toContain('token=');
    expect(opsLink.getAttribute('href')).not.toContain('username=');
  });
});
