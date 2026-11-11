import { GuideScrollView, GuideTarget } from '../components/GuideTarget';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Motion';
import { PrivacySettings } from '../components/PrivacySettings';
import { Button, ScreenTitle, StatePanel, StatusPill } from '../components/UI';
import { fieldwork } from '../services/LocalRepositoryAdapter';
import { useGuide } from '../state/GuideContext';
import { useSettings } from '../state/SettingsContext';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

const problemText: Record<string, string> = {
  NETWORK: 'Esperando una conexión estable.',
  RATE_LIMITED: 'La cola continuará cuando el servidor acepte más capturas.',
  SERVICE_UNAVAILABLE:
    'El servicio está temporalmente ocupado. Reintentaremos automáticamente.',
  INVALID_RESPONSE:
    'El servicio no confirmó todas las capturas. Siguen en cola y volveremos a intentarlo.',
  SESSION_EXPIRED:
    'La sesión de aporte necesita atención. Puedes seguir usando el historial.',
  SESSION_STORAGE: 'La sesión de aporte no se pudo leer en este teléfono.',
  CONSENT_BLOCKED: 'El servidor no confirmó el permiso para aportar.',
  SERVER_REJECTED: 'El servidor no pudo procesar el lote.',
  SYNC_NOT_SCHEDULED:
    'Tu historial está guardado. Puedes reintentar la sincronización desde aquí.',
  CONFIG_CHANGED:
    'El servicio configurado cambió desde tu última decisión de privacidad.',
};

export function SettingsScreen() {
  const guide = useGuide();
  const { status, loadError, refresh, setTechnicalMode } = useSettings();
  const [updating, setUpdating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lock = useRef(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const waiting = !!status && (status.pending > 0 || status.consentPending);

  async function toggle(enabled: boolean) {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setUpdating(true);
    setFeedback(null);
    try {
      await setTechnicalMode(enabled);
    } catch {
      setFeedback('No pudimos guardar el modo de visualización.');
    } finally {
      lock.current = false;
      setUpdating(false);
    }
  }

  async function retry() {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setUpdating(true);
    try {
      await fieldwork().retrySync();
      setFeedback('Sincronización programada para cuando haya conexión.');
      await refresh();
    } catch {
      setFeedback('No pudimos programar el reintento.');
    } finally {
      lock.current = false;
      setUpdating(false);
    }
  }

  return (
    <GuideScrollView style={g.screen} contentContainerStyle={g.content}>
      <Reveal style={s.layout}>
        <ScreenTitle
          eyebrow="PREFERENCIAS"
          title="Ajustes"
          subtitle="Controla cómo ves y compartes tus mediciones."
        />
        {loadError && (
          <View style={g.card}>
            <StatePanel
              icon="refresh"
              title="No pudimos actualizar el estado"
              body="Mostramos la última información del historial que pudimos leer."
              action={{ label: 'Reintentar', onPress: refresh }}
            />
          </View>
        )}
        <View style={g.card}>
          <View style={g.row}>
            <Icon name="signal" size={23} />
            <View style={s.copy}>
              <Text style={g.sectionTitle}>Modo técnico</Text>
              <Text style={g.caption}>
                Muestra potencia en dBm en lugar de niveles de señal.
              </Text>
            </View>
            <GuideTarget id="technical" style={s.technicalControl}>
              <Switch
                accessibilityLabel="Modo técnico"
                value={status?.technicalMode ?? false}
                disabled={updating}
                onValueChange={toggle}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={COLORS.cardBg}
              />
            </GuideTarget>
          </View>
        </View>
        <PrivacySettings />

        <View style={g.card}>
          <View style={g.row}>
            <Icon name="layers" size={21} />
            <Text style={g.sectionTitle}>Estado del historial</Text>
          </View>
          <View style={s.stats}>
            {[
              { value: status?.total ?? 0, label: 'Guardadas' },
              { value: status?.pending ?? 0, label: 'Pendientes' },
              { value: status?.synced ?? 0, label: 'Aportadas' },
            ].map(item => (
              <View key={item.label} style={s.stat}>
                <Text style={s.count}>{item.value}</Text>
                <Text style={g.caption}>{item.label}</Text>
              </View>
            ))}
          </View>
          {!!status?.failed && (
            <StatusPill
              label={
                status.failed +
                ' aportes rechazados, conservados en el historial'
              }
              tone="amber"
            />
          )}
          {status?.syncProblem && (
            <Text style={g.body}>
              {problemText[status.syncProblem] ??
                'La sincronización necesita un reintento.'}
            </Text>
          )}
          {waiting && status?.syncAvailable && (
            <Button
              label="Reintentar sincronización"
              kind="secondary"
              icon="refresh"
              busy={updating}
              onPress={retry}
            />
          )}
        </View>
        <View style={g.card}>
          <View style={g.row}>
            <Icon name="info" size={21} />
            <Text style={g.sectionTitle}>Conoce la app</Text>
          </View>
          <Text style={g.body}>
            Recorre las herramientas de medición, tus mapas y las opciones de
            privacidad.
          </Text>
          <Button
            label="Repetir guía interactiva"
            kind="secondary"
            onPress={() => guide.start('overview', 'Ajustes')}
          />
        </View>
        {feedback && (
          <Text accessibilityLiveRegion="polite" style={g.caption}>
            {feedback}
          </Text>
        )}
      </Reveal>
    </GuideScrollView>
  );
}

const s = StyleSheet.create({
  layout: { gap: 14 },
  technicalControl: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: {
    flex: 1,
    minWidth: 76,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 10,
    alignItems: 'center',
    gap: 3,
  },
  count: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
  },
});
