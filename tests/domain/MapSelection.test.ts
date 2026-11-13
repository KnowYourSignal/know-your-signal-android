import { clampToTether, signalQuality } from '../../src/domain/Measurement';
import { nearestPoint, project, type Region } from '../../src/state/MapFilters';

test('map hit testing uses screen distance across the dateline and clears empty space', () => {
  const region: Region = {
    latitude: 0,
    longitude: 179.9998,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  const layout = { width: 300, height: 240 };
  const points = [
    { id: 'west', latitude: 0, longitude: 179.9995 },
    { id: 'east', latitude: 0, longitude: -179.9997 },
  ];
  const tap = { latitude: 0, longitude: -179.9999 };
  expect(
    nearestPoint(points, project(tap, region, 300, 240), region, layout)?.id,
  ).toBe('east');
  const zoomed = { ...region, longitudeDelta: 0.0002 };
  expect(
    nearestPoint(points, project(tap, zoomed, 300, 240), zoomed, layout),
  ).toBeNull();
  expect(nearestPoint(points, { x: 0, y: 0 }, region, layout)).toBeNull();
  expect(
    nearestPoint(points, { x: 0, y: 0 }, region, { width: 0, height: 0 }),
  ).toBeNull();
});

test('signal categories preserve separate RSSI and RSRP ranges for the map legend', () => {
  for (const [metric, dbm, expected] of [
    ['wifi_rssi', -50, 'good'],
    ['wifi_rssi', -67, 'good'],
    ['wifi_rssi', -68, 'fair'],
    ['wifi_rssi', -75, 'fair'],
    ['wifi_rssi', -76, 'weak'],
    ['wifi_rssi', -90, 'weak'],
    ['lte_rsrp', -85, 'good'],
    ['lte_rsrp', -90, 'good'],
    ['lte_rsrp', -91, 'fair'],
    ['lte_rsrp', -105, 'fair'],
    ['lte_rsrp', -106, 'weak'],
    ['lte_rsrp', -120, 'weak'],
  ] as const) {
    expect(signalQuality(dbm, metric)).toBe(expected);
  }
  expect(signalQuality(-85, 'wifi_rssi')).not.toBe(
    signalQuality(-85, 'lte_rsrp'),
  );
});

test('tethered pin-drop clamps manual adjustments to 2x GPS accuracy radius', () => {
  const anchor = { latitude: -33.4489, longitude: -70.6693 };
  const accuracyM = 5;
  const maxRadiusM = accuracyM * 2; // 10m
  const insideTarget = {
    latitude: anchor.latitude + 4 / 111_132.92,
    longitude: anchor.longitude,
  };
  const inside = clampToTether(anchor, insideTarget, maxRadiusM);
  expect(inside.distanceM).toBeCloseTo(4, 1);
  expect(inside.latitude).toBeCloseTo(insideTarget.latitude, 6);

  const farTarget = {
    latitude: anchor.latitude + 35 / 111_132.92,
    longitude: anchor.longitude,
  };
  const clamped = clampToTether(anchor, farTarget, maxRadiusM);
  expect(clamped.distanceM).toBe(10);
  expect(clamped.maxRadiusM).toBe(10);
  expect(clamped.latitude).toBeCloseTo(
    anchor.latitude + 10 / 111_132.92,
    6,
  );
});
