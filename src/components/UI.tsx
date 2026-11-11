import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Icon, type IconName } from './Icon';
import { Reveal, useReducedMotion } from './Motion';
import { LoadingMark } from './LoadingMark';
import { MOTION, useAnimatedPresence } from './useAnimatedPresence';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Tone = 'blue' | 'green' | 'amber' | 'red';
const tones: Record<Tone, { text: string; fill: string }> = {
  blue: { text: COLORS.primary, fill: COLORS.assistantGlow },
  green: { text: COLORS.success, fill: COLORS.softSuccess },
  amber: { text: COLORS.warning, fill: COLORS.softWarning },
  red: { text: COLORS.danger, fill: COLORS.softDanger },
};

export function BrandHeader() {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[s.brand, { paddingTop: top + 12 }]}>
      <View style={s.brandMark}>
        <Icon name="signal" color={COLORS.textLight} size={23} />
      </View>
      <View style={s.brandText}>
        <Text style={s.brandTitle}>Know Your Signal</Text>
        <Text style={g.caption}>Cobertura interior</Text>
      </View>
      <View style={s.partner}>
        <Text style={s.partnerCaption}>DESAFÍO</Text>
        <Text style={s.partnerName}>GTD</Text>
      </View>
    </View>
  );
}

export function ScreenTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={s.title}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={g.heading}>
        {title}
      </Text>
      <Text style={g.body}>{subtitle}</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  kind = 'primary',
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  kind?: 'primary' | 'secondary' | 'danger' | 'quiet';
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const filled = kind === 'primary' || kind === 'danger';
  const blocked = disabled || busy;
  const pressed = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (blocked || reduced) pressed.setValue(0);
    return () => pressed.stopAnimation();
  }, [blocked, reduced, pressed]);
  function press(toValue: number) {
    if (reduced) return;
    Animated.timing(pressed, {
      toValue,
      duration: toValue ? 90 : 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }
  const borderColor = kind === 'secondary' ? COLORS.border : 'transparent';
  const backgroundColor = disabled
    ? COLORS.assistantGlow
    : kind === 'primary'
    ? COLORS.primary
    : kind === 'danger'
    ? COLORS.danger
    : kind === 'secondary'
    ? COLORS.cardBg
    : 'transparent';
  const foreground = disabled
    ? COLORS.textMuted
    : filled
    ? COLORS.textLight
    : COLORS.primary;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      onPressIn={() => press(1)}
      onPressOut={() => press(0)}
      style={[
        s.button,
        {
          backgroundColor,
          borderColor,
          opacity: pressed.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.86],
          }),
          transform: [
            {
              scale: pressed.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.985],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : icon ? (
        <Icon name={icon} color={foreground} size={19} />
      ) : null}
      <Text style={[s.buttonText, { color: foreground }]}>{label}</Text>
    </AnimatedPressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        selected && s.chipActive,
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.chipText, selected && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({
  label,
  tone = 'blue',
}: {
  label: string;
  tone?: Tone;
}) {
  const color = tones[tone];
  return (
    <View style={[s.pill, { backgroundColor: color.fill }]}>
      <View style={[s.pillDot, { backgroundColor: color.text }]} />
      <Text style={[s.pillText, { color: color.text }]}>{label}</Text>
    </View>
  );
}

export function StatePanel({
  icon,
  title,
  body,
  busy = false,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  busy?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Reveal style={s.statePanel}>
      {busy ? (
        <LoadingMark icon={icon} label={title} />
      ) : (
        <View style={s.stateIcon}>
          <Icon name={icon} size={25} />
        </View>
      )}
      <Text accessibilityLiveRegion="polite" style={[g.sectionTitle, s.center]}>
        {title}
      </Text>
      <Text style={[g.body, s.center]}>{body}</Text>
      {action && (
        <Button
          label={action.label}
          onPress={action.onPress}
          kind="secondary"
        />
      )}
    </Reveal>
  );
}

export function ChoiceTile({
  label,
  detail,
  icon,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  detail: string;
  icon: IconName;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label + '. ' + detail}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        g.card,
        s.choice,
        selected && s.choiceActive,
        disabled && s.choiceDisabled,
        pressed && s.pressed,
      ]}
    >
      <View style={s.choiceIcon}>
        <Icon name={icon} size={20} />
      </View>
      <View style={s.choiceText}>
        <Text style={g.sectionTitle}>{label}</Text>
        <Text style={g.caption}>{detail}</Text>
      </View>
      <View style={[s.radio, selected && s.radioActive]}>
        {selected && <Icon name="check" size={14} color={COLORS.textLight} />}
      </View>
    </Pressable>
  );
}

export function Dialog({
  visible,
  title,
  onClose,
  onAfterClose,
  dismissible = true,
  children,
}: React.PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  onAfterClose?: () => void;
  dismissible?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const heading = useRef<React.ComponentRef<typeof Text>>(null);
  const [shown, setShown] = useState(false);
  const { present, progress } = useAnimatedPresence(
    visible,
    onAfterClose,
    shown,
  );
  useEffect(() => {
    if (!present) setShown(false);
  }, [present]);
  useEffect(() => {
    if (!shown || !visible) return;
    const timer = setTimeout(
      () => {
        if (heading.current)
          AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
      },
      reduced ? 0 : MOTION.enter,
    );
    return () => clearTimeout(timer);
  }, [shown, visible, reduced]);
  // A parent's close can clear its selected item. Keep the last complete frame
  // throughout the exit instead of flashing an empty dialog.
  const retained = useRef({ title, children });
  useLayoutEffect(() => {
    if (visible) retained.current = { title, children };
    else if (!present) retained.current = { title: '', children: null };
  }, [visible, title, children, present]);
  const content = visible ? { title, children } : retained.current;
  const close = () => {
    if (visible && dismissible) onClose();
  };
  if (!present) return null;
  return (
    <Modal
      visible
      animationType="none"
      transparent
      hardwareAccelerated
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      onShow={() => setShown(true)}
    >
      <View style={s.modalRoot}>
        <Animated.View
          pointerEvents="none"
          style={[s.backdrop, { opacity: progress }]}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            s.scrim,
            s.clearScrim,
            {
              paddingTop: Math.max(20, insets.top),
              paddingBottom: Math.max(20, insets.bottom),
            },
          ]}
        >
          <Animated.View
            accessibilityViewIsModal
            importantForAccessibility="yes"
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
              s.dialog,
              {
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.975, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={s.dialogHeader}>
              <Text
                ref={heading}
                accessibilityRole="header"
                style={[g.sectionTitle, s.dialogTitle]}
              >
                {content.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                accessibilityState={{ disabled: !dismissible }}
                disabled={!dismissible}
                onPress={close}
                hitSlop={6}
                style={[s.close, !dismissible && s.closeDisabled]}
              >
                <Icon name="close" size={19} color={COLORS.textDark} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.dialogContent}
            >
              {content.children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function ProgressSteps({
  count,
  current,
}: {
  count: number;
  current: number;
}) {
  return (
    <View
      style={s.progress}
      accessibilityLabel={'Paso ' + (current + 1) + ' de ' + count}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[s.progressSegment, index <= current && s.progressDone]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  modalRoot: { flex: 1 },
  clearScrim: { backgroundColor: 'transparent' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.modalOverlay,
  },
  closeDisabled: { opacity: 0.35 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  brandTitle: { fontSize: 16, fontWeight: '800', color: COLORS.navy },
  partner: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingLeft: 14,
    alignItems: 'flex-end',
  },
  partnerCaption: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: COLORS.textMuted,
    fontWeight: '800',
  },
  partnerName: {
    fontSize: 17,
    color: COLORS.textDark,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: { gap: 5 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.primary,
    fontWeight: '800',
  },
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.assistantGlow,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  chipTextActive: { color: COLORS.primary, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  statePanel: {
    padding: 20,
    alignItems: 'center',
    gap: 9,
    justifyContent: 'center',
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: COLORS.assistantGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceActive: { borderColor: COLORS.primary, backgroundColor: '#F7FAFF' },
  choiceDisabled: { opacity: 0.58 },
  choiceText: { flex: 1, gap: 3 },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.assistantGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  scrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.modalOverlay,
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: COLORS.cardBg,
    overflow: 'hidden',
    elevation: 8,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 10,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  dialogTitle: { flex: 1 },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogContent: { padding: 16, gap: 12 },
  progress: { flexDirection: 'row', gap: 6 },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  progressDone: { backgroundColor: COLORS.primary },
});
