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
  floorLabel,
  formatDate,
  formatSignal,
  isMetric,
  networkLabel,
} from '../domain/Measurement';
import { shareEvidence } from '../services/EvidenceService';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import type { HistoryLayer, SavedMeasurement } from '../specs/NativeFieldwork';
import {
  fitRegion,
  zoomRegion,
  type Filters,
  type Region,
} from '../state/MapFilters';
import { useSettings } from '../state/SettingsContext';
import type { MainTabsParamList } from '../state/WizardState';
import { COLORS } from '../theme/theme';
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
  const { status: settings } = useSettings();
  const { height } = useWindowDimensions();
  const [layers, setLayers] = useState<ReadonlyArray<HistoryLayer> | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters | null>(null);
  const [result, setResult] = useState<{
    key: string;
    points: ReadonlyArray<SavedMeasurement>;
  } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [failure, setFailure] = useState(false);
  const [preview, setPreview] =
    useState<ReadonlyArray<SavedMeasurement> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const cardRef = useRef<React.ComponentRef<typeof View>>(null);
  const sharing = useRef(false);
  const requested = useRef<string | null>(null);
  const params = route.params;

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
  }, [focused, params, reload]);

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
  }, [focused, floor, metric, key, reload, params?.savedId]);

  const current = result?.key === key ? result : null;
  const points = current?.points ?? EMPTY;
  const naturalRegion = useMemo(() => fitRegion(points), [points]);
  const viewRegion = region ?? naturalRegion;
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
    setRegion(null);
    setFailure(false);
    setFilters(next);
  }

  async function sendEvidence() {
    if (sharing.current || !cardRef.current) {
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
    <ScrollView
      style={g.screen}
      contentContainerStyle={g.content}
      nestedScrollEnabled
    >
      <Reveal style={s.layout}>
        <ScreenTitle
          eyebrow="GUARDADO EN ESTE TELÉFONO"
          title="Mi historial"
          subtitle="Compara tus capturas por piso y tecnología, incluso sin conexión."
        />
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
            <View style={[g.card, s.mapCard]}>
              <View style={s.mapHeading}>
                <Text style={g.sectionTitle}>Plano de señal</Text>
                <StatusPill
                  label={current ? points.length + ' mediciones' : 'Cargando'}
                />
              </View>
              {!current ? (
                <StatePanel
                  icon="layers"
                  title="Preparando capa"
                  body="Leyendo el piso seleccionado."
                  busy
                />
              ) : (
                <GeoPlane
                  points={points}
                  region={viewRegion}
                  metric={metric}
                  height={mapHeight}
                  onChange={setRegion}
                  onSelect={setSelectedId}
                  selected={selected}
                />
              )}
              <SignalLegend />
              <View style={s.filterRow}>
                <Button
                  label="Ajustar vista"
                  icon="locate"
                  kind="secondary"
                  onPress={() => setRegion(null)}
                  style={s.grow}
                />
                <Button
                  label="Acercar"
                  icon="plus"
                  kind="secondary"
                  onPress={() => setRegion(zoomRegion(viewRegion, 0.6))}
                  style={s.grow}
                />
                <Button
                  label="Alejar"
                  icon="minus"
                  kind="secondary"
                  onPress={() => setRegion(zoomRegion(viewRegion, 1.65))}
                  style={s.grow}
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
                      {formatDate(selected.capturedAt)}
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
              disabled={points.length === 0}
              onPress={() => {
                setExportError(false);
                setPreview(points);
              }}
            />
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
        onClose={() => {
          if (!sharing.current) setPreview(null);
        }}
      >
        {preview && <EvidenceCard measurements={preview} cardRef={cardRef} />}
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
          label={exporting ? 'Generando PNG' : 'Compartir PNG'}
          icon="share"
          busy={exporting}
          onPress={sendEvidence}
        />
      </Dialog>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  mapCard: { padding: 11, gap: 7 },
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
});
