import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useAppForeground } from '../services/useAppForeground';
import { useReducedMotion } from './Motion';

export const MOTION = {
  enter: 240,
  exit: 160,
  travel: 320,
  easing: Easing.out(Easing.cubic),
} as const;

/** Retain a surface until its exit finishes. Interrupted exits never dismiss a reopened surface. */
export function useAnimatedPresence(
  visible: boolean,
  onExited?: () => void,
  enterReady = true,
) {
  const reduced = useReducedMotion();
  const foreground = useAppForeground();
  const [present, setPresent] = useState(visible);
  const [entered, setEntered] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const shown = useRef(visible);
  const exited = useRef(onExited);
  exited.current = onExited;

  useEffect(() => {
    let cancelled = false;
    setEntered(false);
    if (visible) {
      shown.current = true;
      setPresent(true);
    }
    const finish = () => {
      if (cancelled) return;
      if (visible) {
        setEntered(true);
        return;
      }
      if (!shown.current) return;
      shown.current = false;
      setPresent(false);
      exited.current?.();
    };
    if (reduced || !foreground) {
      progress.setValue(visible ? 1 : 0);
      finish();
      return;
    }
    if (visible && !enterReady) {
      progress.setValue(0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? MOTION.enter : MOTION.exit,
      easing: MOTION.easing,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished) finish();
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [visible, reduced, foreground, progress, enterReady]);

  return { present, progress, interactive: visible && entered && foreground };
}
