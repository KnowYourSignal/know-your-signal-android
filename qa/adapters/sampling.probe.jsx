/* Real capture hook; plain providers deliberately avoid _isMockFunction.
 * Timers and native inputs are controlled. This does not simulate physical GPS.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useCaptureSession } from '@sut/services/useCaptureSession';

let mockState;
let session;
const ready = {
  latitude: -33.45,
  longitude: -70.65,
  accuracyM: 7,
  powerDbm: -70,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  validForMs: 4000,
  problem: null,
};
const frozen = {
  id: 'synthetic-draft',
  ...ready,
  capturedAt: '2026-11-17T00:00:00Z',
};
const powers = [-70, -72, -68, -66, -74, -62, -64, -60];
jest.mock('@sut/services/NativeTelemetryAdapter', () => ({
  requestLocation: async () => {
    if (mockState.scenario === 'permission-error')
      throw { code: 'PERMISSION_DENIED' };
    return mockState.scenario !== 'permission-denied';
  },
  telemetry: {
    read: async () => {
      mockState.reads++;
      if (mockState.pending) return mockState.pending;
      if (mockState.scenario === 'gps-timeout')
        throw { code: 'LOCATION_TIMEOUT' };
      if (mockState.scenario === 'expiration' && mockState.reads > 1)
        return new Promise(() => {});
      if (mockState.collecting) {
        const index = mockState.collected++;
        if (mockState.scenario === 'eight-samples')
          return { ...mockState.ready, powerDbm: mockState.powers[index % 8] };
        if (mockState.scenario === 'invalid-samples' && index < 7)
          return {
            ...mockState.ready,
            powerDbm: -120,
            accuracyM: 30,
            problem: 'LOW_ACCURACY',
          };
        if (mockState.scenario === 'mixed-metrics' && index >= 4)
          return {
            ...mockState.ready,
            metric: 'lte_rsrp',
            technology: 'lte',
            connection: 'movil',
            powerDbm: -105,
          };
      }
      return { ...mockState.ready };
    },
    stop: () => {
      mockState.stops++;
    },
    freeze: async () => {
      mockState.freezes++;
      return { ...mockState.frozen };
    },
  },
}));
jest.mock('@sut/services/useAppForeground', () => ({
  useAppForeground: () => mockState.foreground,
}));

function Harness({ focused = true }) {
  session = useCaptureSession(focused);
  return null;
}
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../cases/catalog.json'), 'utf8'),
);
const repeat = Number(process.env.KYS_QA_REPETITIONS || 3);

async function advance(ms) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('Robot QA - ciclo y muestreo del hook real', () => {
  for (const item of catalog.cases.filter(c => c.adapter === 'jest-hook')) {
    for (let repetition = 1; repetition <= repeat; repetition++) {
      test(`[${item.case_id}] repetición ${repetition}: ${item.title}`, async () => {
        const scenario = item.input.scenario;
        let root;
        let capture;
        jest.useFakeTimers({ now: 1794888000000 });
        mockState = {
          scenario,
          ready,
          frozen,
          powers,
          foreground: scenario !== 'background',
          reads: 0,
          collected: 0,
          stops: 0,
          freezes: 0,
          collecting: false,
        };
        try {
          await act(async () => {
            root = ReactTestRenderer.create(
              <Harness focused={scenario !== 'unfocused'} />,
            );
          });
          if (
            [
              'eight-samples',
              'pause-capture',
              'blur-capture',
              'double-capture',
              'invalid-samples',
              'mixed-metrics',
            ].includes(scenario) &&
            session.sampleStep == null
          ) {
            throw new Error(
              '[QA_UNSUPPORTED_CAPABILITY] This revision predates the eight-reading capture hook. Compare capability separately.',
            );
          }
          if (scenario === 'late-read') {
            mockState.pending = new Promise(resolve => {
              mockState.resolve = resolve;
            });
          }
          await act(async () => {
            await session.start();
          });

          if (['permission-denied', 'permission-error'].includes(scenario)) {
            expect(session.enabled).toBe(false);
            expect(session.problem).toBe('PERMISSION_DENIED');
            expect(mockState.freezes).toBe(0);
            return;
          }
          if (scenario === 'pause') {
            await act(async () => session.pause());
            expect(session.reading).toBeNull();
            expect(session.enabled).toBe(false);
            expect(mockState.stops).toBeGreaterThan(0);
            return;
          }
          if (scenario === 'late-read') {
            await act(async () => root.update(<Harness focused={false} />));
            await act(async () => mockState.resolve(ready));
            expect(session.reading).toBeNull();
            expect(session.canRecord).toBe(false);
            return;
          }
          if (scenario === 'expiration') {
            await advance(4001);
            expect(session.canRecord).toBe(false);
            expect(session.problem).toBe('STALE_READING');
            return;
          }
          if (scenario === 'gps-timeout') {
            await advance(60001);
            expect(session.enabled).toBe(false);
            expect(session.problem).toBe('LOCATION_TIMEOUT');
            return;
          }
          let resolved = false;
          mockState.collecting = true;
          await act(async () => {
            capture = session.capture().then(value => {
              resolved = true;
              mockState.collecting = false;
              return value;
            });
          });
          if (scenario === 'double-capture') {
            let second;
            await act(async () => {
              second = await session.capture();
            });
            expect(second).toBeNull();
          }
          if (scenario === 'pause-capture')
            await act(async () => session.pause());
          if (scenario === 'blur-capture')
            await act(async () => root.update(<Harness focused={false} />));
          for (let attempt = 0; attempt < 60 && !resolved; attempt++)
            await advance(120);
          if (!resolved)
            throw new Error(
              '[QA_SETUP_ERROR] Capture did not settle within the virtual time budget',
            );
          const result = await capture;
          if (
            [
              'pause-capture',
              'blur-capture',
              'unfocused',
              'background',
            ].includes(scenario)
          ) {
            expect(result).toBeNull();
            expect(mockState.freezes).toBe(0);
          } else if (scenario === 'mixed-metrics') {
            expect(result).toBeNull();
          } else if (scenario === 'invalid-samples') {
            expect(result?.powerDbm).toBe(item.expected.average);
          } else {
            expect(mockState.freezes).toBe(1);
            if (scenario === 'eight-samples') {
              expect(mockState.collected).toBe(8);
              expect(result.powerDbm).toBe(item.expected.average);
            }
          }
        } finally {
          await act(async () => root?.unmount());
          jest.clearAllTimers();
          jest.useRealTimers();
        }
      });
    }
  }
});
