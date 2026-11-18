import React, { memo } from 'react';
import { Circle } from 'react-native-maps';
import { signalQuality, signalWeight } from '../domain/Measurement';
import type { PublicCell } from '../services/PublicMapService';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';
import { SignalDbmMarker } from './SignalDbmMarker';

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
        <SignalDbmMarker
          coordinate={center}
          dbm={cell.powerDbm}
          color={color}
          selected={selected}
        />
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
