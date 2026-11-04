// src/screens/PublicMapScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';
import { useSettings } from '../state/SettingsContext';
import { HeatmapPoint, HeatmapPointData } from '../components/HeatmapLayer';

const MOCK_COMMUNITY: HeatmapPointData[] = [
  { id: 'c1', lat: '36%', lng: '36%', floor: '1', dbm: -63, contributors: 12 },
  { id: 'c2', lat: '42%', lng: '44%', floor: '1', dbm: -71, contributors: 8 },
  { id: 'c3', lat: '50%', lng: '52%', floor: '1', dbm: -75, contributors: 6 },
  { id: 'c4', lat: '60%', lng: '62%', floor: '1', dbm: -91, contributors: 9 },
  { id: 'c5', lat: '48%', lng: '42%', floor: '2', dbm: -65, contributors: 7 },
  { id: 'c6', lat: '52%', lng: '49%', floor: '2', dbm: -68, contributors: 5 },
];

export const PublicMapScreen = () => {
  const { technicalMode } = useSettings();
  const [pisoActivo, setPisoActivo] = useState('1');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheLabel, setCacheLabel] = useState('Hace 2 min');

  const fadeOverlay = useRef(new Animated.Value(1)).current;

  const datosVisibles = MOCK_COMMUNITY.filter((m) => m.floor === pisoActivo);

  const handleRefreshZone = () => {
    setIsRefreshing(true);
    Animated.sequence([
      Animated.timing(fadeOverlay, {
        toValue: 0.35,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fadeOverlay, {
        toValue: 1,
        duration: 350,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRefreshing(false);
      setCacheLabel('Actualizado ahora');
    });
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Mapa Comunitario</Text>
            <Text style={styles.screenSubtitle}>Celdas PostGIS agregadas (≥ 5 contribuyentes)</Text>
          </View>
          <View style={styles.cacheBadge}>
            <View style={styles.cacheDot} />
            <Text style={styles.cacheText}>{cacheLabel}</Text>
          </View>
        </View>

        <View style={styles.mapFloorSelector}>
          {['-1', '1', '2', '3'].map((piso) => (
            <TouchableOpacity
              key={piso}
              style={[styles.floorTab, pisoActivo === piso && styles.floorTabActive]}
              onPress={() => setPisoActivo(piso)}
            >
              <Text style={[styles.floorTabText, pisoActivo === piso && styles.floorTabTextActive]}>
                Piso {piso}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View style={[styles.mapCanvasPlaceholder, { opacity: fadeOverlay }]}>
          <View style={[styles.gridLineHorizontal, { top: '25%' }]} />
          <View style={[styles.gridLineHorizontal, { top: '50%' }]} />
          <View style={[styles.gridLineHorizontal, { top: '75%' }]} />
          <View style={[styles.gridLineVertical, { left: '25%' }]} />
          <View style={[styles.gridLineVertical, { left: '50%' }]} />
          <View style={[styles.gridLineVertical, { left: '75%' }]} />

          <Text style={styles.mapWatermark}>Vista Comunitaria · Resolución 50m</Text>

          {datosVisibles.length === 0 ? (
            <View style={styles.emptyMapState}>
              <Text style={styles.emptyMapEmoji}>🌐</Text>
              <Text style={styles.emptyMapTitle}>Sin celdas públicas en el Piso {pisoActivo}</Text>
              <Text style={styles.emptyMapSubtitle}>
                Las celdas con menos de 5 contribuyentes se ocultan por privacidad.
              </Text>
            </View>
          ) : (
            datosVisibles.map((punto, idx) => (
              <HeatmapPoint
                key={punto.id}
                point={punto}
                index={idx}
                isTechnical={technicalMode}
              />
            ))
          )}

          <View style={styles.privacyFooterBadge}>
            <Text style={styles.privacyFooterText}>🛡️ Mediana por celda · No identifica personas</Text>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleRefreshZone}
          disabled={isRefreshing}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {isRefreshing ? 'Consultando celdas espaciales...' : 'Actualizar zona visible'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  screenBody: { flex: 1, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark },
  screenSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  cacheBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  cacheDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.success },
  cacheText: { fontSize: 11, fontWeight: '600', color: COLORS.textDark },
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
    backgroundColor: '#E5ECF6',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gridLineHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(24, 51, 105, 0.06)' },
  gridLineVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(24, 51, 105, 0.06)' },
  mapWatermark: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    opacity: 0.7,
  },
  emptyMapState: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyMapEmoji: { fontSize: 32, marginBottom: 6 },
  emptyMapTitle: { color: COLORS.textDark, fontWeight: 'bold', fontSize: 15, marginBottom: 4 },
  emptyMapSubtitle: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },
  privacyFooterBadge: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  privacyFooterText: { fontSize: 11, fontWeight: '600', color: COLORS.textDark },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
});