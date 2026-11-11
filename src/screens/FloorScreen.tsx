import { GuideScrollView, GuideTarget } from '../components/GuideTarget';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloorSelector } from '../components/FloorSelector';
import { ZoneSizeSelector } from '../components/ZoneSizeSelector';
import { NetworkBadge } from '../components/NetworkBadge';
import { Reveal } from '../components/Motion';
import {
  Button,
  Chip,
  Dialog,
  ProgressSteps,
  ScreenTitle,
  StatePanel,
  StatusPill,
} from '../components/UI';
import { parseFloor } from '../domain/CapturePolicy';
import { errorCode } from '../domain/CaptureState';
import {
  ZONES,
  floorLabel,
  isMetric,
  type ZoneSize,
} from '../domain/Measurement';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import type { RecentRoom, SavedMeasurement } from '../specs/NativeFieldwork';
import { useAutoGuide, useGuide } from '../state/GuideContext';
import { useSettings } from '../state/SettingsContext';
import type { RootParamList } from '../state/WizardState';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

export function FloorScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootParamList, 'Floor'>) {
  const { status, refresh } = useSettings();
  const guide = useGuide();
  const focused = useIsFocused();
  const [interacted, setInteracted] = useState(false);
  const { capture } = route.params;
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState<ZoneSize | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMeasurement | null>(null);
  const [recentRoom, setRecentRoom] = useState<RecentRoom | null>(null);
  const [connectionChoice, setConnectionChoice] = useState<string | null>(null);
  const saving = useRef(false);
  const [savedVisible, setSavedVisible] = useState(false);
  const destination = useRef<'measure' | 'history'>('measure');
  const level = parseFloor(floor);
  useAutoGuide('room', focused && !interacted && !busy && !saved);

  useEffect(() => {
    let active = true;
    fieldwork()
      .getRecentRoom()
      .then(room => {
        if (
          active &&
          room &&
          ZONES.some(option => option.value === room.zoneSize)
        ) {
          setRecentRoom(room);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function save(room?: RecentRoom) {
    const selectedLevel = room?.floor ?? level;
    const selectedZone = room?.zoneSize ?? zone;
    if (
      selectedLevel === null ||
      selectedZone === null ||
      saving.current ||
      saved
    ) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      if (room) {
        setFloor(String(room.floor));
        setZone(room.zoneSize as ZoneSize);
      }
      const measurement = await fieldwork().saveMeasurementWithClassification(
        capture.id,
        selectedLevel,
        selectedZone,
        connectionChoice,
      );
      setSaved(measurement);
      setSavedVisible(true);
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
        <GuideScrollView
          onTouchStart={() => setInteracted(true)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={g.content}
        >
          <Reveal style={s.layout}>
            <View style={s.heading}>
              <View style={s.grow}>
                <ScreenTitle
                  eyebrow="02 / 02 · RECINTO"
                  title="Completar captura"
                  subtitle="Indica dónde tomaste esta medición."
                />
              </View>
              <Button
                label="Guía"
                kind="secondary"
                icon="info"
                disabled={busy || !!saved}
                onPress={() => guide.start('room')}
              />
            </View>
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
            {recentRoom && !saved && (
              <View style={g.card}>
                <Text style={g.sectionTitle}>¿Sigues en el mismo recinto?</Text>
                <Text style={g.body}>
                  {floorLabel(recentRoom.floor)} ·{' '}
                  {
                    ZONES.find(option => option.value === recentRoom.zoneSize)
                      ?.label
                  }
                </Text>
                <Text style={g.caption}>
                  Confirma el piso y el tamaño para esta nueva captura.
                </Text>
                <Button
                  label="Confirmar y guardar aquí"
                  kind="secondary"
                  icon="check"
                  busy={busy}
                  onPress={() => save(recentRoom)}
                />
              </View>
            )}
            {capture.connection === 'wifi_desconocida' && (
              <View style={g.card}>
                <Text style={g.sectionTitle}>
                  ¿Esta Wi-Fi tiene contraseña?
                </Text>
                <Text style={g.caption}>
                  Android no pudo identificarla. Puedes declararlo o dejarla sin
                  clasificar.
                </Text>
                <View style={s.choices}>
                  {[
                    { value: 'wifi_publica', label: 'No · abierta' },
                    { value: 'wifi_privada', label: 'Sí · protegida' },
                    { value: null, label: 'No lo sé' },
                  ].map(option => (
                    <Chip
                      key={option.value ?? 'unknown'}
                      label={option.label}
                      selected={connectionChoice === option.value}
                      disabled={busy || !!saved}
                      onPress={() => setConnectionChoice(option.value)}
                    />
                  ))}
                </View>
              </View>
            )}
            <View style={g.card}>
              <FloorSelector
                value={floor}
                onChange={setFloor}
                editable={!busy && !saved}
                guided
              />
              <View style={g.divider} />
              <GuideTarget id="zone">
                <ZoneSizeSelector
                  value={zone}
                  onChange={setZone}
                  disabled={busy || !!saved}
                />
              </GuideTarget>
            </View>
            {error && (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {error}
              </Text>
            )}
            <GuideTarget id="save">
              <Button
                label={busy ? 'Guardando captura' : 'Guardar medición'}
                icon="check"
                busy={busy}
                disabled={level === null || zone === null || !!saved}
                onPress={() => save()}
              />
            </GuideTarget>
            <Button
              label="Volver a Medir"
              kind="quiet"
              icon="back"
              disabled={busy}
              onPress={() => navigation.goBack()}
            />
          </Reveal>
        </GuideScrollView>
        <Dialog
          title="Medición guardada"
          visible={savedVisible}
          onClose={() => setSavedVisible(false)}
          onAfterClose={() => {
            if (destination.current === 'history') openHistory();
            else navigation.goBack();
          }}
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
          <Button
            label="Ver mi historial"
            icon="map"
            onPress={() => {
              destination.current = 'history';
              setSavedVisible(false);
            }}
          />
          <Button
            label="Medir otra vez"
            kind="secondary"
            onPress={() => setSavedVisible(false)}
          />
        </Dialog>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  grow: { flex: 1 },
  layout: { gap: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { color: COLORS.danger, fontSize: 13 },
});
