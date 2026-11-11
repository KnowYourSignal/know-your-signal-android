import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { guideScrollOffset } from '../domain/GuideLayout';
import { measureGuideView, useGuide } from '../state/GuideContext';
import type { GuideTargetId } from '../state/GuideSteps';
import { useReducedMotion } from './Motion';

const RevealTarget = createContext<
  ((view: React.ComponentRef<typeof View> | null) => Promise<void>) | null
>(null);
export const nextGuideFrame = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** A measurable wrapper, never an automatic click on the underlying control. */
export function GuideTarget({
  id,
  children,
  style,
}: React.PropsWithChildren<{
  id: GuideTargetId;
  style?: StyleProp<ViewStyle>;
}>) {
  const view = useRef<React.ComponentRef<typeof View>>(null);
  const { register } = useGuide();
  const reveal = useContext(RevealTarget);
  useEffect(
    () =>
      register(id, {
        measure: () => measureGuideView(view.current),
        reveal: () => reveal?.(view.current) ?? Promise.resolve(),
      }),
    [id, register, reveal],
  );
  return (
    <View ref={view} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export function GuideScrollView({
  children,
  onScroll,
  onContentSizeChange,
  ...props
}: ScrollViewProps) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const position = useRef(0);
  const contentHeight = useRef(0);
  const { active } = useGuide();
  const guiding = useRef(active);
  guiding.current = active;
  const savedOffset = useRef<number | null>(null);
  useEffect(() => {
    if (active) savedOffset.current = position.current;
    else if (savedOffset.current !== null) {
      scroll.current?.scrollTo({ y: savedOffset.current, animated: false });
      savedOffset.current = null;
    }
  }, [active]);
  const reduced = useReducedMotion();
  const reveal = useCallback(
    async (target: React.ComponentRef<typeof View> | null) => {
      const [rect, viewport] = await Promise.all([
        measureGuideView(target),
        measureGuideView(scroll.current),
      ]);
      if (!rect || !viewport || !guiding.current) return;
      const y = guideScrollOffset(
        rect,
        viewport,
        position.current,
        contentHeight.current,
        270,
      );
      if (Math.abs(y - position.current) < 2) return;
      scroll.current?.scrollTo({ y, animated: !reduced });
      let stable = 0;
      let previous = position.current;
      for (let frame = 0; frame < 48; frame += 1) {
        await nextGuideFrame();
        if (!guiding.current) return;
        const current = position.current;
        stable = Math.abs(previous - current) < 0.5 ? stable + 1 : 0;
        previous = current;
        if (stable >= 4 && (frame > 12 || reduced)) break;
      }
    },
    [reduced],
  );
  return (
    <RevealTarget.Provider value={reveal}>
      <ScrollView
        {...props}
        ref={scroll}
        scrollEventThrottle={16}
        onScroll={event => {
          position.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onContentSizeChange={(width, height) => {
          contentHeight.current = height;
          onContentSizeChange?.(width, height);
        }}
      >
        {children}
      </ScrollView>
    </RevealTarget.Provider>
  );
}
