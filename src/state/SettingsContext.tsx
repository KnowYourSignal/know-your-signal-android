// src/state/SettingsContext.tsx
import React, { createContext, useState, useContext } from 'react';
import { COLORS } from '../theme/theme';

interface SettingsContextProps {
  technicalMode: boolean;
  toggleTechnicalMode: () => void;
  sharingEnabled: boolean;
  setSharingEnabled: (val: boolean) => void;
}

export const SettingsContext = createContext<SettingsContextProps>({
  technicalMode: false,
  toggleTechnicalMode: () => {},
  sharingEnabled: true,
  setSharingEnabled: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [technicalMode, setTechnicalMode] = useState(false);
  const [sharingEnabled, setSharingEnabled] = useState(true);

  const toggleTechnicalMode = () => setTechnicalMode((prev) => !prev);

  return (
    <SettingsContext.Provider
      value={{
        technicalMode,
        toggleTechnicalMode,
        sharingEnabled,
        setSharingEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

export const formatSignal = (dbm: number, isTechnical: boolean): string => {
  if (isTechnical) return `${dbm} dBm`;
  if (dbm >= -67) return 'Muy Buena';
  if (dbm >= -75) return 'Intermedia';
  return 'Débil';
};

export const getSignalColor = (dbm: number): string => {
  if (dbm >= -67) return COLORS.success;
  if (dbm >= -75) return COLORS.warning;
  return COLORS.danger;
};