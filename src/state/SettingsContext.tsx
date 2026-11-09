import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FieldStatus } from '../specs/NativeFieldwork';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import { useAppForeground } from '../services/useAppForeground';

type Settings = {
  status: FieldStatus | null;
  loadError: boolean;
  refresh: () => Promise<void>;
  setConsent: (enabled: boolean) => Promise<void>;
  setTechnicalMode: (enabled: boolean) => Promise<void>;
};

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: React.PropsWithChildren) {
  const foreground = useAppForeground();
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const blocked = [
    'SESSION_EXPIRED',
    'SESSION_STORAGE',
    'CONSENT_BLOCKED',
    'SERVER_REJECTED',
    'CONFIG_CHANGED',
  ].includes(status?.syncProblem ?? '');
  const waiting =
    !!status && !blocked && (status.pending > 0 || status.consentPending);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await fieldwork().getStatus();
      if (request === generation.current) {
        setStatus(next);
        setLoadError(false);
      }
    } catch {
      if (request === generation.current) {
        setLoadError(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!foreground) {
      return;
    }
    refresh();
    const timer = waiting ? setInterval(refresh, 4_000) : undefined;
    return () => {
      generation.current += 1;
      if (timer) clearInterval(timer);
    };
  }, [foreground, waiting, refresh]);

  const setConsent = useCallback(async (enabled: boolean) => {
    ++generation.current;
    const next = await fieldwork().setConsent(enabled);
    // Ignore refreshes started before the transaction completed.
    ++generation.current;
    setStatus(next);
    setLoadError(false);
  }, []);

  const setTechnicalMode = useCallback(
    async (enabled: boolean) => {
      await fieldwork().setTechnicalMode(enabled);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ status, loadError, refresh, setConsent, setTechnicalMode }),
    [status, loadError, refresh, setConsent, setTechnicalMode],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) {
    throw new Error('SettingsProvider required');
  }
  return settings;
}
