import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../state/SettingsContext';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';
import { Icon } from './Icon';
import { Button, Dialog, StatusPill } from './UI';

export function PrivacySettings() {
  const { status, setConsent } = useSettings();
  const [decision, setDecision] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const community = status?.choice === 'community';

  async function apply() {
    if (decision === null || saving.current) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(false);
    try {
      await setConsent(decision);
      setDecision(null);
    } catch {
      setError(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (!saving.current) {
      setDecision(null);
      setError(false);
    }
  }

  const label = community
    ? status?.consentPending
      ? 'Activación pendiente'
      : 'Aporte comunitario activo'
    : status?.consentPending
    ? 'Uso personal · revocación pendiente'
    : 'Solo uso personal';

  return (
    <View style={g.card}>
      <View style={g.row}>
        <View style={s.icon}>
          <Icon name="shield" size={21} />
        </View>
        <View style={s.text}>
          <Text style={g.sectionTitle}>Privacidad de tus capturas</Text>
          <Text style={g.caption}>Aviso 1.0</Text>
        </View>
      </View>
      <StatusPill
        label={label}
        tone={status?.consentPending ? 'amber' : community ? 'green' : 'blue'}
      />
      <Text style={g.body}>
        {community
          ? 'Las nuevas capturas esperan conexión y consentimiento confirmado antes de aportar al mapa.'
          : 'Tus nuevas capturas quedan guardadas en este teléfono.'}
      </Text>
      {status?.consentPending && !community && (
        <Text style={g.caption}>
          Los envíos en cola se detuvieron en este teléfono. El servidor
          recibirá la revocación cuando haya conexión.
        </Text>
      )}
      <Button
        label={
          community
            ? 'Revocar aporte comunitario'
            : 'Habilitar aporte comunitario'
        }
        kind="secondary"
        icon={community ? 'lock' : 'globe'}
        disabled={!community && !status?.syncAvailable}
        onPress={() => setDecision(!community)}
      />
      {!status?.syncAvailable && (
        <Text style={g.caption}>
          El aporte requiere configurar el servicio en esta instalación.
        </Text>
      )}

      <Dialog
        title={decision ? 'Aportar a la comunidad' : 'Detener aportes futuros'}
        visible={decision !== null}
        dismissible={!busy}
        onClose={close}
      >
        <Text style={g.body}>
          {decision
            ? 'Compartirás coordenadas, intensidad, piso y hora de las próximas capturas mediante una cuenta técnica. Tu historial anterior sigue en el teléfono.'
            : 'Las mediciones pendientes quedarán en tu historial local. Los aportes ya aceptados se conservan en el servidor.'}
        </Text>
        {error && (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            No pudimos guardar la preferencia. Inténtalo de nuevo.
          </Text>
        )}
        <Button
          label={decision ? 'Confirmar aporte' : 'Confirmar revocación'}
          kind={decision ? 'primary' : 'danger'}
          busy={busy}
          onPress={apply}
        />
        <Button label="Volver" kind="quiet" disabled={busy} onPress={close} />
      </Dialog>
    </View>
  );
}

const s = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.assistantGlow,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 13 },
});
