import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Metric } from '../domain/Measurement';
import type { FrozenCapture } from '../specs/NativeTelemetry';

export type MainTabsParamList = {
  Medir: undefined;
  MapaPersonal: { floor: number; metric: Metric; savedId: string } | undefined;
  MapaPublico: undefined;
  Ajustes: undefined;
};

export type RootParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  Floor: { capture: FrozenCapture };
};
