import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppForeground } from '../services/useAppForeground';
import { COLORS } from '../theme/theme';

const ReducedMotion = createContext(true);

export function MotionProvider({ children }: React.PropsWithChildren) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (active) {
          setReduced(value);
        }
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return (
    <ReducedMotion.Provider value={reduced}>{children}</ReducedMotion.Provider>
  );
}

export function useReducedMotion() {
  return useContext(ReducedMotion);
}

export function RadarPulse({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const foreground = useAppForeground();
  const progress = useRef(new Animated.Value(0)).current;
  const enabled = active && foreground && !reduced;
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1_800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [enabled, progress]);
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        pulse.ring,
        {
          opacity: progress.interpolate({
            inputRange: [0, 0.18, 1],
            outputRange: [0, 0.3, 0],
          }),
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.5, 1.15],
              }),
            },
          ],
        },
      ]}
    />
  );
}

const pulse = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
});

export function Reveal({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [7, 0],
  });
  return (
    <Animated.View
      style={[style, { opacity: progress, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}
