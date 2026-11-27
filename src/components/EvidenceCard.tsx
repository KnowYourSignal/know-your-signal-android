import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  floorLabel,
  formatDate,
  metricLabel,
  networkLabel,
  signalQuality,
} from '../domain/Measurement';
import type { EvidenceSnapshot } from '../domain/Evidence';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { GeoPlane } from './GeoPlane';
import { SignalLegend } from './HeatmapLayer';
import { Icon } from './Icon';

const QUALITY_META = {
  good: {
    label: 'Cobertura favorable',
    short: 'Favorable',
    bg: '#E3F5EC',
    fg: '#0F6A43',
  },
  fair: {
    label: 'Cobertura intermedia',
    short: 'Intermedia',
    bg: '#FEF3D7',
    fg: '#9A5B06',
  },
  weak: {
    label: 'Cobertura débil',
    short: 'Débil',
    bg: '#FDE8EA',
    fg: '#A91F2E',
  },
} as const;

export function EvidenceCard({
  snapshot,
  cardRef,
  onReadyChange,
}: {
  snapshot: EvidenceSnapshot;
  cardRef: React.RefObject<React.ComponentRef<typeof View> | null>;
  onReadyChange: (ready: boolean) => void;
}) {
  const [mapWidth, setMapWidth] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const markReady = useCallback(() => onReadyChange(true), [onReadyChange]);
  const mapHeight =
    mapWidth > 0 ? Math.min(260, Math.max(170, mapWidth * snapshot.aspectRatio)) : 200;
  const { measurements, qualityCounts } = snapshot;
  const newest = measurements[0];
  const oldest = measurements[measurements.length - 1];
  const firstDay = formatDate(oldest.capturedAt);
  const lastDay = formatDate(newest.capturedAt);
  const dates = firstDay === lastDay ? firstDay : firstDay + ' — ' + lastDay;
  const connections = Array.from(
    new Set(measurements.map(point => networkLabel(point.connection))),
  ).join(' · ');
  const overallQuality = signalQuality(snapshot.medianDbm, newest.metric);
  const diagnosis = QUALITY_META[overallQuality];
  const total = Math.max(1, measurements.length);
  const showRealMap = Boolean(snapshot.mapImageUri) && !imageFailed;
  const recentRows = measurements.slice(0, 4);

  return (
    <View ref={cardRef} collapsable={false} style={s.card}>
      {/* Corporate Navy Executive Header */}
      <View style={s.header}>
        <View style={s.brand}>
          <Icon name="signal" size={20} color={COLORS.textLight} />
        </View>
        <View style={s.copy}>
          <Text style={s.brandTitle}>Know Your Signal</Text>
          <Text style={s.brandSub}>Reporte de cobertura interior</Text>
        </View>
        <View style={s.gtdBadge}>
          <Text style={s.gtdText}>GTD</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* Title + Semantic Diagnosis Pill */}
        <View style={s.titleRow}>
          <View style={s.copy}>
            <Text style={s.title}>
              {floorLabel(newest.floor)} · {metricLabel(newest.metric)}
            </Text>
            <Text style={s.metaLine}>
              {snapshot.sessionLabel} · {connections}
            </Text>
          </View>
          <View style={[s.diagPill, { backgroundColor: diagnosis.bg }]}>
            <View
              style={[
                s.diagDot,
                { backgroundColor: SIGNAL_COLORS[overallQuality] },
              ]}
            />
            <Text style={[s.diagText, { color: diagnosis.fg }]}>
              {diagnosis.label}
            </Text>
          </View>
        </View>

        <Text style={g.caption}>
          {dates} ·{' '}
          {measurements.length === 1
            ? '1 medición'
            : measurements.length + ' mediciones'}
          {' · '}±{snapshot.avgAccuracyM.toFixed(1)} m GPS medio
        </Text>

        {/* 3-Column KPI Strip */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>SEÑAL MEDIANA</Text>
            <Text style={s.kpiValue}>
              Mediana {snapshot.medianDbm.toLocaleString('es-CL')} dBm
            </Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>RANGO</Text>
            <Text style={s.kpiValueSmall}>
              {snapshot.minDbm} a {snapshot.maxDbm} dBm
            </Text>
          </View>
        </View>

        {/* Map Snapshot (Real Google Maps when available, or GeoPlane fallback) */}
        <View
          onLayout={event => {
            const next = event.nativeEvent.layout.width;
            if (next !== mapWidth) {
              if (!showRealMap) {
                onReadyChange(false);
              }
              setMapWidth(next);
            }
          }}
          style={[s.mapContainer, { height: mapHeight }]}
        >
          {showRealMap ? (
            <>
              <Image
                source={{ uri: snapshot.mapImageUri! }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onLoad={markReady}
                onError={() => {
                  setImageFailed(true);
                  onReadyChange(false);
                }}
              />
              <View pointerEvents="none" style={s.north}>
                <Text style={s.northText}>N ↑</Text>
              </View>
              <View pointerEvents="none" style={s.coordPill}>
                <Text style={s.coordText}>
                  {snapshot.region.latitude.toFixed(4)}°,{' '}
                  {snapshot.region.longitude.toFixed(4)}°
                </Text>
              </View>
            </>
          ) : (
            mapWidth > 0 && (
              <GeoPlane
                points={measurements}
                region={snapshot.region}
                metric={newest.metric}
                height={mapHeight}
                onReady={markReady}
              />
            )
          )}
        </View>

        {/* Proportional Quality Distribution Bar */}
        <View style={s.distBar}>
          {qualityCounts.good > 0 && (
            <View
              style={[
                s.distSeg,
                {
                  flex: qualityCounts.good / total,
                  backgroundColor: SIGNAL_COLORS.good,
                },
              ]}
            />
          )}
          {qualityCounts.fair > 0 && (
            <View
              style={[
                s.distSeg,
                {
                  flex: qualityCounts.fair / total,
                  backgroundColor: SIGNAL_COLORS.fair,
                },
              ]}
            />
          )}
          {qualityCounts.weak > 0 && (
            <View
              style={[
                s.distSeg,
                {
                  flex: qualityCounts.weak / total,
                  backgroundColor: SIGNAL_COLORS.weak,
                },
              ]}
            />
          )}
        </View>
        <SignalLegend counts={qualityCounts} />

        {/* Compact Measurement Summary Table */}
        <View style={s.tableBox}>
          <Text style={s.tableHeading}>Detalle de capturas recientes</Text>
          {recentRows.map(point => {
            const q = signalQuality(point.powerDbm, point.metric);
            const meta = QUALITY_META[q];
            return (
              <View key={point.id} style={s.tableRow}>
                <View
                  style={[s.rowDot, { backgroundColor: SIGNAL_COLORS[q] }]}
                />
                <Text style={s.rowDate} numberOfLines={1}>
                  {formatDate(point.capturedAt)}
                </Text>
                <Text style={[s.rowQual, { color: meta.fg }]}>
                  {meta.short}
                </Text>
                <Text style={s.rowDbm}>{point.powerDbm} dBm</Text>
                <Text style={s.rowAcc}>±{point.accuracyM.toFixed(1)} m</Text>
              </View>
            );
          })}
        </View>

        {measurements.some(point => point.classificationOrigin === 'manual') && (
          <Text style={g.caption}>
            Incluye clasificación Wi-Fi declarada manualmente.
          </Text>
        )}

        <Text style={s.footerNote}>
          Evidencia técnica generada por Know Your Signal · Suite Puente GTD.
          Ubicación de referencia aproximada.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: '#C9D9F2',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#132A54',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  brandSub: { fontSize: 11, color: '#BCD3FA', fontWeight: '500' },
  gtdBadge: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.4)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gtdText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.8 },
  body: { padding: 13, gap: 8 },
  copy: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: { fontSize: 18, color: COLORS.navy, fontWeight: '800' },
  metaLine: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  diagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  diagDot: { width: 7, height: 7, borderRadius: 4 },
  diagText: { fontSize: 11, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiBox: {
    flex: 1,
    backgroundColor: '#F4F7FC',
    borderWidth: 1,
    borderColor: '#DCE6F7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
  },
  kpiValueSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EAF1FD',
    borderWidth: 1,
    borderColor: '#DCE6F7',
  },
  north: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  northText: { fontSize: 10, fontWeight: '800', color: COLORS.navy },
  coordPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(19,42,84,0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  coordText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  distBar: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
  },
  distSeg: { height: '100%' },
  tableBox: {
    backgroundColor: '#F8FAFE',
    borderWidth: 1,
    borderColor: '#E2EBF8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  tableHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.navy,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowDot: { width: 7, height: 7, borderRadius: 4 },
  rowDate: { flex: 1, fontSize: 11, color: COLORS.textDark },
  rowQual: { fontSize: 11, fontWeight: '700' },
  rowDbm: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
  },
  rowAcc: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  footerNote: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
});
