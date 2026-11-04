// src/components/HeatmapLayer.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getSignalColor } from '../state/SettingsContext';
import { COLORS } from '../theme/theme';

export interface HeatmapPointData {
  id: string;
  lat: string;
  lng: string;
  floor: string;
  dbm: number;
  accuracyM?: number;
  timestamp?: string;
  contributors?: number;
}

interface HeatmapPointProps {
  point: HeatmapPointData;
  isTechnical: boolean;
  index?: number;
  onSelect?: (point: HeatmapPointData) => void;
}

export const HeatmapPoint: React.FC<HeatmapPointProps> = ({
  point,
  isTechnical,
  index = 0,
  onSelect,
}) => {
  const isFocused = useIsFocused();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const color = getSignalColor(point.dbm);

  useEffect(() => {
    if (!isFocused) {
      // Cuando sales de la pestaña del mapa, dejamos los puntos en 0 listos para la próxima visita
      scaleAnim.setValue(0);
      pulseAnim.setValue(1);
      return;
    }

    // Al entrar a la pestaña o cambiar de piso, animamos la aparición en cascada
    scaleAnim.setValue(0);
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 55,
      friction: 7,
      delay: index * 35,
      useNativeDriver: true,
    }).start();

    // Efecto de respiración continua mientras el mapa está visible
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [isFocused, point.floor, index, scaleAnim, pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.heatmapPointContainer,
        {
          top: point.lat as any,
          left: point.lng as any,
          transform: [
            { translateX: -70 },
            { translateY: -70 },
            { scale: Animated.multiply(scaleAnim, pulseAnim) },
          ],
        },
      ]}
    >
      <View pointerEvents="none" style={[styles.heatLayer1, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer2, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer3, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer4, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer5, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer6, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.heatLayer7, { backgroundColor: color }]} />
      
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onSelect && onSelect(point)}
        style={[styles.heatLayer8, { backgroundColor: color }]}
      />

      {isTechnical && (
        <View pointerEvents="none" style={styles.dbmBadge}>
          <Text style={styles.heatDbmLabel}>{point.dbm}</Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  heatmapPointContainer: {
    position: 'absolute',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatLayer1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, opacity: 0.04 },
  heatLayer2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.06 },
  heatLayer3: { position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.08 },
  heatLayer4: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  heatLayer5: { position: 'absolute', width: 60, height: 60, borderRadius: 30, opacity: 0.18 },
  heatLayer6: { position: 'absolute', width: 40, height: 40, borderRadius: 20, opacity: 0.25 },
  heatLayer7: { position: 'absolute', width: 25, height: 25, borderRadius: 12.5, opacity: 0.4 },
  heatLayer8: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    opacity: 0.9,
    borderWidth: 2,
    borderColor: COLORS.cardBg,
  },
  dbmBadge: {
    position: 'absolute',
    top: 48,
    backgroundColor: 'rgba(24, 51, 105, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  heatDbmLabel: {
    color: COLORS.textLight,
    fontSize: 9,
    fontWeight: 'bold',
  },
});