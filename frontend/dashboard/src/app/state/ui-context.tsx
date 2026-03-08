import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth-context';
import { STORAGE_KEYS, TENANT_OPTIONS, WINDOW_OPTIONS, type TenantOption, type WindowOption } from '../../shared/lib/constants';
import type { TimezonePreference } from '../../shared/lib/time';

type ThemePreference = 'light' | 'dark';
type DensityPreference = 'comfortable' | 'compact';

type UIState = {
  tenant: TenantOption;
  window: WindowOption;
  timezone: TimezonePreference;
  theme: ThemePreference;
  density: DensityPreference;
  setTenant: (value: TenantOption) => void;
  setWindow: (value: WindowOption) => void;
  setTimezone: (value: TimezonePreference) => void;
  setTheme: (value: ThemePreference) => void;
  setDensity: (value: DensityPreference) => void;
};

const UIContext = createContext<UIState | null>(null);

function asTenant(input: string | null): TenantOption {
  const normalized = input?.trim();
  if (!normalized) {
    return 'all';
  }
  return TENANT_OPTIONS.includes(normalized as (typeof TENANT_OPTIONS)[number]) ? normalized : normalized;
}

function asWindow(input: string | null): WindowOption {
  return WINDOW_OPTIONS.includes((input ?? '') as WindowOption) ? (input as WindowOption) : '24h';
}

function asDensity(input: string | null): DensityPreference {
  if (input === 'compact' || input === 'comfortable') {
    return input;
  }
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches) {
    return 'compact';
  }
  return 'comfortable';
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { tenantId: sessionTenantId } = useAuth();
  const [tenant, setTenantState] = useState<TenantOption>(() => asTenant(window.localStorage.getItem(STORAGE_KEYS.tenant)));
  const [range, setRangeState] = useState<WindowOption>(() => asWindow(window.localStorage.getItem(STORAGE_KEYS.window)));
  const [timezone, setTimezoneState] = useState<TimezonePreference>(
    () => (window.localStorage.getItem(STORAGE_KEYS.timezone) as TimezonePreference | null) ?? 'local'
  );
  const [theme, setThemeState] = useState<ThemePreference>(
    () => (window.localStorage.getItem(STORAGE_KEYS.theme) as ThemePreference | null) ?? 'light'
  );
  const [density, setDensityState] = useState<DensityPreference>(() => asDensity(window.localStorage.getItem(STORAGE_KEYS.density)));

  useEffect(() => {
    if (!sessionTenantId) {
      return;
    }
    setTenantState((current) => {
      if (current === 'all' || current === sessionTenantId) {
        return current;
      }
      window.localStorage.setItem(STORAGE_KEYS.tenant, sessionTenantId);
      return sessionTenantId;
    });
  }, [sessionTenantId]);

  const value = useMemo<UIState>(
    () => ({
      tenant,
      window: range,
      timezone,
      theme,
      density,
      setTenant: (next) => {
        setTenantState(next);
        window.localStorage.setItem(STORAGE_KEYS.tenant, next);
      },
      setWindow: (next) => {
        setRangeState(next);
        window.localStorage.setItem(STORAGE_KEYS.window, next);
      },
      setTimezone: (next) => {
        setTimezoneState(next);
        window.localStorage.setItem(STORAGE_KEYS.timezone, next);
      },
      setTheme: (next) => {
        setThemeState(next);
        window.localStorage.setItem(STORAGE_KEYS.theme, next);
      },
      setDensity: (next) => {
        setDensityState(next);
        window.localStorage.setItem(STORAGE_KEYS.density, next);
      }
    }),
    [density, range, tenant, theme, timezone]
  );

  return (
    <UIContext.Provider value={value}>
      <div data-theme={theme} data-density={density}>
        {children}
      </div>
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used inside UIProvider');
  }
  return context;
}
