import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
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
import { Reveal } from '../components/Motion';
import { Button, ProgressSteps, ScreenTitle } from '../components/UI';
import { capturePresentation } from '../domain/CapturePresentation';
import { CaptureStatusCard } from '../components/CaptureStatusCard';
import { useCaptureSession } from '../services/useCaptureSession';
import { useSettings } from '../state/SettingsContext';
import type { MainTabsParamList, RootParamList } from '../state/WizardState';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Medir'>,
  NativeStackScreenProps<RootParamList, 'MainTabs'>
>;

export function WizardScreen({ navigation }: Props) {
  const { status: settings } = useSettings();
  const focused = useIsFocused();
  const guide = useGuide();
  const session = useCaptureSession(focused && !guide.active);
  useAutoGuide(
    'overview',
    focused && !session.enabled && session.status !== 'permission',
  );
  const presentation = capturePresentation({
    ...session,
    guiding: guide.active,
  });
  const needsSettings =
    session.problem === 'PERMISSION_DENIED' ||
    session.problem === 'LOCATION_DISABLED';

  async function capture() {
    const draft = await session.capture();
    if (draft && navigation.isFocused()) {
      navigation.navigate('Floor', { capture: draft });
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
              subtitle="Quédate quieto mientras medimos."
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

        <CaptureStatusCard state={presentation} />

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
            ready={session.canRecord}
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
    </GuideScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  hint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
});
