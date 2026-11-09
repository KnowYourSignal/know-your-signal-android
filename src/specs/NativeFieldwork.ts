import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type FieldStatus = {
  choice: string;
  consentPending: boolean;
  technicalMode: boolean;
  total: number;
  pending: number;
  synced: number;
  failed: number;
  syncAvailable: boolean;
  syncProblem: string | null;
};

export type SavedMeasurement = {
  id: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  powerDbm: number;
  metric: string;
  technology: string;
  connection: string;
  classificationOrigin: string;
  capturedAt: string;
  floor: number;
  zoneSize: string;
  syncState: string;
};

export type HistoryLayer = { floor: number; metric: string; count: number };
export type RecentRoom = { floor: number; zoneSize: string };
export type MapConfiguration = {
  url: string;
  publishableKey: string;
  mapTiles: boolean;
};

export interface Spec extends TurboModule {
  getStatus(): Promise<FieldStatus>;
  setConsent(enabled: boolean): Promise<FieldStatus>;
  setTechnicalMode(enabled: boolean): Promise<void>;
  saveMeasurement(
    captureId: string,
    floor: number,
    zoneSize: string,
  ): Promise<SavedMeasurement>;
  saveMeasurementWithClassification(
    captureId: string,
    floor: number,
    zoneSize: string,
    connectionChoice: string | null,
  ): Promise<SavedMeasurement>;
  getRecentRoom(): Promise<RecentRoom | null>;
  listLayers(): Promise<ReadonlyArray<HistoryLayer>>;
  listMeasurements(
    floor: number,
    metric: string,
  ): Promise<ReadonlyArray<SavedMeasurement>>;
  retrySync(): Promise<void>;
  getMapConfiguration(): Promise<MapConfiguration>;
  shareEvidence(path: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativeFieldwork');
