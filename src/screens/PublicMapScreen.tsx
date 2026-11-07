import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import MapView, { Heatmap, PROVIDER_GOOGLE } from 'react-native-maps';

import { FloorSelector } from '../components/FloorSelector';
import { GeoPlane } from '../components/GeoPlane';
import { SignalLegend } from '../components/HeatmapLayer';
import { Icon } from '../components/Icon';
import { Reveal, useReducedMotion } from '../components/Motion';
import {
  Button,
  Chip,
  Dialog,
  ScreenTitle,
  StatePanel,
  StatusPill,
} from '../components/UI';
import { parseFloor } from '../domain/CapturePolicy';
import { captureMessage, errorCode } from '../domain/CaptureState';
import {
  METRICS,
  METRIC_LABELS,
  floorLabel,
  formatSignal,
  networkLabel,
  signalWeight,
} from '../domain/Measurement';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import { requestLocation, telemetry } from '../services/NativeTelemetryAdapter';
import {
  VIEWPORT_DEBOUNCE_MS,
  cachedCells,
  mapQuery,
  requestCells,
  type PublicCell,
} from '../services/PublicMapService';
import type { MapConfiguration } from '../specs/NativeFieldwork';
import {
  START_REGION,
  shiftRegion,
  zoomRegion,
  type Filters,
  type Region,
} from '../state/MapFilters';
import { useSettings } from '../state/SettingsContext';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

const EMPTY_CELLS: ReadonlyArray<PublicCell> = [];
const noConfig: MapConfiguration = {
  url: '',
  publishableKey: '',
  mapTiles: false,
};
type Result = {
  key: string;
  cells: ReadonlyArray<PublicCell>;
  loading: boolean;
  cached: boolean;
  error: boolean;
};

export function PublicMapScreen() {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { status: settings } = useSettings();
  const { height } = useWindowDimensions();
  const mapHeight = Math.max(250, Math.min(365, height * 0.39));
  const [configuration, setConfiguration] = useState<MapConfiguration | null>(
    null,
  );
  const [region, setRegion] = useState<Region>(START_REGION);
  const [filters, setFilters] = useState<Filters>({
    floor: 0,
    metric: 'wifi_rssi',
  });
  const [result, setResult] = useState<Result | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [floorEdit, setFloorEdit] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const force = useRef(false);
  const locatingRef = useRef(false);
  const query = useMemo(
    () =>
      configuration?.url ? mapQuery(configuration, region, filters) : null,
    [configuration, region, filters],
  );

  useEffect(() => {
    let active = true;
    fieldwork()
      .getMapConfiguration()
      .then(config => {
        if (active) setConfiguration(config);
      })
      .catch(() => {
        if (active) setConfiguration(noConfig);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!focused || !configuration || !query) {
      return;
    }
    const skipCache = force.current;
    force.current = false;
    const existing = !skipCache ? cachedCells(query.key) : undefined;
    if (existing) {
      setResult({
        key: query.key,
        cells: existing.cells,
        loading: false,
        cached: true,
        error: false,
      });
      return;
    }
    const controller = new AbortController();
    setResult(previous => ({
      key: query.key,
      cells: previous?.key === query.key ? previous.cells : EMPTY_CELLS,
      loading: true,
      cached: false,
      error: false,
    }));
    const timer = setTimeout(
      () => {
        requestCells(configuration, query, controller.signal)
          .then(response => {
            if (!controller.signal.aborted) {
              setResult({
                key: query.key,
                cells: response.cells,
                loading: false,
                cached: false,
                error: false,
              });
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setResult(previous => ({
                key: query.key,
                cells:
                  previous?.key === query.key ? previous.cells : EMPTY_CELLS,
                loading: false,
                cached: false,
                error: true,
              }));
            }
          });
      },
      skipCache ? 0 : VIEWPORT_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [configuration, query, focused, refresh]);

  const current = result?.key === query?.key ? result : null;
  const cells = current?.cells ?? EMPTY_CELLS;
  const loading =
    configuration === null || (!!query && (!current || current.loading));
  const selected = cells.find(cell => cell.id === selectedId);
  const resolution = cells.length
    ? Math.max(...cells.map(cell => cell.resolutionM))
    : null;
  const weights = useMemo(
    () =>
      cells.map(cell => ({
        latitude: cell.latitude,
        longitude: cell.longitude,
        weight: Math.max(0.04, signalWeight(cell.powerDbm, filters.metric)),
      })),
    [cells, filters.metric],
  );

  function center(next: Region) {
    setSelectedId(null);
    if (configuration?.mapTiles && map.current) {
      map.current.animateToRegion(next, reduced ? 0 : 220);
    } else {
      setRegion(next);
    }
  }

  async function locate() {
    if (locatingRef.current) {
      return;
    }
    locatingRef.current = true;
    setLocating(true);
    setLocationError(null);
    try {
      if (!(await requestLocation(false))) {
        setLocationError(
          'Permite la ubicación para centrar el mapa en tu zona.',
        );
        return;
      }
      const position = await telemetry.locate();
      // Public queries need an area, not the precise position of the phone.
      center(
        shiftRegion(
          START_REGION,
          Math.round(position.latitude * 1_000) / 1_000,
          Math.round(position.longitude * 1_000) / 1_000,
        ),
      );
    } catch (error) {
      setLocationError(captureMessage(errorCode(error)));
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  }

  function reload() {
    force.current = true;
    setRefresh(value => value + 1);
  }

  const floor = floorEdit === null ? null : parseFloor(floorEdit);

  return (
    <ScrollView
      style={g.screen}
      contentContainerStyle={g.content}
      nestedScrollEnabled
    >
      <Reveal style={s.layout}>
        <ScreenTitle
          eyebrow="COBERTURA COLECTIVA"
          title="Mapa comunitario"
          subtitle="Explora niveles de señal agrupados por zona y piso."
        />
        <View style={s.filters}>
          <Chip
            label={floorLabel(filters.floor) + ' ▾'}
            selected
            onPress={() => setFloorEdit(String(filters.floor))}
          />
          {METRICS.map(metric => (
            <Chip
              key={metric}
              label={METRIC_LABELS[metric]}
              selected={filters.metric === metric}
              onPress={() => {
                setSelectedId(null);
                setFilters({ ...filters, metric });
              }}
            />
          ))}
        </View>

        <View style={[g.card, s.mapCard]}>
          <View style={s.mapHeading}>
            <Text style={g.sectionTitle}>Zona visible</Text>
            <StatusPill
              label={
                loading
                  ? 'Consultando'
                  : current?.cached
                  ? 'En caché'
                  : resolution
                  ? resolution + ' m por celda'
                  : 'Vista agregada'
              }
            />
          </View>
          {configuration?.mapTiles ? (
            <View style={[s.mapFrame, { height: mapHeight }]}>
              <MapView
                ref={map}
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_GOOGLE}
                initialRegion={region}
                toolbarEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                onRegionChangeComplete={setRegion}
              >
                {!!weights.length && (
                  <Heatmap
                    points={weights}
                    radius={26}
                    opacity={0.64}
                    gradient={{
                      colors: ['#B13B45', '#F2BB50', '#31A76E'],
                      startPoints: [0.07, 0.45, 0.83],
                      colorMapSize: 256,
                    }}
                  />
                )}
              </MapView>
            </View>
          ) : (
            <GeoPlane
              points={cells}
              region={region}
              metric={filters.metric}
              height={mapHeight}
              onChange={setRegion}
              onSelect={setSelectedId}
              selected={selected}
            />
          )}
          <SignalLegend />
          <View style={s.tools}>
            <Button
              label="Mi zona"
              kind="secondary"
              icon="locate"
              onPress={locate}
              busy={locating}
              style={s.grow}
            />
            <Button
              label="Acercar"
              kind="secondary"
              icon="plus"
              onPress={() => center(zoomRegion(region, 0.5))}
              style={s.grow}
            />
            <Button
              label="Alejar"
              kind="secondary"
              icon="minus"
              onPress={() => center(zoomRegion(region, 2))}
              style={s.grow}
            />
          </View>
          {locationError && (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              {locationError}
            </Text>
          )}
        </View>

        {loading ? (
          <View style={[g.card, g.row]}>
            <ActivityIndicator color={COLORS.primary} />
            <View style={s.grow}>
              <Text style={g.sectionTitle}>Cargando celdas</Text>
              <Text style={g.caption}>
                Consultando el área y la tecnología seleccionadas.
              </Text>
            </View>
          </View>
        ) : !configuration?.url ? (
          <View style={g.card}>
            <StatePanel
              icon="globe"
              title="Servicio aún sin configurar"
              body="El mapa comunitario estará disponible al configurar el servicio en esta instalación."
            />
          </View>
        ) : !query ? (
          <View style={g.card}>
            <StatePanel
              icon="map"
              title="Acércate a una zona"
              body="Usa el zoom para consultar un área más pequeña."
            />
          </View>
        ) : current?.error ? (
          <View style={g.card}>
            <StatePanel
              icon="refresh"
              title="No se pudo consultar esta zona"
              body="Revisa tu conexión y vuelve a intentarlo."
              action={{ label: 'Reintentar', onPress: reload }}
            />
          </View>
        ) : cells.length === 0 ? (
          <View style={g.card}>
            <StatePanel
              icon="layers"
              title="Todavía no hay celdas visibles"
              body="Prueba con otro piso o tecnología. Cada celda requiere al menos cinco cuentas contribuyentes."
            />
          </View>
        ) : selected ? (
          <View style={g.card}>
            <Text style={g.sectionTitle}>
              Mediana{' '}
              {formatSignal(
                selected.powerDbm,
                filters.metric,
                settings?.technicalMode ?? false,
              )}
            </Text>
            <Text style={g.body}>
              {networkLabel(selected.connection)} · {selected.contributors}{' '}
              contribuyentes · {selected.resolutionM} m
            </Text>
          </View>
        ) : (
          <View style={[g.card, g.row]}>
            <Icon name="shield" size={20} />
            <Text style={[g.body, s.grow]}>
              {cells.length} celdas agrupadas. Cada valor representa la mediana
              de la celda.
            </Text>
          </View>
        )}

        {!!query && !current?.error && (
          <Button
            label="Actualizar zona"
            icon="refresh"
            kind="secondary"
            disabled={loading}
            onPress={reload}
          />
        )}
      </Reveal>
      <Dialog
        title="Elegir piso"
        visible={floorEdit !== null}
        onClose={() => setFloorEdit(null)}
      >
        <FloorSelector value={floorEdit ?? ''} onChange={setFloorEdit} />
        <Button
          label="Aplicar piso"
          disabled={floor === null}
          onPress={() => {
            if (floor !== null) {
              setSelectedId(null);
              setFilters({ ...filters, floor });
              setFloorEdit(null);
            }
          }}
        />
      </Dialog>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mapCard: { padding: 11, gap: 7 },
  mapHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 3,
  },
  mapFrame: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#EAF1FD',
  },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grow: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 12 },
});
