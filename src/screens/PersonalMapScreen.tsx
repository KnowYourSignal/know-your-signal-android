import { GuideScrollView, GuideTarget } from '../components/GuideTarget';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { EvidenceCard } from '../components/EvidenceCard';
import { GeoPlane } from '../components/GeoPlane';
import { SignalLegend } from '../components/HeatmapLayer';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Motion';
import {
  Button,
  Chip,
  Dialog,
  ScreenTitle,
  StatePanel,
  StatusPill,
} from '../components/UI';
import {
  METRIC_LABELS,
  dateKey,
  floorLabel,
  formatDate,
  formatSignal,
  isMetric,
  networkLabel,
  signalQuality,
  signalWeight,
} from '../domain/Measurement';
import { shareEvidence } from '../services/EvidenceService';
import {
  createEvidenceSnapshot,
  type EvidenceSnapshot,
} from '../domain/Evidence';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import type {
  HistoryLayer,
  MapConfiguration,
  SavedMeasurement,
} from '../specs/NativeFieldwork';
import {
  fitRegion,
  nearestPoint,
  project,
  zoomRegion,
  type Filters,
  type MapLayout,
  type Region,
} from '../state/MapFilters';
import { useSettings } from '../state/SettingsContext';
import type { MainTabsParamList } from '../state/WizardState';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

const EMPTY: ReadonlyArray<SavedMeasurement> = [];

const stateLabel: Record<string, string> = {
  PENDING: 'En cola de aporte',
  SYNCED: 'Aportada',
  LOCAL_ONLY: 'En este teléfono',
  FAILED: 'Guardada localmente · aporte rechazado',
};

export function PersonalMapScreen({
  navigation,
  route,
}: BottomTabScreenProps<MainTabsParamList, 'MapaPersonal'>) {
  const focused = useIsFocused();
  const { status: settings, refresh } = useSettings();
  const { height, fontScale } = useWindowDimensions();
  const mapControlStyle = { flexGrow: 1, flexBasis: 90 * fontScale };
  const [layers, setLayers] = useState<ReadonlyArray<HistoryLayer> | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters | null>(null);
  const [result, setResult] = useState<{
    key: string;
    points: ReadonlyArray<SavedMeasurement>;
  } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [failure, setFailure] = useState(false);
  const [preview, setPreview] = useState<EvidenceSnapshot | null>(null);
  const [mapLayout, setMapLayout] = useState<MapLayout | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [mapConfig, setMapConfig] = useState<MapConfiguration | null>(null);
  const [showBaseMap, setShowBaseMap] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const cardRef = useRef<React.ComponentRef<typeof View>>(null);
  const sharing = useRef(false);
  const requested = useRef<string | null>(null);
  const params = route.params;

  useEffect(() => {
    let active = true;
    fieldwork()
      .getMapConfiguration()
      .then(config => {
        if (active) setMapConfig(config);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    setFailure(false);
    fieldwork()
      .listLayers()
      .then(rows => {
        if (!active) {
          return;
        }
        setLayers(rows);
        const isNew = params && params.savedId !== requested.current;
        if (isNew && params) {
          requested.current = params.savedId;
          setSelectedId(params.savedId);
          setSessionFilter(null);
          setRegion(null);
        }
        setFilters(previous => {
          if (
            isNew &&
            params &&
            rows.some(
              layer =>
                layer.floor === params.floor && layer.metric === params.metric,
            )
          ) {
            return { floor: params.floor, metric: params.metric };
          }
          if (
            previous &&
            rows.some(
              layer =>
                layer.floor === previous.floor &&
                layer.metric === previous.metric,
            )
          ) {
            return previous;
          }
          const first = rows.find(layer => isMetric(layer.metric));
          return first && isMetric(first.metric)
            ? { floor: first.floor, metric: first.metric }
            : null;
        });
      })
      .catch(() => {
        if (active) setFailure(true);
      });
    return () => {
      active = false;
    };
  }, [focused, params, reload, settings?.total]);

  const floor = filters?.floor;
  const metric = filters?.metric;
  const key =
    floor === undefined || !metric ? null : String(floor) + ':' + metric;

  useEffect(() => {
    if (!focused || floor === undefined || !metric || key === null) {
      return;
    }
    let active = true;
    fieldwork()
      .listMeasurements(floor, metric)
      .then(points => {
        if (active) {
          setResult({ key, points });
        }
      })
      .catch(() => {
        if (active) setFailure(true);
      });
    return () => {
      active = false;
    };
  }, [
    focused,
    floor,
    metric,
    key,
    reload,
    params?.savedId,
    settings?.total,
    settings?.pending,
    settings?.synced,
    settings?.failed,
  ]);

  const current = result?.key === key ? result : null;
  const allPoints = current?.points ?? EMPTY;
  const sessions = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; count: number }
    >();
    for (const point of allPoints) {
      const sessionKey = point.sessionId ?? dateKey(point.capturedAt);
      const existing = groups.get(sessionKey);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(sessionKey, {
          key: sessionKey,
          label: point.sessionName ?? formatDate(point.capturedAt),
          count: 1,
        });
      }
    }
    return Array.from(groups.values());
  }, [allPoints]);
  const activeSession =
    sessionFilter && sessions.some(session => session.key === sessionFilter)
      ? sessionFilter
      : null;
  const points = useMemo(
    () =>
      activeSession
        ? allPoints.filter(
            point =>
              (point.sessionId ?? dateKey(point.capturedAt)) === activeSession,
          )
        : allPoints,
    [allPoints, activeSession],
  );
  const naturalRegion = useMemo(() => fitRegion(points), [points]);
  const viewRegion = region ?? naturalRegion;
  const evidence = useMemo(
    () => mapLayout && createEvidenceSnapshot(points, viewRegion, mapLayout),
    [points, viewRegion, mapLayout],
  );
  const selected = points.find(point => point.id === selectedId);
  const floors = useMemo(
    () => Array.from(new Set(layers?.map(layer => layer.floor) ?? [])),
    [layers],
  );
  const floorLayers = layers?.filter(layer => layer.floor === floor) ?? [];
  const layerCount =
    floorLayers.find(layer => layer.metric === metric)?.count ?? 0;

  function change(next: Filters) {
    setSelectedId(null);
    setSessionFilter(null);
    setRegion(null);
    setFailure(false);
    setFilters(next);
  }

  async function createNewSession() {
    if (creatingSession) return;
    setCreatingSession(true);
    try {
      await fieldwork().startSession?.(null);
      await refresh();
      navigation.navigate('Medir');
    } catch {
      // Ignore if local storage is busy.
    } finally {
      setCreatingSession(false);
    }
  }

  async function sendEvidence() {
    if (sharing.current || !previewReady || !cardRef.current) {
      return;
    }
    sharing.current = true;
    setExporting(true);
    setExportError(false);
    try {
      await shareEvidence(cardRef.current);
      setPreview(null);
    } catch {
      setExportError(true);
    } finally {
      sharing.current = false;
      setExporting(false);
    }
  }

  const mapHeight = Math.max(240, Math.min(365, height * 0.38));

  return (
    <GuideScrollView
      style={g.screen}
      contentContainerStyle={g.content}
      nestedScrollEnabled
    >
      <Reveal style={s.layout}>
        <GuideTarget id="history">
          <ScreenTitle
            eyebrow="GUARDADO EN ESTE TELÉFONO"
            title="Mi historial"
            subtitle="Compara tus capturas por piso y tecnología, incluso sin conexión."
          />
        </GuideTarget>
        {failure ? (
          <View style={g.card}>
            <StatePanel
              icon="refresh"
              title="No pudimos abrir el historial"
              body="Vuelve a intentar la lectura local."
              action={{
                label: 'Reintentar',
                onPress: () => setReload(value => value + 1),
              }}
            />
          </View>
        ) : layers === null ? (
          <View style={g.card}>
            <StatePanel
              icon="map"
              title="Abriendo tus mediciones"
              body="Preparando los pisos y las redes de tu historial."
              busy
            />
          </View>
        ) : !filters || !metric ? (
          <View style={g.card}>
            <StatePanel
              icon="map"
              title="Tu primer mapa empieza aquí"
              body="Registra una señal y confirma el piso. Tu captura aparecerá en este historial."
              action={{
                label: 'Ir a Medir',
                onPress: () => navigation.navigate('Medir'),
              }}
            />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterRow}
              style={s.filters}
            >
              {floors.map(level => (
                <Chip
                  label={floorLabel(level)}
                  key={level}
                  selected={level === floor}
                  onPress={() => {
                    const layer =
                      layers.find(
                        item => item.floor === level && item.metric === metric,
                      ) ??
                      layers.find(
                        item => item.floor === level && isMetric(item.metric),
                      );
                    if (layer && isMetric(layer.metric)) {
                      change({ floor: level, metric: layer.metric });
                    }
                  }}
                />
              ))}
            </ScrollView>
            <View style={s.filterRow}>
              {floorLayers.map(
                layer =>
                  isMetric(layer.metric) && (
                    <Chip
                      key={layer.metric}
                      label={METRIC_LABELS[layer.metric]}
                      selected={metric === layer.metric}
                      onPress={() =>
                        change({
                          floor: layer.floor,
                          metric: layer.metric as Filters['metric'],
                        })
                      }
                    />
                  ),
              )}
            </View>
            {sessions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.filterRow}
                style={s.filters}
              >
                <Chip
                  label={'Todas (' + allPoints.length + ')'}
                  selected={activeSession === null}
                  onPress={() => {
                    setSelectedId(null);
                    setRegion(null);
                    setSessionFilter(null);
                  }}
                />
                {sessions.map(session => (
                  <Chip
                    key={session.key}
                    label={session.label + ' (' + session.count + ')'}
                    selected={activeSession === session.key}
                    onPress={() => {
                      setSelectedId(null);
                      setRegion(null);
                      setSessionFilter(session.key);
                    }}
                  />
                ))}
                <Chip
                  label={creatingSession ? 'Iniciando...' : '+ Nueva sesión'}
                  selected={false}
                  disabled={creatingSession}
                  onPress={createNewSession}
                />
              </ScrollView>
            )}
            <View style={[g.card, s.mapCard]}>
              <View style={s.mapHeading}>
                <Text style={g.sectionTitle}>Plano de señal</Text>
                <View style={s.filterRow}>
                  {mapConfig?.mapTiles && (
                    <Chip
                      label={showBaseMap ? 'Ver plano' : 'Ver mapa base'}
                      selected={showBaseMap}
                      onPress={() => setShowBaseMap(previous => !previous)}
                    />
                  )}
                  <StatusPill
                    label={
                      current
                        ? points.length +
                          (points.length === 1 ? ' medición' : ' mediciones')
                        : 'Cargando'
                    }
                  />
                </View>
              </View>
              {!current ? (
                <StatePanel
                  icon="layers"
                  title="Preparando capa"
                  body="Leyendo el piso seleccionado."
                  busy
                />
              ) : showBaseMap && mapConfig?.mapTiles ? (
                <View
                  style={[s.mapFrame, { height: mapHeight }]}
                  onLayout={event => setMapLayout(event.nativeEvent.layout)}
                >
                  <MapView
                    style={StyleSheet.absoluteFill}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={viewRegion}
                    region={viewRegion}
                    toolbarEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    onRegionChangeComplete={setRegion}
                    onPress={event => {
                      if (!mapLayout) return;
                      const pixel = project(
                        event.nativeEvent.coordinate,
                        viewRegion,
                        mapLayout.width,
                        mapLayout.height,
                      );
                      setSelectedId(
                        nearestPoint(points, pixel, viewRegion, mapLayout)
                          ?.id ?? null,
                      );
                    }}
                  >
                    {[...points].reverse().map(point => {
                      const color =
                        SIGNAL_COLORS[signalQuality(point.powerDbm, metric)];
                      const weight = signalWeight(point.powerDbm, metric);
                      const baseRadius = Math.max(5, point.accuracyM);
                      const active = point.id === selectedId;
                      const center = {
                        latitude: point.latitude,
                        longitude: point.longitude,
                      };
                      return (
                        <React.Fragment key={point.id}>
                          <Circle
                            center={center}
                            radius={baseRadius * 2.15}
                            fillColor={color + '1F'}
                            strokeColor="transparent"
                            strokeWidth={0}
                            zIndex={active ? 4 : 1}
                          />
                          <Circle
                            center={center}
                            radius={baseRadius * (1.15 + weight * 0.35)}
                            fillColor={color + '38'}
                            strokeColor="transparent"
                            strokeWidth={0}
                            zIndex={active ? 5 : 2}
                          />
                          <Circle
                            center={center}
                            radius={baseRadius * 0.55}
                            fillColor={color + '80'}
                            strokeColor={active ? COLORS.navy : color}
                            strokeWidth={active ? 2 : 1}
                            zIndex={active ? 6 : 3}
                          />
                          {(settings?.technicalMode ?? false) && (
                            <Marker
                              coordinate={center}
                              anchor={{ x: 0.5, y: 0.5 }}
                              tracksViewChanges={false}
                              zIndex={active ? 10 : 7}
                              onPress={() => setSelectedId(point.id)}
                            >
                              <View
                                style={[
                                  s.dbmBadge,
                                  { borderColor: active ? COLORS.navy : color },
                                  active && s.dbmBadgeActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    s.dbmText,
                                    active && s.dbmTextActive,
                                  ]}
                                >
                                  {point.powerDbm} dBm
                                </Text>
                              </View>
                            </Marker>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </MapView>
                </View>
              ) : (
                <GeoPlane
                  points={points}
                  region={viewRegion}
                  metric={metric}
                  height={mapHeight}
                  onChange={setRegion}
                  onSelect={setSelectedId}
                  onReady={setMapLayout}
                  selected={selected}
                />
              )}
              <SignalLegend />
              <View style={s.filterRow}>
                <Button
                  label="Ajustar"
                  kind="secondary"
                  onPress={() => setRegion(null)}
                  style={mapControlStyle}
                />
                <Button
                  label="Acercar"
                  kind="secondary"
                  onPress={() => setRegion(zoomRegion(viewRegion, 0.6))}
                  style={mapControlStyle}
                />
                <Button
                  label="Alejar"
                  kind="secondary"
                  onPress={() => setRegion(zoomRegion(viewRegion, 1.65))}
                  style={mapControlStyle}
                />
              </View>
              {current && layerCount > points.length && (
                <Text style={g.caption}>
                  Mostrando las {points.length} capturas más recientes de{' '}
                  {layerCount} en esta capa.
                </Text>
              )}
            </View>

            {selected && (
              <Reveal key={selected.id} style={g.card}>
                <View style={g.row}>
                  <View style={s.grow}>
                    <Text style={g.sectionTitle}>
                      {formatSignal(
                        selected.powerDbm,
                        metric,
                        settings?.technicalMode ?? false,
                      )}
                    </Text>
                    <Text style={g.caption}>
                      {networkLabel(selected.connection)} · ±
                      {selected.accuracyM.toFixed(1)} m
                    </Text>
                    <Text style={g.caption}>
                      {(selected.sessionName ?? 'Sesión 1') +
                        ' · ' +
                        formatDate(selected.capturedAt)}
                    </Text>
                  </View>
                  <Button
                    label="Cerrar"
                    kind="quiet"
                    onPress={() => setSelectedId(null)}
                  />
                </View>
                <StatusPill
                  label={stateLabel[selected.syncState] ?? 'Guardada'}
                />
              </Reveal>
            )}
            <Button
              label="Preparar evidencia PNG"
              icon="share"
              disabled={!evidence}
              onPress={() => {
                setExportError(false);
                setPreviewReady(false);
                setPreview(evidence);
              }}
            />
            {current && mapLayout && (
              <Text style={g.caption}>
                {evidence
                  ? 'La evidencia incluirá ' +
                    evidence.measurements.length +
                    (evidence.measurements.length === 1
                      ? ' captura visible en este plano.'
                      : ' capturas visibles en este plano.')
                  : 'Ajusta la vista para incluir capturas en la evidencia.'}
              </Text>
            )}
            {points.length > 0 && (
              <View style={g.card}>
                <Text style={g.sectionTitle}>Capturas recientes</Text>
                {points.slice(0, 4).map(point => (
                  <Chip
                    key={point.id}
                    label={
                      formatDate(point.capturedAt) +
                      ' · ' +
                      formatSignal(
                        point.powerDbm,
                        metric,
                        settings?.technicalMode ?? false,
                      )
                    }
                    selected={point.id === selectedId}
                    onPress={() => setSelectedId(point.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </Reveal>
      <Dialog
        title="Vista previa de evidencia"
        visible={preview !== null}
        dismissible={!exporting}
        onClose={() => {
          if (!sharing.current) setPreview(null);
        }}
      >
        {preview && (
          <EvidenceCard
            snapshot={preview}
            cardRef={cardRef}
            onReadyChange={setPreviewReady}
          />
        )}
        <View style={g.row}>
          <Icon name="info" size={17} />
          <Text style={[g.caption, s.grow]}>
            El PNG incluye las coordenadas de referencia que ves en la tarjeta.
          </Text>
        </View>
        {exportError && (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            No pudimos generar el PNG. Inténtalo de nuevo.
          </Text>
        )}
        <Button
          label={
            !previewReady
              ? 'Preparando vista'
              : exporting
              ? 'Generando PNG'
              : 'Compartir PNG'
          }
          icon="share"
          busy={exporting}
          disabled={!previewReady}
          onPress={sendEvidence}
        />
      </Dialog>
    </GuideScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  mapCard: { padding: 11, gap: 7 },
  mapFrame: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#EAF1FD',
  },
  mapHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filters: { flexGrow: 0 },
  grow: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 13 },
  dbmBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFFEB',
  },
  dbmBadgeActive: {
    backgroundColor: COLORS.navy,
  },
  dbmText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.navy,
  },
  dbmTextActive: {
    color: '#FFFFFF',
  },
});
