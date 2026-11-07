import { canCapture, parseFloor } from '../../src/domain/CapturePolicy';
import type { SensorReading } from '../../src/specs/NativeTelemetry';

const valid: SensorReading = {
  latitude: -33.45,
  longitude: -70.65,
  accuracyM: 8,
  powerDbm: -68,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  problem: null,
  validForMs: 3_000,
};

test('accepts floor zero and basements without coercing malformed input', () => {
  expect(parseFloor('0')).toBe(0);
  expect(parseFloor('-10')).toBe(-10);
  expect(parseFloor('150')).toBe(150);
  for (const input of ['2x', '2.1', '', '-11', '151', '1e1', '-']) {
    expect(parseFloor(input)).toBeNull();
  }
});

test('requires an eligible simultaneous location and signal reading', () => {
  expect(canCapture(valid)).toBe(true);
  expect(canCapture({ ...valid, accuracyM: 10 })).toBe(false);
  expect(canCapture({ ...valid, powerDbm: null })).toBe(false);
  expect(canCapture({ ...valid, problem: 'OUT_OF_SYNC' })).toBe(false);
  expect(canCapture({ ...valid, validForMs: 0 })).toBe(false);
});
