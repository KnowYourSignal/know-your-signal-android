import React from 'react';
import {
  ActivityIndicator,
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor,
          borderColor: kind === 'secondary' ? COLORS.border : 'transparent',
        },
        pressed && {
          opacity: 0.86,
          transform: [{ scale: reduced ? 1 : 0.985 }],
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
    </Pressable>
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
      <View style={s.stateIcon}>
        {busy ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Icon name={icon} size={25} />
        )}
      </View>
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
  children,
}: React.PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
}>) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'fade'}
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          s.scrim,
          {
            paddingTop: Math.max(20, insets.top),
            paddingBottom: Math.max(20, insets.bottom),
          },
        ]}
      >
        <View accessibilityViewIsModal style={s.dialog}>
          <View style={s.dialogHeader}>
            <Text
              accessibilityRole="header"
              style={[g.sectionTitle, s.dialogTitle]}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={onClose}
              hitSlop={6}
              style={s.close}
            >
              <Icon name="close" size={19} color={COLORS.textDark} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.dialogContent}
          >
            {children}
          </ScrollView>
        </View>
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
