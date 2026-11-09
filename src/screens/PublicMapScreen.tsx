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
import {
  METRICS,
  METRIC_LABELS,
  floorLabel,
  formatSignal,
  networkLabel,
  signalWeight,
} from '../domain/Measurement';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import {
  WIFI_CONNECTIONS,
  type MapErrorCode,
  type WifiConnection,
} from '../services/PublicMapService';
import { useAppForeground } from '../services/useAppForeground';
import { useMapLocation } from '../services/useMapLocation';
import { usePublicCells } from '../services/usePublicCells';
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

const noConfig: MapConfiguration = {
  url: '',
  publishableKey: '',
  mapTiles: false,
};
const mapErrors: Record<MapErrorCode, { title: string; body: string }> = {
  NETWORK: {
    title: 'No pudimos conectar con el mapa',
    body: 'Revisa tu conexión y vuelve a intentarlo.',
  },
  TIMEOUT: {
    title: 'Esta consulta está tardando demasiado',
    body: 'Vuelve a intentarlo cuando la conexión sea más estable.',
  },
  RATE_LIMITED: {
    title: 'El mapa está recibiendo muchas consultas',
    body: 'Espera un momento antes de volver a consultar esta zona.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'El mapa está temporalmente ocupado',
    body: 'Podrás volver a consultar esta zona en unos momentos.',
  },
  CONFIGURATION: {
    title: 'El servicio necesita una actualización',
    body: 'El equipo debe revisar la configuración de esta instalación. Puedes consultar tus capturas en Mi historial.',
  },
  FILTERS: {
    title: 'Revisa los filtros de esta zona',
    body: 'Prueba con otro piso o acércate al área que deseas consultar.',
  },
  INVALID_RESPONSE: {
    title: 'No pudimos actualizar el mapa',
    body: 'El servicio devolvió una consulta incompleta. Inténtalo de nuevo más tarde.',
  },
};
export function PublicMapScreen() {
  const focused = useIsFocused();
  const foreground = useAppForeground();
  const reduced = useReducedMotion();
  const { status: settings } = useSettings();
  const { height, fontScale } = useWindowDimensions();
  const mapControlStyle = { flexGrow: 1, flexBasis: 90 * fontScale };
  const mapHeight = Math.max(250, Math.min(365, height * 0.39));
  const [configuration, setConfiguration] = useState<MapConfiguration | null>(
    null,
  );
  const [region, setRegion] = useState<Region>(START_REGION);
  const [filters, setFilters] = useState<Filters>({
    floor: 0,
    metric: 'wifi_rssi',
  });
  const [wifiConnection, setWifiConnection] = useState<WifiConnection | null>(
    null,
  );
  const [connectionPicker, setConnectionPicker] = useState(false);
  const [floorEdit, setFloorEdit] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const { hasViewport, current, cells, loading, reload } = usePublicCells(
    configuration,
    region,
    filters,
    wifiConnection,
    focused && foreground,
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

  const selected = cells.find(cell => cell.id === selectedId);
  const mapError = current?.error ? mapErrors[current.error] : null;
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

  const {
    locate,
    locating,
    error: locationError,
  } = useMapLocation(focused && foreground, position => {
    // Public queries need an area, not the precise position of the phone.
    center(
      shiftRegion(
        START_REGION,
        Math.round(position.latitude * 1_000) / 1_000,
        Math.round(position.longitude * 1_000) / 1_000,
      ),
    );
  });

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
        {filters.metric === 'wifi_rssi' && (
          <View style={s.filters}>
            <Chip
              label={
                (WIFI_CONNECTIONS.find(
                  option => option.value === wifiConnection,
                )?.label ?? 'Todas las Wi-Fi') + ' ▾'
              }
              selected={wifiConnection !== null}
              onPress={() => setConnectionPicker(true)}
            />
          </View>
        )}

        <View style={[g.card, s.mapCard]}>
          <View style={s.mapHeading}>
            <Text style={g.sectionTitle}>Zona visible</Text>
            <StatusPill
              label={
                loading
                  ? 'Consultando'
                  : current?.error && cells.length
                  ? 'Última consulta'
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
              onPress={locate}
              busy={locating}
              style={mapControlStyle}
            />
            <Button
              label="Acercar"
              kind="secondary"
              onPress={() => center(zoomRegion(region, 0.5))}
              style={mapControlStyle}
            />
            <Button
              label="Alejar"
              kind="secondary"
              onPress={() => center(zoomRegion(region, 2))}
              style={mapControlStyle}
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
        ) : !hasViewport ? (
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
              title={mapError?.title ?? 'No se pudo consultar esta zona'}
              body={
                cells.length
                  ? 'Conservamos las celdas de la última consulta de esta zona. Intenta actualizar cuando vuelva la conexión.'
                  : mapError?.body ??
                    'Revisa tu conexión y vuelve a intentarlo.'
              }
              action={
                current.error === 'CONFIGURATION'
                  ? undefined
                  : current.error === 'FILTERS'
                  ? {
                      label: 'Cambiar piso',
                      onPress: () => setFloorEdit(String(filters.floor)),
                    }
                  : { label: 'Reintentar', onPress: reload }
              }
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

        {hasViewport && !current?.error && (
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
        title="Tipo de Wi-Fi"
        visible={connectionPicker}
        onClose={() => setConnectionPicker(false)}
      >
        {[{ value: null, label: 'Todas las Wi-Fi' }, ...WIFI_CONNECTIONS].map(
          option => (
            <Chip
              key={option.value ?? 'all'}
              label={option.label}
              selected={option.value === wifiConnection}
              onPress={() => {
                setWifiConnection(option.value);
                setSelectedId(null);
                setConnectionPicker(false);
              }}
            />
          ),
        )}
      </Dialog>
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
