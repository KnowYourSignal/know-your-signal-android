import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { MapConfiguration } from '../specs/NativeFieldwork';
import {
  boundsFor,
  containsCoordinate,
  type Filters,
  type Region,
} from '../state/MapFilters';
import {
  VIEWPORT_DEBOUNCE_MS,
  MapRequestError,
  cachedCells,
  mapQuery,
  requestCells,
  type PublicCell,
  type MapErrorCode,
  type WifiConnection,
} from './PublicMapService';

const EMPTY: ReadonlyArray<PublicCell> = [];

type Result = {
  key: string;
  cells: ReadonlyArray<PublicCell>;
  loading: boolean;
  cached: boolean;
  error: MapErrorCode | null;
};

export function usePublicCells(
  configuration: MapConfiguration | null,
  region: Region,
  filters: Filters,
  wifiConnection: WifiConnection | null,
  active: boolean,
) {
  const [result, setResult] = useState<Result | null>(null);
  const [refresh, setRefresh] = useState(0);
  const force = useRef<string | null>(null);
  const query = configuration?.url
    ? mapQuery(configuration, region, filters, wifiConnection)
    : null;
  const key = query?.key ?? null;

  const fetchPlan = useEffectEvent(() => {
    if (!configuration || !query) {
      return;
    }
    const bypass = force.current === query.key;
    force.current = null;
    const existing = bypass ? undefined : cachedCells(query.key);
    if (existing) {
      setResult({
        key: query.key,
        cells: existing.cells,
        loading: false,
        cached: true,
        error: null,
      });
      return;
    }
    const controller = new AbortController();
    setResult(previous => ({
      key: query.key,
      cells: previous?.key === query.key ? previous.cells : EMPTY,
      loading: true,
      cached: false,
      error: null,
    }));
    const timer = setTimeout(
      async () => {
        try {
          const response = await requestCells(
            configuration,
            query,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setResult({
              key: query.key,
              cells: response.cells,
              loading: false,
              cached: false,
              error: null,
            });
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setResult(previous => ({
              key: query.key,
              cells: previous?.key === query.key ? previous.cells : EMPTY,
              loading: false,
              cached: false,
              error: error instanceof MapRequestError ? error.code : 'NETWORK',
            }));
          }
        }
      },
      bypass ? 0 : VIEWPORT_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  useEffect(() => {
    // The plan key includes the layer, day and rounded request bounds.
    // Moving the camera inside that area must not restart the request.
    if (active && key) {
      return fetchPlan();
    }
  }, [active, key, refresh]);

  const current = result?.key === key ? result : null;
  const available = current?.cells ?? EMPTY;
  const cells = useMemo(() => {
    const visible = boundsFor(region);
    return available.filter(cell => containsCoordinate(visible, cell));
  }, [available, region]);

  function reload() {
    force.current = key;
    setRefresh(value => value + 1);
  }

  return {
    hasViewport: key !== null,
    current,
    cells,
    loading:
      configuration === null || (key !== null && (!current || current.loading)),
    reload,
  };
}
