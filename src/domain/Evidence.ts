import type { SavedMeasurement } from '../specs/NativeFieldwork';
import { isVisible, type MapLayout, type Region } from '../state/MapFilters';

export type EvidenceSnapshot = {
  measurements: ReadonlyArray<SavedMeasurement>;
  region: Region;
  aspectRatio: number;
  medianDbm: number;
  minDbm: number;
  maxDbm: number;
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
  };
}
