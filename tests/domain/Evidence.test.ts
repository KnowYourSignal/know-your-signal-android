import { createEvidenceSnapshot } from '../../src/domain/Evidence';
import type { SavedMeasurement } from '../../src/specs/NativeFieldwork';
import { START_REGION } from '../../src/state/MapFilters';

const point: SavedMeasurement = {
  id: 'private-measurement',
  latitude: START_REGION.latitude,
  longitude: START_REGION.longitude,
  accuracyM: 7,
  powerDbm: -67,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  capturedAt: '2026-11-09T17:00:00.000Z',
  floor: 0,
  zoneSize: 'mediano',
  syncState: 'LOCAL_ONLY',
  classificationOrigin: 'sistema',
};
const layout = { width: 300, height: 240 };

test('evidence keeps the visible crop and values even after the source changes', () => {
  const first = { ...point };
  const second = { ...point, id: 'second', powerDbm: -80 };
  const outside = { ...point, id: 'outside', latitude: point.latitude + 1 };
  const region = { ...START_REGION };
  const snapshot = createEvidenceSnapshot(
    [first, second, outside],
    region,
    layout,
  )!;
  expect(snapshot.measurements.map(item => item.id)).toEqual([
    first.id,
    second.id,
  ]);
  expect(snapshot.region).toEqual(START_REGION);
  expect(snapshot.aspectRatio).toBe(0.8);
  expect(snapshot.medianDbm).toBe(-73.5);
  expect([snapshot.minDbm, snapshot.maxDbm]).toEqual([-80, -67]);

  first.powerDbm = -30;
  region.latitude = 0;
  expect(snapshot.measurements[0].powerDbm).toBe(-67);
  expect(snapshot.region.latitude).toBe(START_REGION.latitude);
});

test('personal evidence accepts a wide view and wraps the antimeridian', () => {
  const region = {
    latitude: 0,
    longitude: 179.9,
    latitudeDelta: 4,
    longitudeDelta: 4,
  };
  const included = { ...point, latitude: 0, longitude: -179.9 };
  const outside = { ...point, latitude: 0, longitude: -170 };
  const snapshot = createEvidenceSnapshot([included, outside], region, layout)!;
  expect(snapshot.measurements).toEqual([included]);
  expect(snapshot.medianDbm).toBe(included.powerDbm);
});

test('an empty crop or unfinished layout cannot produce an evidence card', () => {
  expect(createEvidenceSnapshot([], START_REGION, layout)).toBeNull();
  expect(
    createEvidenceSnapshot([point], START_REGION, { width: 0, height: 240 }),
  ).toBeNull();
  expect(
    createEvidenceSnapshot([point], { ...START_REGION, latitude: 0 }, layout),
  ).toBeNull();
});
