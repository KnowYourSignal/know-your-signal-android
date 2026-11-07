import React, { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloorSelector } from '../components/FloorSelector';
import { ZoneSizeSelector } from '../components/ZoneSizeSelector';
import { NetworkBadge } from '../components/NetworkBadge';
import { Reveal } from '../components/Motion';
import {
  Button,
  Dialog,
  ProgressSteps,
  ScreenTitle,
  StatePanel,
  StatusPill,
} from '../components/UI';
import { parseFloor } from '../domain/CapturePolicy';
import { errorCode } from '../domain/CaptureState';
import { floorLabel, isMetric, type ZoneSize } from '../domain/Measurement';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import type { SavedMeasurement } from '../specs/NativeFieldwork';
import { useSettings } from '../state/SettingsContext';
import type { RootParamList } from '../state/WizardState';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

export function FloorScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootParamList, 'Floor'>) {
  const { status, refresh } = useSettings();
  const { capture } = route.params;
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState<ZoneSize | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMeasurement | null>(null);
  const saving = useRef(false);
  const level = parseFloor(floor);

  async function save() {
    if (level === null || zone === null || saving.current || saved) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const measurement = await fieldwork().saveMeasurement(
        capture.id,
        level,
        zone,
      );
      setSaved(measurement);
      refresh();
    } catch (problem) {
      setError(
        errorCode(problem) === 'CAPTURE_EXPIRED'
          ? 'La captura ya no está disponible. Vuelve a Medir para tomar otra.'
          : 'No pudimos guardar la captura. Revisa el almacenamiento e inténtalo de nuevo.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function openHistory() {
    if (saved && isMetric(saved.metric)) {
      navigation.popTo('MainTabs', {
        screen: 'MapaPersonal',
        params: { floor: saved.floor, metric: saved.metric, savedId: saved.id },
      });
    } else {
      navigation.popTo('MainTabs', { screen: 'MapaPersonal' });
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={g.screen}>
      <KeyboardAvoidingView
        style={g.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={g.content}
        >
          <Reveal style={s.layout}>
            <ScreenTitle
              eyebrow="02 / 02 · RECINTO"
              title="Completar captura"
              subtitle="Indica dónde tomaste esta medición."
            />
            <ProgressSteps count={2} current={1} />
            <View style={g.card}>
              <StatusPill label="Muestra capturada" tone="green" />
              <NetworkBadge
                connection={capture.connection}
                metric={capture.metric}
                dbm={capture.powerDbm}
                technical={status?.technicalMode ?? false}
              />
              <Text style={g.caption}>
                Precisión de ubicación ±{capture.accuracyM.toFixed(1)} m
              </Text>
            </View>
            <View style={g.card}>
              <FloorSelector
                value={floor}
                onChange={setFloor}
                editable={!busy && !saved}
              />
              <View style={g.divider} />
              <ZoneSizeSelector
                value={zone}
                onChange={setZone}
                disabled={busy || !!saved}
              />
            </View>
            {error && (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {error}
              </Text>
            )}
            <Button
              label={busy ? 'Guardando captura' : 'Guardar medición'}
              icon="check"
              busy={busy}
              disabled={level === null || zone === null || !!saved}
              onPress={save}
            />
            <Button
              label="Volver a Medir"
              kind="quiet"
              icon="back"
              disabled={busy}
              onPress={() => navigation.goBack()}
            />
          </Reveal>
        </ScrollView>
        <Dialog
          title="Medición guardada"
          visible={saved !== null}
          onClose={() => navigation.goBack()}
        >
          <StatePanel
            icon="check"
            title={saved ? floorLabel(saved.floor) : 'Captura guardada'}
            body={
              saved?.syncState === 'PENDING'
                ? 'Tu historial está disponible sin conexión. El aporte queda en cola hasta que haya red y se confirme tu consentimiento.'
                : 'Tu captura quedó guardada en el historial de este teléfono.'
            }
          />
          <Button label="Ver mi historial" icon="map" onPress={openHistory} />
          <Button
            label="Medir otra vez"
            kind="secondary"
            onPress={() => navigation.goBack()}
          />
        </Dialog>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  error: { color: COLORS.danger, fontSize: 13 },
});
