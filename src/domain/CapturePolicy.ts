import { isMetric } from './Measurement';
import type { SensorReading } from '../specs/NativeTelemetry';

export const ACCURACY_LIMIT_M = 10;
export const MIN_FLOOR = -10;
export const MAX_FLOOR = 150;

export function parseFloor(input: string): number | null {
  const value = input.trim();
  if (!/^-?\d{1,3}$/.test(value)) {
    return null;
  }
  const floor = Number(value);
  return floor >= MIN_FLOOR && floor <= MAX_FLOOR ? floor : null;
}

export function canCapture(reading: SensorReading | null): boolean {
  return (
    reading !== null &&
    reading.problem === null &&
    reading.validForMs > 0 &&
    reading.accuracyM !== null &&
    reading.accuracyM > 0 &&
    reading.accuracyM < ACCURACY_LIMIT_M &&
    reading.powerDbm !== null &&
    Number.isInteger(reading.powerDbm) &&
    reading.powerDbm <= -1 &&
    reading.metric !== null &&
    isMetric(reading.metric) &&
    reading.powerDbm >= (reading.metric === 'wifi_rssi' ? -127 : -160)
  );
}
