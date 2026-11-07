import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { signalQuality, signalWeight } from '../domain/Measurement';
import { project, type Coordinate, type Region } from '../state/MapFilters';
import { COLORS, SIGNAL_COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

export type HeatPoint = Coordinate & { id: string; powerDbm: number };

const legend = [
  { quality: 'good', label: 'Favorable' },
  { quality: 'fair', label: 'Intermedia' },
  { quality: 'weak', label: 'Débil' },
] as const;

export function SignalLegend() {
  return (
    <View style={styles.legend}>
      {legend.map(item => (
        <View key={item.quality} style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: SIGNAL_COLORS[item.quality] },
            ]}
          />
          <Text style={g.caption}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function disk(x: number, y: number, radius: number): string {
  return (
    'M' +
    (x - radius).toFixed(1) +
    ' ' +
    y.toFixed(1) +
    'a' +
    radius +
    ' ' +
    radius +
    ' 0 1 0 ' +
    2 * radius +
    ' 0' +
    'a' +
    radius +
    ' ' +
    radius +
    ' 0 1 0 ' +
    -2 * radius +
    ' 0Z'
  );
}

export const HeatmapLayer = memo(function HeatmapArtwork({
  points,
  region,
  metric,
  width,
  height,
  selected,
}: {
  points: ReadonlyArray<HeatPoint>;
  region: Region;
  metric: string;
  width: number;
  height: number;
  selected?: HeatPoint | null;
}) {
  const paths = useMemo(() => {
    const groups = {
      good: { glow: '', inner: '', dots: '' },
      fair: { glow: '', inner: '', dots: '' },
      weak: { glow: '', inner: '', dots: '' },
    };
    for (const point of points) {
      const { x, y } = project(point, region, width, height);
      if (x < -28 || x > width + 28 || y < -28 || y > height + 28) {
        continue;
      }
      const group = groups[signalQuality(point.powerDbm, metric)];
      const radius = Math.round(12 + signalWeight(point.powerDbm, metric) * 9);
      group.glow += disk(x, y, radius);
      group.inner += disk(x, y, Math.round(radius * 0.57));
      group.dots += disk(x, y, 4);
    }
    return groups;
  }, [points, region, metric, width, height]);

  const grid = useMemo(() => {
    let lines = '';
    for (let index = 1; index < 8; index += 1) {
      lines +=
        'M' +
        (width * index) / 8 +
        ' 0v' +
        height +
        'M0 ' +
        (height * index) / 8 +
        'h' +
        width;
    }
    return lines;
  }, [width, height]);
  const focus = selected ? project(selected, region, width, height) : null;

  return (
    <Svg width={width} height={height} accessible={false}>
      <Rect width={width} height={height} fill="#EAF1FD" />
      <Path d={grid} stroke="#CCDBF4" strokeWidth={1} />
      {legend.map(({ quality }) => {
        const group = paths[quality];
        const color = SIGNAL_COLORS[quality];
        return group.dots ? (
          <React.Fragment key={quality}>
            <Path d={group.glow} fill={color} opacity={0.13} />
            <Path d={group.inner} fill={color} opacity={0.25} />
            <Path d={group.dots} fill={color} stroke="#FFF" strokeWidth={0.9} />
          </React.Fragment>
        ) : null;
      })}
      {focus && (
        <Circle
          cx={focus.x}
          cy={focus.y}
          r={8}
          fill="none"
          stroke={COLORS.navy}
          strokeWidth={2}
        />
      )}
    </Svg>
  );
});

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
