// src/screens/PersonalMapScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS } from '../theme/theme';
import { useSettings, formatSignal, getSignalColor } from '../state/SettingsContext';
import { HeatmapPoint, HeatmapPointData } from '../components/HeatmapLayer';

// Coordenadas simuladas sobre un recinto real (ej: Campus universitario o zona corporativa)
const MOCK_MEASUREMENTS: HeatmapPointData[] = [
  // PISO 1 (Pasillo de oficinas)
  { id: '1', lat: '-33.4561', lng: '-70.6541', floor: '1', dbm: -58, accuracyM: 4.8, timestamp: '16:02' },
  { id: '2', lat: '-33.4563', lng: '-70.6543', floor: '1', dbm: -61, accuracyM: 5.1, timestamp: '16:03' },
  { id: '3', lat: '-33.4565', lng: '-70.6540', floor: '1', dbm: -60, accuracyM: 4.5, timestamp: '16:03' },
  { id: '4', lat: '-33.4567', lng: '-70.6545', floor: '1', dbm: -64, accuracyM: 5.4, timestamp: '16:04' },
  // Transición a Amarillo (zona alejada del router)
  { id: '5', lat: '-33.4570', lng: '-70.6548', floor: '1', dbm: -72, accuracyM: 6.8, timestamp: '16:06' },
  { id: '6', lat: '-33.4573', lng: '-70.6551', floor: '1', dbm: -78, accuracyM: 7.0, timestamp: '16:08' },
  // Zona Roja (Punto ciego / extremo del edificio)
  { id: '7', lat: '-33.4578', lng: '-70.6556', floor: '1', dbm: -92, accuracyM: 8.9, timestamp: '16:10' },
  { id: '8', lat: '-33.4580', lng: '-70.6559', floor: '1', dbm: -95, accuracyM: 9.2, timestamp: '16:11' },

  // PISO 2
  { id: '9', lat: '-33.4562', lng: '-70.6542', floor: '2', dbm: -50, accuracyM: 4.2, timestamp: '15:40' },
  { id: '10', lat: '-33.4566', lng: '-70.6546', floor: '2', dbm: -62, accuracyM: 5.0, timestamp: '15:42' },

  // PISO -1 (Sótano)
  { id: '11', lat: '-33.4568', lng: '-70.6548', floor: '-1', dbm: -94, accuracyM: 9.5, timestamp: '15:21' },
];

export const PersonalMapScreen = ({ navigation }: any) => {
  const { technicalMode } = useSettings();
  const [pisoActivo, setPisoActivo] = useState('1');
  const [redActiva, setRedActiva] = useState<'wifi' | 'celular'>('wifi');
  const [selectedPoint, setSelectedPoint] = useState<HeatmapPointData | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const datosVisibles = MOCK_MEASUREMENTS.filter((m) => m.floor === pisoActivo);

  const handleExportConfirm = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportModalVisible(false);
    }, 900);
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        {/* CABECERA Y FILTRO */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Mi Historial</Text>
            <Text style={styles.screenSubtitle}>
              {datosVisibles.length} muestras en Piso {pisoActivo} · Geolocalizadas
            </Text>
          </View>
          <View style={styles.techFilterPill}>
            <TouchableOpacity
              style={[styles.techBtn, redActiva === 'wifi' && styles.techBtnActive]}
              onPress={() => setRedActiva('wifi')}
            >
              <Text style={[styles.techBtnText, redActiva === 'wifi' && styles.techBtnTextActive]}>
                Wi-Fi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.techBtn, redActiva === 'celular' && styles.techBtnActive]}
              onPress={() => setRedActiva('celular')}
            >
              <Text style={[styles.techBtnText, redActiva === 'celular' && styles.techBtnTextActive]}>
                Móvil
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SELECTOR DE PISOS */}
        <View style={styles.mapFloorSelector}>
          {['-1', '1', '2', '3'].map((piso) => (
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

        {/* CONTENEDOR DE MAPA GEOGRÁFICO REAL CON PAN Y ZOOM */}
        <View style={styles.mapCanvasPlaceholder}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.mapView}
            initialRegion={{
              latitude: -33.4568,
              longitude: -70.6548,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
          >
            {/* Renderizamos los puntos de calor sobre el mapa */}
            {datosVisibles.map((punto, idx) => (
              <HeatmapPoint
                key={punto.id}
                point={punto}
                index={idx}
                isTechnical={technicalMode}
                onSelect={(pt) => setSelectedPoint(pt)}
              />
            ))}
          </MapView>

          {/* TARJETA DE INSPECCIÓN AL TOCAR UN PUNTO */}
          {selectedPoint && (
            <View style={styles.pointInspectorCard}>
              <View style={[styles.legendDot, { backgroundColor: getSignalColor(selectedPoint.dbm) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inspectorTitle}>
                  Potencia: {formatSignal(selectedPoint.dbm, true)} ({formatSignal(selectedPoint.dbm, false)})
                </Text>
                <Text style={styles.inspectorMeta}>
                  Precisión GPS: ±{selectedPoint.accuracyM}m · {selectedPoint.timestamp}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPoint(null)}>
                <Text style={styles.closeInspectorText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* LEYENDA SEMÁNTICA FLOTANTE */}
          <View style={styles.legendBar}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.legendText}>Favorable</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.legendText}>Intermedia</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.legendText}>Débil</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setExportModalVisible(true)}
        >
          <Text style={styles.primaryButtonText}>Exportar evidencia a mi proveedor</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL DE EXPORTACIÓN */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>📸</Text>
            <Text style={styles.modalTitle}>Exportar Evidencia Técnica</Text>
            <Text style={styles.modalBody}>
              Se generará una tarjeta PNG con el mapa geográfico del Piso {pisoActivo} y el historial de dBm.
            </Text>
            <View style={styles.privacyWarningBox}>
              <Text style={styles.privacyWarningText}>
                ⚠️ Aviso: La imagen exportada contiene la ubicación geográfica visible del recinto.
              </Text>
            </View>
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleExportConfirm}
                disabled={isExporting}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
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
  },
  mapView: {
    width: '100%',
    height: '100%',
  },
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
  closeInspectorText: { fontSize: 14, fontWeight: 'bold', color: COLORS.textMuted, paddingHorizontal: 4 },
  legendBar: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 11, fontWeight: '600', color: COLORS.textDark },
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
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: { fontSize: 42, marginBottom: 8 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  modalBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  privacyWarningBox: {
    backgroundColor: '#FFF8E6',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5D67B',
    marginBottom: 18,
    width: '100%',
  },
  privacyWarningText: { fontSize: 12, color: '#8A6508', fontWeight: '600', textAlign: 'center' },
});