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
