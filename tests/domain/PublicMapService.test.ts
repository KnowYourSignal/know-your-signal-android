import {
  cachedCells,
  MAP_CACHE_MS,
  MAP_REQUEST_TIMEOUT_MS,
  mapQuery,
  requestCells,
} from '../../src/services/PublicMapService';
import {
  boundsFor,
  queryBounds,
  START_REGION,
} from '../../src/state/MapFilters';

const config = {
  url: 'https://example.invalid',
  publishableKey: 'sb_publishable_test',
  mapTiles: false,
};
const filter = { floor: 0, metric: 'wifi_rssi' } as const;
const cell = {
  celda_id: 'sample',
  latitud_centro: -33.45,
  longitud_centro: -70.65,
  mediana_potencia: -67.5,
  total_contribuyentes: 5,
  metrica: 'wifi_rssi',
  tipo_conexion: 'wifi_privada',
  resolucion_m: 50,
};

test('splits a viewport crossing the antimeridian and rejects overly wide areas', () => {
  const split = boundsFor({
    ...START_REGION,
    longitude: 179.9,
    longitudeDelta: 0.5,
  });
  expect(split).toHaveLength(2);
  expect(split[0].max_lon).toBe(180);
  expect(split[1].min_lon).toBe(-180);
  expect(boundsFor({ ...START_REGION, latitudeDelta: 3 })).toEqual([]);
});

test.each([
  [401, 'CONFIGURATION'],
  [429, 'RATE_LIMITED'],
  [503, 'SERVICE_UNAVAILABLE'],
])('reports HTTP %i without exposing the server body', async (status, code) => {
  const originalFetch = globalThis.fetch;
  const body = jest.fn();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, status, json: body });
  try {
    const query = mapQuery(config, START_REGION, filter)!;
    await expect(
      requestCells(config, query, new AbortController().signal),
    ).rejects.toMatchObject({ code });
    expect(body).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function waitForAbort(): typeof globalThis.fetch {
  return jest.fn(
    (_input, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })),
        );
      }),
  );
}

test('bounds a slow first connection and distinguishes a timeout from cancellation', async () => {
  const originalFetch = globalThis.fetch;
  jest.useFakeTimers();
  globalThis.fetch = waitForAbort();
  try {
    const query = mapQuery(config, START_REGION, filter)!;
    const request = requestCells(
      config,
      query,
      new AbortController().signal,
    ).catch(error => error);
    jest.advanceTimersByTime(MAP_REQUEST_TIMEOUT_MS);
    await expect(request).resolves.toMatchObject({ code: 'TIMEOUT' });

    const controller = new AbortController();
    const cancelled = requestCells(config, query, controller.signal).catch(
      error => error,
    );
    controller.abort();
    await expect(cancelled).resolves.toMatchObject({ name: 'AbortError' });
  } finally {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  }
});

test('nearby camera moves share a buffered query that covers both viewports', () => {
  const nearby = { ...START_REGION, latitude: START_REGION.latitude + 0.00005 };
  const initial = mapQuery(config, START_REGION, filter);
  expect(mapQuery(config, nearby, filter)?.key).toBe(initial?.key);
  expect(mapQuery(config, nearby, { ...filter, floor: 1 })?.key).not.toBe(
    initial?.key,
  );

  const [padded] = queryBounds(nearby);
  const [visible] = boundsFor(nearby);
  expect(padded.min_lat).toBeLessThanOrEqual(visible.min_lat);
  expect(padded.min_lon).toBeLessThanOrEqual(visible.min_lon);
  expect(padded.max_lat).toBeGreaterThanOrEqual(visible.max_lat);
  expect(padded.max_lon).toBeGreaterThanOrEqual(visible.max_lon);
  expect(
    queryBounds({ ...START_REGION, latitudeDelta: 2, longitudeDelta: 2 }),
  ).toEqual(
    boundsFor({ ...START_REGION, latitudeDelta: 2, longitudeDelta: 2 }),
  );
});

test('only requests aggregates and caches the filtered result for five minutes', async () => {
  const originalFetch = globalThis.fetch;
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      cell,
      { ...cell, celda_id: 'suppressed', total_contribuyentes: 4 },
      { ...cell, celda_id: 'other-network', tipo_conexion: 'wifi_publica' },
      { ...cell, celda_id: 'invalid-power', mediana_potencia: 8 },
    ],
  });
  globalThis.fetch = mock;
  try {
    const query = mapQuery(config, START_REGION, filter, 'wifi_privada')!;
    expect(query.key).not.toBe(mapQuery(config, START_REGION, filter)?.key);
    const result = await requestCells(
      config,
      query,
      new AbortController().signal,
    );
    expect(mock.mock.calls[0][0]).toBe(
      config.url + '/rest/v1/rpc/public_map_cells',
    );
    expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({
      piso_filtro: 0,
      metrica_filtro: 'wifi_rssi',
      tipo_conexion_filtro: 'wifi_privada',
    });
    expect(mock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(result.cells.map(item => item.id)).toEqual(['sample']);
    expect(
      cachedCells(query.key, result.fetchedAt + MAP_CACHE_MS - 1)?.cells,
    ).toEqual(result.cells);
    expect(
      cachedCells(query.key, result.fetchedAt + MAP_CACHE_MS),
    ).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
