import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  guideCardLayout,
  localGuideRect,
  type GuideRect,
} from '../domain/GuideLayout';
import { useAppForeground } from '../services/useAppForeground';
import { measureGuideView, useGuide } from '../state/GuideContext';
import { GUIDE_STEPS } from '../state/GuideSteps';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Icon } from './Icon';
import { LoadingMark } from './LoadingMark';
import { nextGuideFrame } from './GuideTarget';
import { useReducedMotion } from './Motion';
import { Button } from './UI';
import { MOTION, useAnimatedPresence } from './useAnimatedPresence';

const GUIDE_DIM = 'rgba(15, 30, 55, 0.76)';

function SpotlightCorner({
  style,
}: {
  style: React.ComponentProps<typeof Animated.View>['style'];
}) {
  return (
    <Animated.View style={[s.corner, style]}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path d="M0 0H12A12 12 0 0 0 0 12Z" fill={GUIDE_DIM} />
      </Svg>
    </Animated.View>
  );
}

export function GuideSurface({ children }: React.PropsWithChildren) {
  const root = useRef<React.ComponentRef<typeof View>>(null);
  const { active } = useGuide();
  return (
    <View ref={root} collapsable={false} style={s.root}>
      <View
        style={s.root}
        accessibilityElementsHidden={active}
        importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      <GuideOverlay root={root} />
    </View>
  );
}

function GuideOverlay({
  root,
}: {
  root: React.RefObject<React.ComponentRef<typeof View> | null>;
}) {
  const { run, anchor, move, finish } = useGuide();
  const reduced = useReducedMotion();
  const foreground = useAppForeground();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { present, progress } = useAnimatedPresence(!!run);
  const retained = useRef(run);
  useLayoutEffect(() => {
    if (run) retained.current = run;
  }, [run]);
  const displayed = run ?? retained.current;
  const step = displayed ? GUIDE_STEPS[displayed.scope][displayed.index] : null;
  const [rect, setRect] = useState<GuideRect | null>(null);
  const [cardHeight, setCardHeight] = useState(260);
  const [working, setWorking] = useState(true);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [cardReady, setCardReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [moving, setMoving] = useState(false);
  const cardProgress = useRef(new Animated.Value(0)).current;
  const copyProgress = useRef(new Animated.Value(0)).current;
  const travelProgress = useRef(new Animated.Value(1)).current;
  const title = useRef<React.ComponentRef<typeof Text>>(null);
  const contentScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const position = useRef(new Animated.ValueXY({ x: 16, y: 120 })).current;
  const spotlight = useRef({
    x: new Animated.Value(16),
    y: new Animated.Value(120),
    width: new Animated.Value(0),
    height: new Animated.Value(0),
  }).current;
  const hadTarget = useRef(false);
  const previousSize = useRef({ width, height, fontScale });
  const layout = guideCardLayout(
    rect,
    { x: 0, y: 0, width, height, top: insets.top, bottom: insets.bottom },
    cardHeight,
  );

  useLayoutEffect(() => {
    if (run) {
      copyProgress.setValue(reduced ? 1 : 0);
      setRevealed(false);
    }
  }, [run, reduced, copyProgress]);

  useEffect(() => {
    if (!present) {
      setCardReady(false);
      setRevealed(false);
      setRect(null);
      setWorking(true);
      cardProgress.setValue(0);
      return;
    }
    if (working || !cardReady) return;
    if (reduced || !foreground) {
      cardProgress.setValue(1);
      copyProgress.setValue(1);
      setRevealed(true);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(cardProgress, {
        toValue: 1,
        duration: MOTION.enter,
        easing: MOTION.easing,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(copyProgress, {
        toValue: 1,
        duration: 180,
        easing: MOTION.easing,
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    let cancelled = false;
    animation.start(({ finished }) => {
      if (finished && !cancelled) setRevealed(true);
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [
    present,
    cardReady,
    working,
    reduced,
    foreground,
    cardProgress,
    copyProgress,
  ]);

  useEffect(() => {
    if (!run) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        finish();
        return true;
      },
    );
    return () => subscription.remove();
  }, [run, finish]);

  useEffect(() => {
    if (!run || !foreground) return;
    let cancelled = false;
    setWorking(true);
    setMissing(false);
    const targetId = GUIDE_STEPS[run.scope][run.index].target;
    async function locate() {
      // A tab may mount lazily. Wait for its anchor and native navigation to settle.
      const deadline = Date.now() + 4000;
      for (
        let attempt = 0;
        attempt < 120 && !cancelled && Date.now() < deadline;
        attempt += 1
      ) {
        await nextGuideFrame();
        const target = anchor(targetId);
        if (!target || attempt < 10) continue;
        let targetRect: GuideRect | null;
        let rootRect: GuideRect | null;
        try {
          await target.reveal();
          if (cancelled) return;
          [targetRect, rootRect] = await Promise.all([
            target.measure(),
            measureGuideView(root.current),
          ]);
        } catch {
          // Retry a native view retired by the transition; the timeout offers a safe fallback.
          continue;
        }
        if (cancelled) return;
        const next =
          targetRect && rootRect ? localGuideRect(targetRect, rootRect) : null;
        if (!next) continue;
        setRect(next);
        setCardReady(true);
        setWorking(false);
        contentScroll.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      if (!cancelled) {
        setRect(null);
        setMissing(true);
        setCardReady(true);
        setWorking(false);
      }
    }
    locate();
    return () => {
      cancelled = true;
    };
  }, [run, foreground, width, height, fontScale, retry, anchor, root]);

  useEffect(() => {
    if (!present) {
      hadTarget.current = false;
      setMoving(false);
      return;
    }
    // The balloon travels on the UI thread. Geometry-only dimmer panels use
    // separate JS values so a busy map render cannot hold up the text surface.
    const values: [Animated.Value, number, boolean][] = [
      [position.x, layout.x, true],
      [position.y, layout.y, true],
      [spotlight.x, rect?.x ?? 0, false],
      [spotlight.y, rect?.y ?? 0, false],
      [spotlight.width, rect?.width ?? 0, false],
      [spotlight.height, rect?.height ?? 0, false],
    ];
    const resized =
      previousSize.current.width !== width ||
      previousSize.current.height !== height ||
      previousSize.current.fontScale !== fontScale;
    previousSize.current = { width, height, fontScale };
    if (reduced || !hadTarget.current || !foreground || resized) {
      values.forEach(([value, next]) => value.setValue(next));
      hadTarget.current = !!rect;
      travelProgress.setValue(1);
      setMoving(false);
      return;
    }
    travelProgress.setValue(0);
    setMoving(true);
    const animation = Animated.parallel([
      Animated.timing(travelProgress, {
        toValue: 1,
        duration: MOTION.travel,
        easing: MOTION.easing,
        useNativeDriver: true,
        isInteraction: false,
      }),
      ...values.map(([value, next, native]) =>
        Animated.timing(value, {
          toValue: next,
          duration: MOTION.travel,
          easing: MOTION.easing,
          useNativeDriver: native,
          isInteraction: false,
        }),
      ),
    ]);
    let cancelled = false;
    animation.start(({ finished }) => {
      if (finished && !cancelled) setMoving(false);
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [
    present,
    reduced,
    foreground,
    rect,
    layout.x,
    layout.y,
    position,
    spotlight,
    travelProgress,
    width,
    height,
    fontScale,
  ]);

  useEffect(() => {
    if (!run || working || moving || !revealed) return;
    const frame = requestAnimationFrame(() => {
      if (title.current)
        AccessibilityInfo.sendAccessibilityEvent(title.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [run, working, moving, revealed]);

  if (!present || !displayed || !step) return null;
  const count = GUIDE_STEPS[displayed.scope].length;
  const right = Animated.add(spotlight.x, spotlight.width);
  const bottom = Animated.add(spotlight.y, spotlight.height);
  const controlsReady = !working && !moving && revealed;
  return (
    <Animated.View
      style={[s.overlay, { opacity: progress }]}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      pointerEvents={run ? 'auto' : 'none'}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={() => {}}
      />
      {rect ? (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={[s.dim, s.dimTop, { height: spotlight.y }]} />
          <Animated.View
            style={[
              s.dim,
              s.dimLeft,
              {
                top: spotlight.y,
                width: spotlight.x,
                height: spotlight.height,
              },
            ]}
          />
          <Animated.View
            style={[
              s.dim,
              s.dimRight,
              {
                top: spotlight.y,
                left: right,
                height: spotlight.height,
              },
            ]}
          />
          <Animated.View style={[s.dim, s.dimBottom, { top: bottom }]} />
          <SpotlightCorner style={{ left: spotlight.x, top: spotlight.y }} />
          <SpotlightCorner
            style={[
              s.cornerRight,
              { left: Animated.subtract(right, 12), top: spotlight.y },
            ]}
          />
          <SpotlightCorner
            style={[
              s.cornerBottom,
              {
                left: Animated.subtract(right, 12),
                top: Animated.subtract(bottom, 12),
              },
            ]}
          />
          <SpotlightCorner
            style={[
              s.cornerLeft,
              { left: spotlight.x, top: Animated.subtract(bottom, 12) },
            ]}
          />
          <Animated.View
            style={[
              s.outline,
              {
                top: spotlight.y,
                left: spotlight.x,
                width: spotlight.width,
                height: spotlight.height,
              },
            ]}
          />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, s.dim]} pointerEvents="none" />
      )}
      {!cardReady && (
        <View style={s.preparing}>
          <LoadingMark icon="info" label="Preparando guía" />
          <Text style={s.preparingText}>Preparando tu recorrido</Text>
          <Button label="Omitir guía" kind="secondary" onPress={finish} />
        </View>
      )}
      <Animated.View
        onLayout={event => {
          const next = event.nativeEvent.layout.height;
          if (Math.abs(cardHeight - next) > 1) setCardHeight(next);
        }}
        style={[
          s.cardPosition,
          {
            width: layout.width,
            maxHeight: layout.maxHeight,
            transform: [{ translateX: position.x }, { translateY: position.y }],
          },
        ]}
      >
        <Animated.View
          accessibilityElementsHidden={!cardReady}
          importantForAccessibility={cardReady ? 'yes' : 'no-hide-descendants'}
          style={[
            s.card,
            {
              maxHeight: layout.maxHeight,
              opacity: cardProgress,
              transform: [
                {
                  scale: Animated.multiply(progress, cardProgress).interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.975, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {layout.pointer && !working && (
            <Animated.View
              pointerEvents="none"
              style={[
                s.arrow,
                {
                  left: layout.arrowX - 7,
                  opacity: travelProgress.interpolate({
                    inputRange: [0, 0.75, 1],
                    outputRange: [0, 0, 1],
                  }),
                },
                layout.side === 'below' ? s.arrowTop : s.arrowBottom,
              ]}
            />
          )}
          <View style={s.header}>
            <View style={s.guideIcon}>
              <Icon name="info" size={19} />
            </View>
            <Text style={s.eyebrow}>
              GUÍA · {displayed.index + 1} DE {count}
            </Text>
            <Button
              label="Omitir"
              kind="quiet"
              onPress={finish}
              style={s.skip}
            />
          </View>
          <Animated.ScrollView
            ref={contentScroll}
            style={[s.copyScroll, { opacity: copyProgress }]}
            contentContainerStyle={s.copy}
          >
            <Text ref={title} accessibilityRole="header" style={s.title}>
              {step.title}
            </Text>
            <Text style={g.body}>{step.body}</Text>
            {missing && (
              <>
                <Text style={g.caption}>
                  No pudimos señalar este control. Puedes reintentar o seguir el
                  recorrido.
                </Text>
                <Button
                  label="Volver a señalar"
                  kind="secondary"
                  onPress={() => setRetry(value => value + 1)}
                />
              </>
            )}
          </Animated.ScrollView>
          <View style={s.footer}>
            {displayed.index > 0 && (
              <Button
                label="Anterior"
                kind="secondary"
                disabled={!controlsReady}
                onPress={() => move(-1)}
                style={s.footerButton}
              />
            )}
            <Button
              label={
                displayed.index === count - 1 ? 'Finalizar guía' : 'Siguiente'
              }
              busy={!controlsReady}
              onPress={() => move(1)}
              style={s.footerButton}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 30 },
  dimTop: { top: 0, left: 0, right: 0 },
  dimLeft: { left: 0 },
  dimRight: { right: 0 },
  dimBottom: { left: 0, right: 0, bottom: 0 },
  dim: { position: 'absolute', backgroundColor: GUIDE_DIM },
  corner: { position: 'absolute', width: 12, height: 12 },
  cornerRight: { transform: [{ rotate: '90deg' }] },
  cornerBottom: { transform: [{ rotate: '180deg' }] },
  cornerLeft: { transform: [{ rotate: '270deg' }] },
  outline: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#A5C2FF',
    borderRadius: 12,
  },
  cardPosition: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  preparing: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  preparingText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#B8CBF5',
    padding: 17,
    gap: 12,
    elevation:
      Platform.OS === 'android' && Number(Platform.Version) < 28 ? 8 : 0,
    boxShadow: '0 8px 24px rgba(10, 27, 57, 0.16)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  guideIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: COLORS.assistantGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
    color: COLORS.primary,
  },
  skip: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 4 },
  copyScroll: { flexGrow: 0, flexShrink: 1 },
  copy: { gap: 8, paddingBottom: 2 },
  title: {
    fontSize: 20,
    lineHeight: 25,
    color: COLORS.navy,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerButton: { flexGrow: 1, flexBasis: 110, paddingHorizontal: 10 },
  arrow: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: COLORS.cardBg,
    transform: [{ rotate: '45deg' }],
    borderColor: '#B8CBF5',
  },
  arrowTop: { top: -8, borderTopWidth: 1, borderLeftWidth: 1 },
  arrowBottom: { bottom: -8, borderBottomWidth: 1, borderRightWidth: 1 },
});
