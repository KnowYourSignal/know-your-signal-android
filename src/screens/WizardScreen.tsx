import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useIsFocused,
  type CompositeScreenProps,
} from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';

import { AccuracyIndicator } from '../components/AccuracyIndicator';
import { CaptureButton } from '../components/CaptureButton';
import { Icon } from '../components/Icon';
import { NetworkBadge } from '../components/NetworkBadge';
import { Reveal } from '../components/Motion';
import {
  Button,
  Dialog,
  ProgressSteps,
  ScreenTitle,
  StatusPill,
} from '../components/UI';
import { captureMessage } from '../domain/CaptureState';
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
  const session = useCaptureSession(useIsFocused());
  const [guide, setGuide] = useState(false);
  const ready = session.status === 'ready';
  const needsSettings =
    session.problem === 'PERMISSION_DENIED' ||
    session.problem === 'LOCATION_DISABLED';
  const status = ready
    ? 'Lectura lista'
    : session.enabled
    ? 'Buscando lectura'
    : 'Sensores en pausa';

  async function capture() {
    const draft = await session.capture();
    if (draft && navigation.isFocused()) {
      navigation.navigate('Floor', { capture: draft });
    }
  }

  return (
    <ScrollView style={g.screen} contentContainerStyle={g.content}>
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
            onPress={() => setGuide(true)}
          />
        </View>
        <ProgressSteps count={2} current={0} />

        <View style={s.hero}>
          <View style={s.heroArt} pointerEvents="none">
            <Svg width={132} height={132} viewBox="0 0 132 132">
              <Path
                d="M66 4v124 M4 66h124"
                stroke="#B9CCFA"
                strokeDasharray="3 5"
              />
              {[17, 35, 55].map(radius => (
                <Circle
                  key={radius}
                  cx={66}
                  cy={66}
                  r={radius}
                  fill="none"
                  stroke="#A7BFFA"
                />
              ))}
              <Circle
                cx={66}
                cy={66}
                r={6}
                fill={ready ? COLORS.success : COLORS.primary}
              />
              <Circle cx={91} cy={42} r={4} fill="#83A2F6" />
            </Svg>
          </View>
          <StatusPill
            label={status}
            tone={ready ? 'green' : needsSettings ? 'amber' : 'blue'}
          />
          <Text style={s.heroTitle}>
            {ready
              ? 'Tu señal está lista'
              : session.enabled
              ? 'Estabilizando señal'
              : 'Inicia una medición'}
          </Text>
          <Text accessibilityLiveRegion="polite" style={g.body}>
            {captureMessage(session.problem)}
          </Text>
        </View>

        <View style={g.card}>
          <AccuracyIndicator accuracy={session.reading?.accuracyM ?? null} />
          <View style={g.divider} />
          <NetworkBadge
            metric={session.reading?.metric ?? null}
            connection={session.reading?.connection ?? null}
            dbm={session.reading?.powerDbm ?? null}
            technical={settings?.technicalMode ?? false}
          />
        </View>

        <CaptureButton
          status={session.status}
          active={session.enabled}
          ready={session.canRecord}
          onStart={session.start}
          onCapture={capture}
        />
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
        title="Guía de medición"
        visible={guide}
        onClose={() => setGuide(false)}
      >
        {[
          [
            'radar',
            '1. Estabiliza la ubicación',
            'Permanece quieto hasta obtener una precisión menor a 10 m.',
          ],
          [
            'signal',
            '2. Registra la señal',
            'Confirma que la app detecta la red que estás evaluando.',
          ],
          [
            'building',
            '3. Confirma el recinto',
            'Indica el piso y el tamaño del espacio para guardar la muestra.',
          ],
        ].map(([icon, title, body]) => (
          <View key={title} style={g.row}>
            <Icon name={icon as 'radar' | 'signal' | 'building'} />
            <View style={s.flex}>
              <Text style={g.sectionTitle}>{title}</Text>
              <Text style={g.body}>{body}</Text>
            </View>
          </View>
        ))}
        <Button label="Entendido" onPress={() => setGuide(false)} />
      </Dialog>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  hero: {
    gap: 8,
    padding: 17,
    minHeight: 135,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.assistantGlow,
    overflow: 'hidden',
  },
  heroArt: { position: 'absolute', right: -31, top: -36, opacity: 0.48 },
  heroTitle: {
    color: COLORS.navy,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  hint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
});
