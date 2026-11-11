import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAppForeground } from '../services/useAppForeground';
import { COLORS } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { useReducedMotion } from './Motion';

/** An indeterminate activity cue; never a fabricated completion percentage. */
export function LoadingMark({
  icon = 'layers',
  label = 'Cargando',
}: {
  icon?: IconName;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const foreground = useAppForeground();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    if (reduced || !foreground) return;
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [reduced, foreground, progress]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={s.mark}
    >
      <View style={s.center}>
        <Icon name={icon} size={22} />
      </View>
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        style={[
          s.orbit,
          {
            transform: [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  mark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  center: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: COLORS.assistantGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderTopColor: COLORS.primary,
    borderRightColor: COLORS.primary,
  },
});
