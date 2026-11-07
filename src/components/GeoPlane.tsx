import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  horizontalScale,
  project,
  shiftRegion,
  type Region,
} from '../state/MapFilters';
import { COLORS } from '../theme/theme';
import { HeatmapLayer, type HeatPoint } from './HeatmapLayer';

export function GeoPlane({
  points,
  region,
  metric,
  height,
  selected,
  onChange,
  onSelect,
  onReady,
}: {
  points: ReadonlyArray<HeatPoint>;
  region: Region;
  metric: string;
  height: number;
  selected?: HeatPoint | null;
  onChange?: (region: Region) => void;
  onSelect?: (id: string) => void;
  onReady?: () => void;
}) {
  const [width, setWidth] = useState(0);
  const scale = horizontalScale(region, width);
  const drag = useRef(new Animated.ValueXY()).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !!onChange &&
          width > 0 &&
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_, { dx, dy }) => drag.setValue({ x: dx, y: dy }),
        onPanResponderRelease: (_, { dx, dy }) => {
          drag.setValue({ x: 0, y: 0 });
          onChange?.(
            shiftRegion(
              region,
              region.latitude + (dy / height) * region.latitudeDelta,
              region.longitude - (dx / width) * region.longitudeDelta,
            ),
          );
        },
        onPanResponderTerminate: () => drag.setValue({ x: 0, y: 0 }),
      }),
    [drag, onChange, region, width, height],
  );

  useEffect(() => {
    if (width > 0 && onReady) {
      const frame = requestAnimationFrame(onReady);
      return () => cancelAnimationFrame(frame);
    }
  }, [width, onReady]);

  function select(x: number, y: number) {
    let best = 22 ** 2;
    let match: HeatPoint | undefined;
    for (const point of points) {
      const pixel = project(point, region, width, height);
      const distance = (pixel.x - x) ** 2 + (pixel.y - y) ** 2;
      if (distance < best) {
        best = distance;
        match = point;
      }
    }
    if (match) {
      onSelect?.(match.id);
    }
  }

  return (
    <View
      style={[s.plane, { height }]}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {width > 0 && (
        <Pressable
          accessible={false}
          onPress={
            onSelect
              ? event =>
                  select(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                  )
              : undefined
          }
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            pointerEvents="none"
            style={{ transform: drag.getTranslateTransform() }}
          >
            <HeatmapLayer
              points={points}
              region={region}
              metric={metric}
              width={width}
              height={height}
              selected={selected}
            />
          </Animated.View>
        </Pressable>
      )}
      <View pointerEvents="none" style={s.north}>
        <Text style={s.northText}>N ↑</Text>
      </View>
      <View pointerEvents="none" style={s.reference}>
        <Text style={s.referenceText}>
          {region.latitude.toFixed(4)}°, {region.longitude.toFixed(4)}°
        </Text>
      </View>
      {scale && (
        <View pointerEvents="none" style={s.scale}>
          <Text style={s.referenceText}>≈ {scale.label}</Text>
          <View style={[s.scaleRule, { width: scale.length }]} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  plane: { overflow: 'hidden', backgroundColor: '#EAF1FD', borderRadius: 14 },
  north: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: COLORS.cardBg,
  },
  northText: { fontSize: 11, fontWeight: '800', color: COLORS.navy },
  reference: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    maxWidth: '62%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  referenceText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  scale: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    alignItems: 'center',
    gap: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  scaleRule: {
    height: 3,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.textDark,
  },
});
