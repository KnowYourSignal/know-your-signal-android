import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';
import { signalQuality, signalWeight } from '../domain/Measurement';
import type { PublicCell } from '../services/PublicMapService';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';

const Cell = memo(function CellShape({
  cell,
  metric,
  selected,
  technical,
}: {
  cell: PublicCell;
  metric: string;
  selected: boolean;
  technical: boolean;
}) {
  const color = SIGNAL_COLORS[signalQuality(cell.powerDbm, metric)];
  const weight = signalWeight(cell.powerDbm, metric);
  const baseRadius = cell.resolutionM / 2;
  const center = { latitude: cell.latitude, longitude: cell.longitude };
  return (
    <>
      <Circle
        center={center}
        radius={baseRadius * 1.65}
        fillColor={color + '1F'}
        strokeColor="transparent"
        strokeWidth={0}
        zIndex={selected ? 4 : 1}
      />
      <Circle
        center={center}
        radius={baseRadius * (0.95 + weight * 0.25)}
        fillColor={color + '38'}
        strokeColor="transparent"
        strokeWidth={0}
        zIndex={selected ? 5 : 2}
      />
      <Circle
        center={center}
        radius={baseRadius * 0.55}
        fillColor={color + '80'}
        strokeColor={selected ? COLORS.navy : color}
        strokeWidth={selected ? 2 : 1}
        zIndex={selected ? 6 : 3}
      />
      {technical && (
        <Marker
          coordinate={center}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={selected ? 10 : 7}
        >
          <View
            style={[
              s.badge,
              { borderColor: selected ? COLORS.navy : color },
              selected && s.badgeActive,
            ]}
          >
            <Text style={[s.badgeText, selected && s.badgeTextActive]}>
              {cell.powerDbm} dBm
            </Text>
          </View>
        </Marker>
      )}
    </>
  );
});

export function PublicCellLayer({
  cells,
  metric,
  selectedId,
  technical = false,
}: {
  cells: ReadonlyArray<PublicCell>;
  metric: string;
  selectedId: string | null;
  technical?: boolean;
}) {
  // Signal strength must keep its color when the density of nearby cells changes.
  return cells.map(cell => (
    <Cell
      key={cell.id}
      cell={cell}
      metric={metric}
      selected={cell.id === selectedId}
      technical={technical}
    />
  ));
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFFEB',
  },
  badgeActive: {
    backgroundColor: COLORS.navy,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.navy,
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
});
