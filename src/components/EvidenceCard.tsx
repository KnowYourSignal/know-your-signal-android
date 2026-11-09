import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  floorLabel,
  formatDate,
  metricLabel,
  networkLabel,
} from '../domain/Measurement';
import type { EvidenceSnapshot } from '../domain/Evidence';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { GeoPlane } from './GeoPlane';
import { SignalLegend } from './HeatmapLayer';
import { Icon } from './Icon';

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
  const markReady = useCallback(() => onReadyChange(true), [onReadyChange]);
  const mapHeight = mapWidth > 0 ? mapWidth * snapshot.aspectRatio : 210;
  const { measurements } = snapshot;
  const newest = measurements[0];
  const oldest = measurements[measurements.length - 1];
  const firstDay = formatDate(oldest.capturedAt);
  const lastDay = formatDate(newest.capturedAt);
  const dates = firstDay === lastDay ? firstDay : firstDay + ' — ' + lastDay;
  const connections = Array.from(
    new Set(measurements.map(point => networkLabel(point.connection))),
  ).join(' · ');
  return (
    <View ref={cardRef} collapsable={false} style={s.card}>
      <View style={g.row}>
        <View style={s.brand}>
          <Icon name="signal" size={22} color={COLORS.textLight} />
        </View>
        <View style={s.copy}>
          <Text style={s.brandTitle}>Know Your Signal</Text>
          <Text style={g.caption}>Evidencia de cobertura interior · GTD</Text>
        </View>
      </View>
      <View style={g.divider} />
      <Text style={s.title}>
        {floorLabel(newest.floor)} · {metricLabel(newest.metric)}
      </Text>
      <Text style={g.body}>{connections}</Text>
      <Text style={g.caption}>
        {dates} ·{' '}
        {measurements.length === 1
          ? '1 medición'
          : measurements.length + ' mediciones'}
      </Text>
      <View style={s.summary}>
        <Text style={s.power}>
          Mediana {snapshot.medianDbm.toLocaleString('es-CL')} dBm
        </Text>
        <Text style={g.caption}>
          Rango {snapshot.minDbm} a {snapshot.maxDbm} dBm
        </Text>
      </View>
      <View
        onLayout={event => {
          const next = event.nativeEvent.layout.width;
          if (next !== mapWidth) {
            onReadyChange(false);
            setMapWidth(next);
          }
        }}
        style={{ height: mapHeight }}
      >
        {mapWidth > 0 && (
          <GeoPlane
            points={measurements}
            region={snapshot.region}
            metric={newest.metric}
            height={mapHeight}
            onReady={markReady}
          />
        )}
      </View>
      <SignalLegend />
      <Text style={g.caption}>
        Capturas de la vista seleccionada. La ubicación de referencia es
        aproximada.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    padding: 13,
    gap: 7,
  },
  brand: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: { fontSize: 15, fontWeight: '800', color: COLORS.navy },
  copy: { flex: 1 },
  title: { fontSize: 20, color: COLORS.navy, fontWeight: '800' },
  summary: { gap: 2, paddingVertical: 4 },
  power: { fontSize: 15, color: COLORS.navy, fontWeight: '700' },
});
