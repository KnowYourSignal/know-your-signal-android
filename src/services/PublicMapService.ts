// src/services/PublicMapService.ts
import { MetricCategory } from '../components/HeatmapLayer';

export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface PublicMapCell {
  cellId: string;
  centerLat: number;
  centerLng: number;
  floor: number;
  medianSignalDbm: number;
  metric: MetricCategory;
  technology: string;
  sampleCount: number;
  contributorCount: number;
  resolutionMeters: number;
  updatedAt: string;
}

export interface PublicCellsQuery {
  bounds: ViewportBounds;
  floor: number;
  metric: MetricCategory;
  zoomLevel?: number;
  timeWindowHours?: number | null;
}

interface CacheEntry {
  expiresAt: number;
  cachedAt: number;
  data: PublicMapCell[];
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos según Sección 5.2 IDA

export class PublicMapService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly endpointUrl: string;
  private readonly anonKey: string;
  private activeRequestId = 0;

 constructor(
    endpointUrl: string = (globalThis as any)?.process?.env?.SUPABASE_PUBLIC_CELLS_URL ?? '',
    anonKey: string = (globalThis as any)?.process?.env?.SUPABASE_ANON_KEY ?? '',
  ) {
    this.endpointUrl = endpointUrl;
    this.anonKey = anonKey;
  }

  /**
   * Clave de caché según Sección 5.2 IDA:
   * área normalizada, zoom, piso, métrica y ventana temporal.
   */
  private buildCacheKey(query: PublicCellsQuery): string {
    const b = query.bounds;
    const quantizedArea = [
      b.minLat.toFixed(3),
      b.maxLat.toFixed(3),
      b.minLng.toFixed(3),
      b.maxLng.toFixed(3),
    ].join(':');

    return `${quantizedArea}|z:${query.zoomLevel ?? 15}|floor:${query.floor}|metric:${query.metric}|win:${
      query.timeWindowHours ?? 'ALL'
    }`;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public async fetchAggregatedCells(
    query: PublicCellsQuery,
    signal?: AbortSignal,
  ): Promise<{
    cells: PublicMapCell[];
    fromCache: boolean;
    cacheAgeSeconds: number;
    requestId: number;
  }> {
    const requestId = ++this.activeRequestId;
    const key = this.buildCacheKey(query);
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      return {
        cells: cached.data,
        fromCache: true,
        cacheAgeSeconds: Math.max(0, Math.round((now - cached.cachedAt) / 1000)),
        requestId,
      };
    }

    if (!this.endpointUrl) {
      return { cells: [], fromCache: false, cacheAgeSeconds: 0, requestId };
    }

    const params = new URLSearchParams({
      min_lat: String(query.bounds.minLat),
      max_lat: String(query.bounds.maxLat),
      min_lng: String(query.bounds.minLng),
      max_lng: String(query.bounds.maxLng),
      piso_nivel: String(query.floor),
      metrica: query.metric,
    });

    if (query.zoomLevel !== undefined) {
      params.set('zoom', String(query.zoomLevel));
    }
    if (query.timeWindowHours !== undefined && query.timeWindowHours !== null) {
      params.set('ventana_horas', String(query.timeWindowHours));
    }

    const response = await fetch(`${this.endpointUrl}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(this.anonKey
          ? { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}` }
          : {}),
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Error al consultar celdas públicas (${response.status})`);
    }

    const payload = await response.json();
    const rawCells: PublicMapCell[] = Array.isArray(payload?.cells) ? payload.cells : [];

    // Ficha 11 IDA: Mínimo 5 contribuyentes técnicos distintos por celda
    const safeCells = rawCells.filter((cell) => (cell.contributorCount ?? 0) >= 5);

    this.cache.set(key, {
      expiresAt: now + CACHE_TTL_MS,
      cachedAt: now,
      data: safeCells,
    });

    return { cells: safeCells, fromCache: false, cacheAgeSeconds: 0, requestId };
  }

  public isLatestRequest(requestId: number): boolean {
    return requestId === this.activeRequestId;
  }
}

export const publicMapService = new PublicMapService();