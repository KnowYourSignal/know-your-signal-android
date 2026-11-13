import { capturePresentation } from '../../src/domain/CapturePresentation';
import type { SensorReading } from '../../src/specs/NativeTelemetry';

const reading: SensorReading = {
  latitude: -33.45,
  longitude: -70.65,
  accuracyM: 7,
  powerDbm: -68,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  validForMs: 4000,
  problem: null,
};
const state = {
  status: 'reading' as const,
  enabled: true,
  canRecord: false,
  problem: null,
  reading: null,
  guiding: false,
};

test('GPS stabilization is real and the exact 10 m boundary is not shown as ready', () => {
  expect(capturePresentation(state).phase).toBe('locating');
  const low = capturePresentation({
    ...state,
    reading: { ...reading, accuracyM: 10 },
    problem: 'LOW_ACCURACY',
  });
  expect(low.phase).toBe('stabilizing');
  expect(low.locationReady).toBe(false);
  const ready = capturePresentation({
    ...state,
    status: 'ready',
    canRecord: true,
    reading,
  });
  expect(ready.phase).toBe('ready');
  expect(ready.busy).toBe(false);
  expect(ready.locationReady && ready.signalReady).toBe(true);
});

test('permissions and sensor failures stop the busy treatment', () => {
  for (const problem of [
    'PERMISSION_DENIED',
    'LOCATION_DISABLED',
    'SENSOR_UNAVAILABLE',
    'UNKNOWN',
  ]) {
    const view = capturePresentation({ ...state, problem });
    expect(view.busy).toBe(false);
    expect(view.tone).toBe('amber');
  }
});

test('stale samples, network changes and missing signal receive distinct guidance', () => {
  expect(
    capturePresentation({ ...state, problem: 'STALE_READING', reading }).phase,
  ).toBe('refreshing');
  expect(
    capturePresentation({ ...state, problem: 'STALE_READING', reading })
      .locationReady,
  ).toBe(false);
  expect(
    capturePresentation({ ...state, problem: 'NETWORK_CHANGED', reading })
      .signalReady,
  ).toBe(false);
  expect(
    capturePresentation({ ...state, problem: 'NO_SIGNAL', reading }).phase,
  ).toBe('signal');
});

test('the tour and manual pause never present an old reading as available', () => {
  const guide = capturePresentation({
    ...state,
    reading,
    status: 'ready',
    canRecord: false,
    guiding: true,
  });
  expect(guide.phase).toBe('guide');
  expect(guide.busy || guide.locationReady || guide.signalReady).toBe(false);
  const paused = capturePresentation({ ...state, reading, enabled: false });
  expect(paused.phase).toBe('idle');
  expect(paused.busy || paused.locationReady || paused.signalReady).toBe(false);
});

test('multi-sample stationary averaging shows progress until 8 samples complete', () => {
  const averaging = capturePresentation({
    ...state,
    reading: { ...reading, sampleCount: 3, targetSamples: 8 },
  });
  expect(averaging.phase).toBe('averaging');
  expect(averaging.busy).toBe(true);
  expect(averaging.label).toBe('Promediando (3/8)');

  const completed = capturePresentation({
    ...state,
    status: 'ready',
    canRecord: true,
    reading: { ...reading, sampleCount: 8, targetSamples: 8 },
  });
  expect(completed.phase).toBe('ready');
  expect(completed.body).toContain('Promedio de 8 mediciones completado');
});
