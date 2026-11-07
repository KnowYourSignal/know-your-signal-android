import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type SensorReading = {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  powerDbm: number | null;
  metric: string | null;
  technology: string | null;
  connection: string | null;
  validForMs: number;
  problem: string | null;
};

export type FrozenCapture = {
  id: string;
  accuracyM: number;
  powerDbm: number;
  metric: string;
  technology: string;
  connection: string;
  capturedAt: string;
};

type Position = { latitude: number; longitude: number };

export interface Spec extends TurboModule {
  readSensors(): Promise<SensorReading>;
  stopReading(): void;
  freezeCapture(): Promise<FrozenCapture>;
  locate(): Promise<Position>;
}

export default TurboModuleRegistry.get<Spec>('NativeTelemetry');
