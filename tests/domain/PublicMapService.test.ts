import {
  cachedCells,
  MAP_CACHE_MS,
  mapQuery,
  requestCells,
} from '../../src/services/PublicMapService';
import { boundsFor, START_REGION } from '../../src/state/MapFilters';

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

test('only requests aggregates and caches the filtered result for five minutes', async () => {
  const originalFetch = globalThis.fetch;
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      cell,
      { ...cell, celda_id: 'suppressed', total_contribuyentes: 4 },
    ],
  });
  globalThis.fetch = mock;
  try {
    const query = mapQuery(config, START_REGION, filter)!;
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
