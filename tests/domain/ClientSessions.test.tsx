import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useCaptureSession } from '../../src/services/useCaptureSession';
import { telemetry } from '../../src/services/NativeTelemetryAdapter';
import { VIEWPORT_DEBOUNCE_MS } from '../../src/services/PublicMapService';
import { usePublicCells } from '../../src/services/usePublicCells';
import type { SensorReading } from '../../src/specs/NativeTelemetry';
import {
  START_REGION,
  type Filters,
  type Region,
} from '../../src/state/MapFilters';

jest.mock('../../src/services/NativeTelemetryAdapter', () => ({
  requestLocation: jest.fn().mockResolvedValue(true),
  telemetry: { read: jest.fn(), stop: jest.fn(), freeze: jest.fn() },
}));
jest.mock('../../src/services/useAppForeground', () => ({
  useAppForeground: () => true,
}));

const ready: SensorReading = {
  latitude: -33.4568,
  longitude: -70.6548,
  accuracyM: 6,
  powerDbm: -68,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  problem: null,
  validForMs: 4_000,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

test('leaving Medir stops native collection and drops an outstanding reading', async () => {
  const pending = deferred<SensorReading>();
  jest.mocked(telemetry.read).mockReturnValueOnce(pending.promise);
  let root!: ReactTestRenderer.ReactTestRenderer;
  let session!: ReturnType<typeof useCaptureSession>;
  function Capture({ active }: { active: boolean }) {
    session = useCaptureSession(active);
    return null;
  }

  await act(async () => {
    root = ReactTestRenderer.create(<Capture active />);
  });
  await act(async () => {
    await session.start();
  });
  expect(telemetry.read).toHaveBeenCalledTimes(1);

  await act(async () => root.update(<Capture active={false} />));
  expect(telemetry.stop).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(ready));
  expect(session.canRecord).toBe(false);
  expect(session.reading).toBeNull();
  await act(async () => root.unmount());
});

test('panning within one query keeps its request and a different layer cancels it', async () => {
  jest.useFakeTimers();
  const oldFetch = globalThis.fetch;
  const first = deferred<Response>();
  const second = deferred<Response>();
  const fetcher = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  globalThis.fetch = fetcher;
  const config = {
    url: 'https://viewport.invalid',
    publishableKey: 'sb_publishable_test',
    mapTiles: false,
  };
  let root: ReactTestRenderer.ReactTestRenderer | undefined;
  let layer!: ReturnType<typeof usePublicCells>;
  function Cells({ region, filters }: { region: Region; filters: Filters }) {
    layer = usePublicCells(config, region, filters, null, true);
    return null;
  }
  const wifi = { floor: 0, metric: 'wifi_rssi' } as const;
  const lte = { floor: 0, metric: 'lte_rsrp' } as const;
  const pan = { ...START_REGION, latitude: START_REGION.latitude + 0.00005 };
  try {
    await act(async () => {
      root = ReactTestRenderer.create(
        <Cells region={START_REGION} filters={wifi} />,
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(VIEWPORT_DEBOUNCE_MS);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const wifiSignal: AbortSignal = fetcher.mock.calls[0][1].signal;
    await act(async () => root!.update(<Cells region={pan} filters={wifi} />));
    expect(wifiSignal.aborted).toBe(false);

    await act(async () => root!.update(<Cells region={pan} filters={lte} />));
    expect(wifiSignal.aborted).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(VIEWPORT_DEBOUNCE_MS);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    function response(metric: string, connection: string, id: string) {
      return {
        ok: true,
        json: async () => [
          {
            celda_id: id,
            metrica: metric,
            tipo_conexion: connection,
            latitud_centro: pan.latitude,
            longitud_centro: pan.longitude,
            mediana_potencia: -82,
            total_contribuyentes: 5,
            resolucion_m: 50,
          },
        ],
      } as Response;
    }
    await act(async () => {
      second.resolve(response('lte_rsrp', 'datos_moviles', 'lte-cell'));
      first.resolve(response('wifi_rssi', 'wifi_privada', 'wifi-cell'));
    });
    expect(layer.loading).toBe(false);
    expect(layer.cells.map(cell => cell.id)).toEqual(['lte-cell']);
  } finally {
    await act(async () => root?.unmount());
    globalThis.fetch = oldFetch;
    jest.useRealTimers();
  }
});

test('a capture keeps the explicit session and resumes a fresh reading only on returning from the room form', async () => {
  jest.useFakeTimers();
  jest.mocked(telemetry.read).mockClear().mockResolvedValue(ready);
  jest.mocked(telemetry.stop).mockClear();
  const draft = {
    id: 'captured-draft',
    accuracyM: 6,
    powerDbm: -68,
    metric: 'wifi_rssi',
    technology: 'wifi',
    connection: 'wifi_privada',
    capturedAt: '2026-11-09T17:00:00.000Z',
  };
  jest.mocked(telemetry.freeze).mockResolvedValueOnce(draft);
  let root: ReactTestRenderer.ReactTestRenderer | undefined;
  let session!: ReturnType<typeof useCaptureSession>;
  function Capture({ active }: { active: boolean }) {
    session = useCaptureSession(active);
    return null;
  }
  try {
    await act(async () => {
      root = ReactTestRenderer.create(<Capture active />);
    });
    await act(async () => {
      await session.start();
    });
    expect(session.canRecord).toBe(true);
    let captured;
    await act(async () => {
      captured = await session.capture();
    });
    expect(captured).toEqual(draft);
    expect(session.enabled).toBe(true);
    expect(session.canRecord).toBe(false);
    expect(session.reading).toBeNull();
    expect(telemetry.stop).toHaveBeenCalled();

    await act(async () => root!.update(<Capture active={false} />));
    const reads = jest.mocked(telemetry.read).mock.calls.length;
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(telemetry.read).toHaveBeenCalledTimes(reads);

    await act(async () => root!.update(<Capture active />));
    expect(telemetry.read).toHaveBeenCalledTimes(reads + 1);
    expect(session.canRecord).toBe(true);
    await act(async () => session.pause());
    await act(async () => root!.update(<Capture active={false} />));
    await act(async () => root!.update(<Capture active />));
    expect(session.enabled).toBe(false);
    expect(telemetry.read).toHaveBeenCalledTimes(reads + 1);
  } finally {
    await act(async () => root?.unmount());
    jest.useRealTimers();
  }
});

test('stationary burst rejects all-invalid windows (A03) and metric changes on freeze retry (A02)', async () => {
  jest.useFakeTimers();
  const originalFreeze = telemetry.freeze;
  const originalRead = telemetry.read;
  let root: ReactTestRenderer.ReactTestRenderer | undefined;
  let session!: ReturnType<typeof useCaptureSession>;
  function Capture({ active }: { active: boolean }) {
    session = useCaptureSession(active);
    return null;
  }
  try {
    // A03: 13 LOW_ACCURACY samples during burst must return null without freezing
    let freezeCalls = 0;
    let burstPhase = false;
    telemetry.read = (async () =>
      burstPhase
        ? { ...ready, accuracyM: 30, powerDbm: -120, problem: 'LOW_ACCURACY' }
        : ready) as typeof telemetry.read;
    telemetry.freeze = (async () => {
      freezeCalls += 1;
      return {
        id: 'stale-draft',
        accuracyM: 6,
        powerDbm: -68,
        metric: 'wifi_rssi',
        technology: 'wifi',
        connection: 'wifi_privada',
        capturedAt: '2026-11-21T00:00:00.000Z',
      };
    }) as typeof telemetry.freeze;

    await act(async () => {
      root = ReactTestRenderer.create(<Capture active />);
    });
    await act(async () => {
      await session.start();
    });
    expect(session.canRecord).toBe(true);
    burstPhase = true;
    let promise!: Promise<unknown>;
    await act(async () => {
      promise = session.capture();
    });
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
    }
    expect(await promise).toBeNull();
    expect(freezeCalls).toBe(0);
    expect(session.problem).toBe('LOW_ACCURACY');

    // A02: Wi-Fi during 8 samples, then freeze fails and retry reads LTE -> must return null
    burstPhase = false;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
    let sampleReads = 0;
    telemetry.read = (async () => {
      sampleReads += 1;
      if (sampleReads <= 8) {
        return { ...ready, powerDbm: -70, metric: 'wifi_rssi' };
      }
      return {
        ...ready,
        powerDbm: -110,
        metric: 'lte_rsrp',
        technology: 'lte',
        connection: 'datos_moviles',
      };
    }) as typeof telemetry.read;
    let firstFreeze = true;
    telemetry.freeze = (async () => {
      if (firstFreeze) {
        firstFreeze = false;
        throw new Error('STALE_READING');
      }
      return {
        id: 'mixed-draft',
        accuracyM: 6,
        powerDbm: -110,
        metric: 'lte_rsrp',
        technology: 'lte',
        connection: 'datos_moviles',
        capturedAt: '2026-11-21T00:00:00.000Z',
      };
    }) as typeof telemetry.freeze;

    await act(async () => {
      promise = session.capture();
    });
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
    }
    expect(await promise).toBeNull();
  } finally {
    telemetry.freeze = originalFreeze;
    telemetry.read = originalRead;
    await act(async () => root?.unmount());
    jest.useRealTimers();
  }
});
