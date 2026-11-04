// src/domain/CaptureState.ts

export type CaptureStatus = 
  | 'INACTIVE' 
  | 'REQUESTING_PERMISSION' 
  | 'STABILIZING' 
  | 'READY' 
  | 'CAPTURED' 
  | 'ERROR';

export interface TelemetrySnapshot {
  accuracyM: number | null;
  powerDbm: number | null;
  networkType: string;
  isReady: boolean;
  rejectionReason: string | null;
}