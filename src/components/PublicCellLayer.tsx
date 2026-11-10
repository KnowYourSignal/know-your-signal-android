import React, { memo } from 'react';
import { Circle } from 'react-native-maps';
import { signalQuality } from '../domain/Measurement';
import type { PublicCell } from '../services/PublicMapService';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';

const Cell = memo(function CellShape({
  cell,
  metric,
  selected,
}: {
  cell: PublicCell;
  metric: string;
  selected: boolean;
}) {
  const color = SIGNAL_COLORS[signalQuality(cell.powerDbm, metric)];
  return (
    <Circle
      center={{ latitude: cell.latitude, longitude: cell.longitude }}
      radius={cell.resolutionM / 2}
      fillColor={color + '66'}
      strokeColor={selected ? COLORS.navy : color}
      strokeWidth={selected ? 2 : 1}
      zIndex={selected ? 2 : 1}
    />
  );
});

export function PublicCellLayer({
  cells,
  metric,
  selectedId,
}: {
  cells: ReadonlyArray<PublicCell>;
  metric: string;
  selectedId: string | null;
}) {
  // Signal strength must keep its color when the density of nearby cells changes.
  return cells.map(cell => (
    <Cell
      key={cell.id}
      cell={cell}
      metric={metric}
      selected={cell.id === selectedId}
    />
  ));
}
