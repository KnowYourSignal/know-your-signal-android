import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useIsFocused,
  type CompositeScreenProps,
} from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GuideScrollView, GuideTarget } from '../components/GuideTarget';
import { useAutoGuide, useGuide } from '../state/GuideContext';
import { AccuracyIndicator } from '../components/AccuracyIndicator';
import { CaptureButton } from '../components/CaptureButton';
import { Icon } from '../components/Icon';
import { NetworkBadge } from '../components/NetworkBadge';
import { Reveal, useReducedMotion } from '../components/Motion';
import {
  Button,
  Chip,
  Dialog,
  ProgressSteps,
  ScreenTitle,
  StatusPill,
} from '../components/UI';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import { useCaptureSession } from '../services/useCaptureSession';
import { useSettings } from '../state/SettingsContext';
import type { MainTabsParamList, RootParamList } from '../state/WizardState';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Medir'>,
  NativeStackScreenProps<RootParamList, 'MainTabs'>
>;

const BAR_HEIGHTS = [16, 26, 20, 34, 24, 38, 28, 32];

function StationaryAveragingGraphic({
  active,
  step,
}: {
  active: boolean;
  step: number;
}) {
  const reduced = useReducedMotion();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      wave.setValue(0);
      return;
    }
    let loop: Animated.CompositeAnimation | undefined;
    if (!reduced) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(wave, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(wave, {
            toValue: 0,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    }
    return () => {
      loop?.stop();
    };
  }, [active, reduced, wave]);

  return (
    <View style={s.averagingBox}>
      <View style={s.averagingHeader}>
        <StatusPill label={'Muestra ' + step + ' de 8'} tone="blue" />
        <Text style={g.caption}>Promediando dBm y GPS</Text>
      </View>
      <View style={s.barsRow}>
        {BAR_HEIGHTS.map((height, index) => {
          const captured = index < step;
          const current = index === step - 1;
          return (
            <Animated.View
              key={index}
              style={[
                s.bar,
                { height },
                captured ? s.barCaptured : s.barPending,
                current && {
                  transform: [
                    {
                      scaleY: wave.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.22],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export function WizardScreen({ navigation }: Props) {
  const { status: settings, refresh } = useSettings();
  const focused = useIsFocused();
  const guide = useGuide();
  const session = useCaptureSession(focused && !guide.active);
  const [startingSession, setStartingSession] = useState(false);
  useAutoGuide(
    'overview',
    focused && !session.enabled && session.status !== 'permission',
  );
  const needsSettings =
    session.problem === 'PERMISSION_DENIED' ||
    session.problem === 'LOCATION_DISABLED';

  async function capture() {
    const draft = await session.capture();
    if (draft && navigation.isFocused()) {
      navigation.navigate('Floor', { capture: draft });
    }
  }

  async function createSession() {
    if (startingSession) return;
    setStartingSession(true);
    try {
      await fieldwork().startSession?.(null);
      await refresh();
    } catch {
      // Keep current session if local storage is busy.
    } finally {
      setStartingSession(false);
    }
  }

  return (
    <GuideScrollView style={g.screen} contentContainerStyle={g.content}>
      <Reveal style={s.layout}>
        <View style={s.heading}>
          <View style={s.flex}>
            <ScreenTitle
              eyebrow="01 / 02 · CAPTURA"
              title="Medir señal"
              subtitle="Deja el teléfono quieto mientras promediamos 8 lecturas."
            />
          </View>
          <Button
            label="Guía"
            icon="info"
            kind="secondary"
            onPress={() => guide.start('overview')}
          />
        </View>
        <ProgressSteps count={2} current={0} />

        <View style={s.sessionRow}>
          <StatusPill
            label={
              'Sesión activa: ' + (settings?.activeSessionName ?? 'Sesión 1')
            }
          />
          <Chip
            label={startingSession ? 'Creando...' : '+ Nueva sesión'}
            selected={false}
            disabled={startingSession}
            onPress={createSession}
          />
        </View>

        <View style={g.card}>
          <GuideTarget id="accuracy">
            <AccuracyIndicator
              accuracy={
                guide.active ? null : session.reading?.accuracyM ?? null
              }
            />
          </GuideTarget>
          <View style={g.divider} />
          <GuideTarget id="network">
            <NetworkBadge
              metric={guide.active ? null : session.reading?.metric ?? null}
              connection={
                guide.active ? null : session.reading?.connection ?? null
              }
              dbm={guide.active ? null : session.reading?.powerDbm ?? null}
              technical={settings?.technicalMode ?? false}
            />
          </GuideTarget>
        </View>

        <GuideTarget id="capture">
          <CaptureButton
            status={session.status}
            active={session.enabled}
            ready={
              session.enabled &&
              !guide.active &&
              session.status !== 'permission' &&
              !needsSettings
            }
            onStart={session.start}
            onCapture={capture}
          />
        </GuideTarget>
        {needsSettings && (
          <Button
            label={
              session.problem === 'LOCATION_DISABLED'
                ? 'Ajustes de ubicación'
                : 'Permisos de la app'
            }
            kind="secondary"
            icon="settings"
            onPress={() => {
              const open =
                session.problem === 'LOCATION_DISABLED'
                  ? Linking.sendIntent(
                      'android.settings.LOCATION_SOURCE_SETTINGS',
                    )
                  : Linking.openSettings();
              open.catch(() => {});
            }}
          />
        )}
        {session.enabled && (
          <Button label="Pausar lectura" kind="quiet" onPress={session.pause} />
        )}
        <View style={s.hint}>
          <Icon name="lock" size={15} color={COLORS.textMuted} />
          <Text style={[g.caption, s.flex]}>
            La captura se guarda en este teléfono cuando confirmas el recinto.
          </Text>
        </View>
      </Reveal>
      <Dialog
        title="Promediando señal"
        visible={session.status === 'freezing'}
        dismissible={false}
        onClose={() => {}}
      >
        <Text style={g.body}>
          Deje su teléfono quieto, sonará cuando el proceso termine, no debería
          tomar más de 5 segundos.
        </Text>
        <StationaryAveragingGraphic
          active={session.status === 'freezing'}
          step={session.sampleStep}
        />
      </Dialog>
    </GuideScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  averagingBox: {
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.assistantGlow,
  },
  averagingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  barsRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 6,
  },
  bar: {
    flex: 1,
    borderRadius: 999,
  },
  barCaptured: {
    backgroundColor: COLORS.primary,
  },
  barPending: {
    backgroundColor: '#D4E1FA',
  },
  flex: { flex: 1 },
  hint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
});
