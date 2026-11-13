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

export function SignalLegend({
  counts,
}: {
  counts?: Record<'good' | 'fair' | 'weak', number>;
}) {
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
          <Text
            style={g.caption}
            accessibilityLabel={
              counts
                ? item.label +
                  ': ' +
                  counts[item.quality] +
                  (counts[item.quality] === 1 ? ' celda' : ' celdas')
                : undefined
            }
          >
            {item.label}
            {counts ? ' · ' + counts[item.quality].toLocaleString('es-CL') : ''}
          </Text>
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
  const { paths, orderedDots } = useMemo(() => {
    const groups = {
      good: { glow: '', inner: '' },
      fair: { glow: '', inner: '' },
      weak: { glow: '', inner: '' },
    };
    const dots: Array<{ key: string; d: string; color: string }> = [];
    // Points arrive ordered newest-first (capturedAt DESC). Iterate oldest-first
    // so newer measurements in the same spot always render on top of older ones.
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index];
      const { x, y } = project(point, region, width, height);
      if (x < -28 || x > width + 28 || y < -28 || y > height + 28) {
        continue;
      }
      const quality = signalQuality(point.powerDbm, metric);
      const group = groups[quality];
      const radius = Math.round(12 + signalWeight(point.powerDbm, metric) * 9);
      group.glow += disk(x, y, radius);
      group.inner += disk(x, y, Math.round(radius * 0.57));
      dots.push({
        key: point.id,
        d: disk(x, y, 4),
        color: SIGNAL_COLORS[quality],
      });
    }
    return { paths: groups, orderedDots: dots };
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
      {(['weak', 'fair', 'good'] as const).map(quality => {
        const group = paths[quality];
        const color = SIGNAL_COLORS[quality];
        return group.glow ? (
          <React.Fragment key={quality}>
            <Path d={group.glow} fill={color} opacity={0.13} />
            <Path d={group.inner} fill={color} opacity={0.25} />
          </React.Fragment>
        ) : null;
      })}
      {orderedDots.map(dot => (
        <Path
          key={dot.key}
          d={dot.d}
          fill={dot.color}
          stroke="#FFF"
          strokeWidth={0.9}
        />
      ))}
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
