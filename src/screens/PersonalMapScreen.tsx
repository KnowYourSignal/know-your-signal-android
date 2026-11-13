// src/screens/PersonalMapScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { COLORS } from '../theme/theme';
import { useSettings, formatSignal } from '../state/SettingsContext';
import {
  HeatmapLayer,
  GeoHeatmapPoint,
  MetricCategory,
  getMetricSemanticColor,
} from '../components/HeatmapLayer';
import { LocalRepositoryAdapter } from '../services/LocalRepositoryAdapter';
import { EvidenceCard } from '../components/EvidenceCard';
import { EvidenceService } from '../services/EvidenceService';

export interface PersonalMeasurementRecord {
  id: string;
  latitude: number;
  longitude: number;
  floor: number;
  dbm: number;
  metric: MetricCategory;
  networkCategory: 'wifi' | 'celular';
  accuracyM?: number;
  timestamp?: string;
}

const DEFAULT_REGION: Region = {
  latitude: -33.4568,
  longitude: -70.6548,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

function resolveMetricCategory(rawMetric?: string, rawNetwork?: string): MetricCategory {
  if (
    rawMetric === 'wifi_rssi' ||
    rawMetric === 'lte_rsrp' ||
    rawMetric === 'nr_ss_rsrp' ||
    rawMetric === 'celular_dbm'
  ) {
    return rawMetric;
  }
  return rawNetwork?.toUpperCase() === 'WIFI' ? 'wifi_rssi' : 'lte_rsrp';
}

export const PersonalMapScreen = ({ navigation }: any) => {
  const { technicalMode } = useSettings();
  const [pisoActivo, setPisoActivo] = useState<number>(1);
  const [redActiva, setRedActiva] = useState<'wifi' | 'celular'>('wifi');
  const [measurements, setMeasurements] = useState<PersonalMeasurementRecord[]>([]);
  const [loadingRoom, setLoadingRoom] = useState<boolean>(true);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const [renderTimeMs, setRenderTimeMs] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PersonalMeasurementRecord | null>(null);

  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false);
  const [mapSnapshotUri, setMapSnapshotUri] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const loadStartRef = useRef<number>(Date.now());
  const mapRef = useRef<MapView | null>(null);
  const evidenceCardRef = useRef<any>(null);

  const activeMetric: MetricCategory = redActiva === 'wifi' ? 'wifi_rssi' : 'lte_rsrp';
  const activeMetricLabel = redActiva === 'wifi' ? 'Wi-Fi RSSI (dBm)' : 'Celular RSRP (dBm)';

  const loadFromRoom = useCallback(async () => {
    loadStartRef.current = Date.now();
    setLoadingRoom(true);
    try {
      const rawRecords = await LocalRepositoryAdapter.getAllMeasurements();
      const mapped: PersonalMeasurementRecord[] = (rawRecords ?? [])
        .map((item: any, idx: number) => {
          const metric = resolveMetricCategory(item.metric, item.networkType);
          return {
            id: String(item.id ?? `room-${idx}`),
            latitude: Number(item.latitude ?? item.lat),
            longitude: Number(item.longitude ?? item.lng),
            floor: Number(item.floor ?? 1),
            dbm: Number(item.signalDbm ?? item.dbm),
            metric,
            networkCategory: metric === 'wifi_rssi' ? 'wifi' : 'celular',
            accuracyM: item.accuracyMeters ?? item.accuracyM,
            timestamp: item.timestamp
              ? typeof item.timestamp === 'number'
                ? new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : String(item.timestamp)
              : undefined,
          };
        })
        .filter(
          (r) =>
            Number.isFinite(r.latitude) &&
            Number.isFinite(r.longitude) &&
            Number.isFinite(r.dbm) &&
            Number.isFinite(r.floor),
        );

      setMeasurements(mapped);
    } catch {
      setMeasurements([]);
    } finally {
      setLoadingRoom(false);
    }
  }, []);

  useEffect(() => {
    loadFromRoom();
  }, [loadFromRoom]);

  const datosVisibles = useMemo(
    () =>
      measurements.filter(
        (m) => m.floor === pisoActivo && m.networkCategory === redActiva,
      ),
    [measurements, pisoActivo, redActiva],
  );

  const heatmapPoints = useMemo<GeoHeatmapPoint[]>(
    () =>
      datosVisibles.map((m) => ({
        latitude: m.latitude,
        longitude: m.longitude,
        signalDbm: m.dbm,
        metric: m.metric,
        floor: m.floor,
      })),
    [datosVisibles],
  );

  const evidenceSummary = useMemo(
    () => EvidenceService.buildSanitizedSummary(datosVisibles),
    [datosVisibles],
  );

  const initialRegion = useMemo<Region>(() => {
    if (datosVisibles.length === 0) return DEFAULT_REGION;
    return {
      latitude: datosVisibles[0].latitude,
      longitude: datosVisibles[0].longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    };
  }, [datosVisibles]);

  const handleMapReady = useCallback(() => {
    setIsMapReady(true);
    setRenderTimeMs(Date.now() - loadStartRef.current);
  }, []);

  const handleOpenExportModal = async () => {
    setExportError(null);
    setMapSnapshotUri(null);
    setExportModalVisible(true);
    try {
      const uri = await EvidenceService.captureMapSnapshot(mapRef, isMapReady);
      setMapSnapshotUri(uri);
    } catch (err: any) {
      setExportError(err?.message ?? 'No se pudo capturar el mapa.');
    }
  };

  const handleExportConfirm = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await EvidenceService.exportAndShareCard(evidenceCardRef, {
        floor: String(pisoActivo),
        metricLabel: activeMetricLabel,
        hasMapSnapshot: Boolean(mapSnapshotUri),
      });
      setExportModalVisible(false);
    } catch (err: any) {
      setExportError(err?.message ?? 'Error al generar el PNG.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        {/* CABECERA Y FILTRO */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Mi Historial</Text>
            <Text style={styles.screenSubtitle}>
              {datosVisibles.length} muestras · Piso {pisoActivo} · {activeMetricLabel}
              {technicalMode && renderTimeMs !== null ? ` · ${renderTimeMs} ms` : ''}
            </Text>
          </View>
          <View style={styles.techFilterPill}>
            <TouchableOpacity
              style={[styles.techBtn, redActiva === 'wifi' && styles.techBtnActive]}
              onPress={() => {
                setSelectedPoint(null);
                setRedActiva('wifi');
              }}
            >
              <Text style={[styles.techBtnText, redActiva === 'wifi' && styles.techBtnTextActive]}>
                Wi-Fi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.techBtn, redActiva === 'celular' && styles.techBtnActive]}
              onPress={() => {
                setSelectedPoint(null);
                setRedActiva('celular');
              }}
            >
              <Text
                style={[styles.techBtnText, redActiva === 'celular' && styles.techBtnTextActive]}
              >
                Móvil
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SELECTOR DE PISOS */}
        <View style={styles.mapFloorSelector}>
          {[-1, 1, 2, 3].map((piso) => (
            <TouchableOpacity
              key={piso}
              style={[styles.floorTab, pisoActivo === piso && styles.floorTabActive]}
              onPress={() => {
                setSelectedPoint(null);
                setPisoActivo(piso);
              }}
            >
              <Text style={[styles.floorTabText, pisoActivo === piso && styles.floorTabTextActive]}>
                Piso {piso}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTENEDOR DE MAPA GEOGRÁFICO */}
        <View style={styles.mapCanvasPlaceholder}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.mapView}
            initialRegion={initialRegion}
            showsUserLocation
            onMapReady={handleMapReady}
          >
            <HeatmapLayer
              points={heatmapPoints}
              selectedFloor={pisoActivo}
              selectedMetric={activeMetric}
              radius={36}
            />

            {datosVisibles.map((punto) => (
              <Marker
                key={punto.id}
                coordinate={{ latitude: punto.latitude, longitude: punto.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => setSelectedPoint(punto)}
              >
                <View
                  style={[
                    styles.samplePin,
                    { backgroundColor: getMetricSemanticColor(punto.dbm, punto.metric) },
                  ]}
                >
                  {technicalMode && <Text style={styles.samplePinText}>{punto.dbm}</Text>}
                </View>
              </Marker>
            ))}
          </MapView>

          {loadingRoom && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Cargando historial local...</Text>
            </View>
          )}

          {/* ESTADO VACÍO EXPLÍCITO SEGÚN FICHA 7 IDA */}
          {!loadingRoom && datosVisibles.length === 0 && (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>Sin mediciones en Piso {pisoActivo}</Text>
              <Text style={styles.emptyStateSubtitle}>
                Las zonas sin registros no se colorean. Toma una muestra para generar evidencia.
              </Text>
              {navigation?.navigate && (
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => navigation.navigate('Wizard')}
                >
                  <Text style={styles.emptyActionText}>Ir a medir señal</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* TARJETA DE INSPECCIÓN AL TOCAR UN PUNTO */}
          {selectedPoint && (
            <View style={styles.pointInspectorCard}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: getMetricSemanticColor(selectedPoint.dbm, selectedPoint.metric) },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.inspectorTitle}>
                  Potencia: {formatSignal(selectedPoint.dbm, true)} (
                  {formatSignal(selectedPoint.dbm, false)})
                </Text>
                <Text style={styles.inspectorMeta}>
                  {selectedPoint.accuracyM != null
                    ? `Precisión GPS: ±${selectedPoint.accuracyM}m`
                    : 'GPS verificado'}
                  {selectedPoint.timestamp ? ` · ${selectedPoint.timestamp}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPoint(null)}>
                <Text style={styles.closeInspectorText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* LEYENDA SEMÁNTICA CON MÉTRICA ACTIVA (SECCIÓN 4.6 IDA) */}
          <View style={styles.legendBar}>
            <Text style={styles.legendMetricTag}>{redActiva === 'wifi' ? 'RSSI:' : 'RSRP:'}</Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#278B58' }]} />
              <Text style={styles.legendText}>Favorable</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#D6A521' }]} />
              <Text style={styles.legendText}>Intermedia</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#CB4444' }]} />
              <Text style={styles.legendText}>Débil</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleOpenExportModal}>
          <Text style={styles.primaryButtonText}>Exportar evidencia a mi proveedor</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL DE EXPORTACIÓN CON EVIDENCECARD (COMPONENTE 8) */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <EvidenceCard
              cardRef={evidenceCardRef}
              mapSnapshotUri={mapSnapshotUri}
              floor={String(pisoActivo)}
              networkType={activeMetricLabel}
              dateRangeLabel={evidenceSummary.dateRangeLabel}
              sampleCount={evidenceSummary.sampleCount}
              avgDbm={evidenceSummary.avgDbm}
              minDbm={evidenceSummary.minDbm}
            />

            <View style={styles.privacyWarningBox}>
              <Text style={styles.privacyWarningText}>
                ⚠️ Aviso: La imagen exportada contiene la ubicación geográfica visible del recinto.
              </Text>
            </View>

            {exportError && <Text style={styles.exportErrorText}>{exportError}</Text>}

            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.primaryButton, !mapSnapshotUri && { opacity: 0.5 }]}
                onPress={handleExportConfirm}
                disabled={isExporting || !mapSnapshotUri}
              >
                {isExporting ? (
                  <ActivityIndicator color={COLORS.textLight} />
                ) : (
                  <Text style={styles.primaryButtonText}>Generar PNG y Compartir</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setExportModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  screenBody: { flex: 1, padding: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark },
  screenSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  techFilterPill: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  techBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  techBtnActive: { backgroundColor: COLORS.primary },
  techBtnText: { fontSize: 11, fontWeight: 'bold', color: COLORS.textMuted },
  techBtnTextActive: { color: COLORS.textLight },
  mapFloorSelector: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  floorTab: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  floorTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  floorTabText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  floorTabTextActive: { color: COLORS.textLight },
  mapCanvasPlaceholder: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapView: {
    width: '100%',
    height: '100%',
  },
  samplePin: {
    minWidth: 14,
    minHeight: 14,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  samplePinText: {
    color: COLORS.textLight,
    fontSize: 9,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: { fontSize: 11, fontWeight: '600', color: COLORS.textDark },
  emptyStateCard: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: '82%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyStateTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  emptyStateSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyActionBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyActionText: { color: COLORS.textLight, fontSize: 12, fontWeight: 'bold' },
  pointInspectorCard: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inspectorTitle: { fontSize: 12, fontWeight: 'bold', color: COLORS.textDark },
  inspectorMeta: { fontSize: 11, color: COLORS.textMuted },
  closeInspectorText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    paddingHorizontal: 4,
  },
  legendBar: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legendMetricTag: { fontSize: 10, fontWeight: 'bold', color: COLORS.primary },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '600', color: COLORS.textDark },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  privacyWarningBox: {
    backgroundColor: '#FFF8E6',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5D67B',
    width: '100%',
  },
  privacyWarningText: { fontSize: 11, color: '#8A6508', fontWeight: '600', textAlign: 'center' },
  exportErrorText: { fontSize: 12, color: '#CB4444', fontWeight: '600', textAlign: 'center' },
});

export default PersonalMapScreen;