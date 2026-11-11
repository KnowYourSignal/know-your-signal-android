import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { CapturePresentation } from '../domain/CapturePresentation';
import { useAppForeground } from '../services/useAppForeground';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Icon } from './Icon';
import { Reveal, useReducedMotion } from './Motion';
import { StatusPill } from './UI';

export function CaptureStatusCard({ state }: { state: CapturePresentation }) {
  const reduced = useReducedMotion();
  const foreground = useAppForeground();
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    rotation.setValue(0);
    if (!state.busy || reduced || !foreground) return;
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [state.busy, reduced, foreground, rotation]);
  const ready = state.phase === 'ready';
  const color =
    state.tone === 'green'
      ? COLORS.success
      : state.tone === 'amber'
      ? COLORS.warning
      : COLORS.primary;
  return (
    <View style={[s.card, ready && s.ready]}>
      <View style={s.top}>
        <StatusPill label={state.label} tone={state.tone} />
        <View style={s.radar} importantForAccessibility="no-hide-descendants">
          <View style={[s.ring, { borderColor: color }]} />
          {state.busy && (
            <Animated.View
              style={[
                s.orbit,
                {
                  borderTopColor: color,
                  transform: [
                    {
                      rotate: rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
          <Icon
            name={ready ? 'check' : state.tone === 'amber' ? 'info' : 'radar'}
            color={color}
            size={24}
          />
        </View>
      </View>
      <Reveal key={state.phase} style={s.copy}>
        <Text style={s.title}>{state.title}</Text>
        <Text accessibilityLiveRegion="polite" style={g.body}>
          {state.body}
        </Text>
      </Reveal>
      {state.phase !== 'idle' &&
        state.phase !== 'guide' &&
        state.phase !== 'permission' &&
        state.phase !== 'blocked' && (
          <View style={s.checks}>
            {[
              { label: 'Ubicación', done: state.locationReady },
              { label: 'Señal', done: state.signalReady },
            ].map(item => (
              <View
                key={item.label}
                style={s.check}
                accessible
                accessibilityLabel={
                  item.label + (item.done ? ': disponible' : ': en espera')
                }
              >
                <Icon
                  name={item.done ? 'check' : 'clock'}
                  size={14}
                  color={item.done ? COLORS.success : COLORS.textMuted}
                />
                <Text style={g.caption}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    gap: 10,
    padding: 17,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.assistantGlow,
  },
  ready: { backgroundColor: COLORS.softSuccess, borderColor: '#C4E5D2' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  radar: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1,
    opacity: 0.15,
  },
  orbit: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  copy: { gap: 6 },
  title: {
    color: COLORS.navy,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 3 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
