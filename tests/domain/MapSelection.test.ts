import { signalQuality } from '../../src/domain/Measurement';
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
    ['wifi_rssi', -75, 'fair'],
    ['wifi_rssi', -90, 'weak'],
    ['lte_rsrp', -85, 'good'],
    ['lte_rsrp', -105, 'fair'],
    ['lte_rsrp', -120, 'weak'],
  ] as const) {
    expect(signalQuality(dbm, metric)).toBe(expected);
  }
  expect(signalQuality(-85, 'wifi_rssi')).not.toBe(
    signalQuality(-85, 'lte_rsrp'),
  );
});
