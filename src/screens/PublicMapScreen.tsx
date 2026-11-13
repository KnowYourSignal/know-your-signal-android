// src/screens/PublicMapScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { COLORS } from '../theme/theme';
import { useSettings } from '../state/SettingsContext';
import { HeatmapLayer, GeoHeatmapPoint, MetricCategory } from '../components/HeatmapLayer';
import {
  PublicMapCell,
  publicMapService,
  ViewportBounds,
} from '../services/PublicMapService';

const INITIAL_REGION: Region = {
  latitude: -33.4568,
  longitude: -70.6548,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

const DEBOUNCE_MS = 300;

function regionToBounds(region: Region): ViewportBounds {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}

function deltaToZoom(latitudeDelta: number): number {
  return Math.max(1, Math.min(20, Math.round(Math.log2(360 / Math.max(latitudeDelta, 0.0005)))));
}

export const PublicMapScreen = () => {
  const { technicalMode } = useSettings();
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [pisoActivo, setPisoActivo] = useState<number>(1);
  const [metricaActiva, setMetricaActiva] = useState<MetricCategory>('wifi_rssi');
  const [cells, setCells] = useState<PublicMapCell[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [cacheLabel, setCacheLabel] = useState<string>('Caché 5m lista');
  const [renderTimeMs, setRenderTimeMs] = useState<number | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountStartRef = useRef<number>(Date.now());

  const fetchCells = useCallback(
    async (
      targetRegion: Region,
      floor: number,
      metric: MetricCategory,
      forceFresh: boolean = false,
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (forceFresh) {
        publicMapService.clearCache();
      }

      setIsRefreshing(true);
      try {
        const result = await publicMapService.fetchAggregatedCells(
          {
            bounds: regionToBounds(targetRegion),
            floor,
            metric,
            zoomLevel: deltaToZoom(targetRegion.latitudeDelta),
          },
          controller.signal,
        );

        // Ficha 11 IDA: Aplicar respuesta solo si coincide con la petición vigente
        if (!publicMapService.isLatestRequest(result.requestId)) {
          return;
        }

        setCells(result.cells);
        setCacheLabel(
          result.fromCache
            ? `Caché (${result.cacheAgeSeconds}s)`
            : 'Actualizado ahora',
        );
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setCacheLabel('Sin conexión');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    },
    [],
  );

  // Debounce de 300 ms en cambios de viewport, piso o métrica
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchCells(region, pisoActivo, metricaActiva, false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [region, pisoActivo, metricaActiva, fetchCells]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const heatmapPoints = useMemo<GeoHeatmapPoint[]>(
    () =>
      cells.map((cell) => ({
        latitude: cell.centerLat,
        longitude: cell.centerLng,
        signalDbm: cell.medianSignalDbm,
        metric: cell.metric,
        floor: cell.floor,
      })),
    [cells],
  );

  const resolutionLabel = cells[0]?.resolutionMeters ?? 50;

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.screenTitle}>Mapa Comunitario</Text>
            <Text style={styles.screenSubtitle}>
              Celdas PostGIS (≥ 5 contribuyentes)
              {technicalMode && renderTimeMs !== null ? ` · ${renderTimeMs} ms` : ''}
            </Text>
          </View>
          <View style={styles.cacheBadge}>
            <View
              style={[
                styles.cacheDot,
                { backgroundColor: isRefreshing ? COLORS.warning : COLORS.success },
              ]}
            />
            <Text style={styles.cacheText}>{cacheLabel}</Text>
          </View>
        </View>

        {/* Selector de piso y métrica activa (sin mezclar Wi-Fi con Celular) */}
        <View style={styles.filtersContainer}>
          <View style={styles.mapFloorSelector}>
            {[-1, 1, 2, 3].map((piso) => (
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

          <View style={styles.techRow}>
            {(
              [
                { key: 'wifi_rssi', label: 'Wi-Fi RSSI' },
                { key: 'lte_rsrp', label: '4G LTE RSRP' },
                { key: 'nr_ss_rsrp', label: '5G NR' },
              ] as const
            ).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.techChip, metricaActiva === item.key && styles.techChipActive]}
                onPress={() => setMetricaActiva(item.key)}
              >
                <Text
                  style={[
                    styles.techChipText,
                    metricaActiva === item.key && styles.techChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.mapCanvasPlaceholder}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.mapView}
            initialRegion={INITIAL_REGION}
            onRegionChangeComplete={(newRegion) => setRegion(newRegion)}
            onMapReady={() => setRenderTimeMs(Date.now() - mountStartRef.current)}
          >
            <HeatmapLayer
              points={heatmapPoints}
              selectedFloor={pisoActivo}
              selectedMetric={metricaActiva}
              radius={40}
            />
          </MapView>

          <View style={styles.watermarkPill}>
            <Text style={styles.mapWatermark}>
              Vista Comunitaria · Resolución {resolutionLabel}m
            </Text>
          </View>

          {!isRefreshing && heatmapPoints.length === 0 && (
            <View style={styles.emptyMapState}>
              <Text style={styles.emptyMapEmoji}>🌐</Text>
              <Text style={styles.emptyMapTitle}>Sin celdas públicas en el Piso {pisoActivo}</Text>
              <Text style={styles.emptyMapSubtitle}>
                Las celdas con menos de 5 contribuyentes se ocultan por privacidad.
              </Text>
            </View>