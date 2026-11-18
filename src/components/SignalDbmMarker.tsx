import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Coordinate } from '../state/MapFilters';
import { COLORS } from '../theme/theme';

/**
 * Renders a Google Maps marker pill displaying the dBm value.
 * Briefly enables `tracksViewChanges` on mount and selection/value changes so
 * Android snapshots the laid-out Text bitmap instead of an empty pill.
 */
export function SignalDbmMarker({
  coordinate,
  dbm,
  color,
  selected,
  onPress,
}: {
  coordinate: Coordinate;
  dbm: number;
  color: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 350);
    return () => clearTimeout(timer);
  }, [dbm, color, selected]);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      zIndex={selected ? 10 : 7}
      onPress={onPress}
    >
      <View
        collapsable={false}
        style={[
          s.badge,
          { borderColor: selected ? COLORS.navy : color },
          selected && s.badgeActive,
        ]}
      >
        <Text style={[s.badgeText, selected && s.badgeTextActive]}>
          {dbm} dBm
        </Text>
      </View>
    </Marker>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
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
