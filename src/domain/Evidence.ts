import { signalQuality } from './Measurement';
import type { SavedMeasurement } from '../specs/NativeFieldwork';
import { isVisible, type MapLayout, type Region } from '../state/MapFilters';

export type EvidenceSnapshot = {
  measurements: ReadonlyArray<SavedMeasurement>;
  region: Region;
  aspectRatio: number;
  medianDbm: number;
  minDbm: number;
  maxDbm: number;
  avgAccuracyM: number;
  qualityCounts: Record<'good' | 'fair' | 'weak', number>;
  sessionLabel: string;
  mapImageUri?: string | null;
};

export function createEvidenceSnapshot(
  measurements: ReadonlyArray<SavedMeasurement>,
  region: Region,
  layout: MapLayout,
): EvidenceSnapshot | null {
  if (
    !Number.isFinite(layout.width) ||
    !Number.isFinite(layout.height) ||
    layout.width <= 0 ||
    layout.height <= 0
  ) {
    return null;
  }
  const visible = measurements
    .filter(point => isVisible(region, point))
    .map(point => ({ ...point }));
  if (!visible.length) {
    return null;
  }
  const powers = visible.map(point => point.powerDbm).sort((a, b) => a - b);
  const qualityCounts = { good: 0, fair: 0, weak: 0 };
  let accSum = 0;
  const sessionNames = new Set<string>();
  for (const item of visible) {
    qualityCounts[signalQuality(item.powerDbm, item.metric)] += 1;
    accSum += item.accuracyM;
    if (item.sessionName) {
      sessionNames.add(item.sessionName);
    }
  }
  const sessionLabel =
    sessionNames.size === 1
      ? Array.from(sessionNames)[0]
      : sessionNames.size > 1
      ? `${sessionNames.size} sesiones`
      : 'Sesión local';
  return {
    measurements: visible,
    region: { ...region },
    aspectRatio: layout.height / layout.width,
    medianDbm:
      (powers[Math.floor((powers.length - 1) / 2)] +
        powers[Math.floor(powers.length / 2)]) /
      2,
    minDbm: powers[0],
    maxDbm: powers[powers.length - 1],
    avgAccuracyM: Number((accSum / visible.length).toFixed(1)),
    qualityCounts,
    sessionLabel,
  };
}
