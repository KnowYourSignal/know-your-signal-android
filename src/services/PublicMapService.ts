import type { MapConfiguration } from '../specs/NativeFieldwork';
import { boundsFor, type Filters, type Region } from '../state/MapFilters';

export const MAP_CACHE_MS = 5 * 60 * 1_000;
export const VIEWPORT_DEBOUNCE_MS = 300;

export type PublicCell = {
  id: string;
  latitude: number;
  longitude: number;
  powerDbm: number;
  contributors: number;
  connection: string;
  resolutionM: number;
};

type CachedCells = { cells: ReadonlyArray<PublicCell>; fetchedAt: number };
const cache = new Map<string, CachedCells>();

export function mapQuery(
  config: MapConfiguration,
  region: Region,
  filters: Filters,
) {
  const bounds = boundsFor(region);
  if (!bounds.length) {
    return null;
  }
  const payloads = bounds.map(boundsPart => ({
    ...boundsPart,
    piso_filtro: filters.floor,
    tipo_conexion_filtro: null,
    grid_size_m: 50,
    metrica_filtro: filters.metric,
  }));
  const key = JSON.stringify([
    config.url,
    new Date().toISOString().slice(0, 10),
    payloads,
  ]);
  return { key, payloads };
}

export function cachedCells(
  key: string,
  now = Date.now(),
): CachedCells | undefined {
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt >= 0 && now - hit.fetchedAt < MAP_CACHE_MS) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  cache.delete(key);
  return undefined;
}

function parseCells(value: unknown, metric: Filters['metric']): PublicCell[] {
  if (!Array.isArray(value) || value.length > 1_000) {
    throw new Error('INVALID_MAP_RESPONSE');
  }
  return value.flatMap(row => {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.celda_id !== 'string' ||
      row.metrica !== metric ||
      typeof row.latitud_centro !== 'number' ||
      typeof row.longitud_centro !== 'number' ||
      typeof row.mediana_potencia !== 'number' ||
      typeof row.total_contribuyentes !== 'number' ||
      typeof row.resolucion_m !== 'number' ||
      typeof row.tipo_conexion !== 'string' ||
      !Number.isInteger(row.total_contribuyentes) ||
      row.total_contribuyentes < 5 ||
      !Number.isFinite(row.mediana_potencia) ||
      !(Math.abs(row.latitud_centro) <= 90) ||
      !(Math.abs(row.longitud_centro) <= 180) ||
      !(row.resolucion_m > 0 && Number.isFinite(row.resolucion_m))
    ) {
      return [];
    }
    return [
      {
        id: row.celda_id,
        latitude: row.latitud_centro,
        longitude: row.longitud_centro,
        powerDbm: row.mediana_potencia,
        contributors: row.total_contribuyentes,
        resolutionM: row.resolucion_m,
        connection: row.tipo_conexion,
      },
    ];
  });
}

export async function requestCells(
  config: MapConfiguration,
  query: NonNullable<ReturnType<typeof mapQuery>>,
  signal: AbortSignal,
): Promise<CachedCells> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) {
    abort();
  }
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 9_000);
  try {
    const responses = await Promise.all(
      query.payloads.map(async payload => {
        const result = await fetch(
          config.url + '/rest/v1/rpc/public_map_cells',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              apikey: config.publishableKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );
        if (!result.ok) {
          throw new Error('MAP_REQUEST_FAILED');
        }
        return parseCells(await result.json(), payload.metrica_filtro);
      }),
    );
    if (controller.signal.aborted) {
      throw new Error('MAP_REQUEST_CANCELLED');
    }
    const byId = new Map<string, PublicCell>();
    responses.flat().forEach(cell => byId.set(cell.id, cell));
    const entry = { cells: Array.from(byId.values()), fetchedAt: Date.now() };
    cache.delete(query.key);
    cache.set(query.key, entry);
    if (cache.size > 24) {
      const first = cache.keys().next().value;
      if (first !== undefined) {
        cache.delete(first);
      }
    }
    return entry;
  } finally {
    abort();
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
