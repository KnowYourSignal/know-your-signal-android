// src/screens/SettingsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';
import { useSettings } from '../state/SettingsContext';

export const SettingsScreen = () => {
  const { technicalMode, toggleTechnicalMode, sharingEnabled, setSharingEnabled } = useSettings();
  const [confirmRevokeModal, setConfirmRevokeModal] = useState(false);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <Text style={styles.screenTitle}>Ajustes y Privacidad</Text>
        <Text style={styles.screenSubtitle}>Control de telemetría, visualización y consentimiento</Text>

        {/* TARJETA MODO TÉCNICO */}
        <View style={styles.cardContainer}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardValue}>Activar Modo Técnico (dBm)</Text>
              <Text style={styles.cardHelp}>
                Muestra los valores exactos de potencia en dBm (RSSI / RSRP) sobre los mapas y el wizard.
              </Text>
            </View>
            <Switch
              value={technicalMode}
              onValueChange={toggleTechnicalMode}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.cardBg}
            />
          </View>
        </View>

        {/* TARJETA ESTADO DE CONSENTIMIENTO */}
        <View style={styles.cardContainer}>
          <Text style={styles.cardLabel}>Estado de privacidad (Aviso v1.0):</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: sharingEnabled ? COLORS.success : COLORS.warning },
              ]}
            />
            <Text
              style={[
                styles.cardValue,
                { color: sharingEnabled ? COLORS.success : COLORS.textDark },
              ]}
            >
              {sharingEnabled
                ? 'Aporte comunitario activo (Opt-in)'
                : 'Modo estrictamente personal (LOCAL_ONLY)'}
            </Text>
          </View>
          <Text style={styles.cardHelp}>
            {sharingEnabled
              ? 'Tus nuevas capturas se envían de forma seudonimizada mediante WorkManager cuando hay red disponible.'
              : 'Ninguna medición abandona tu teléfono. La cola de sincronización en segundo plano está detenida.'}
          </Text>
        </View>

        {/* TARJETA ESTADO DEL OUTBOX */}
        <View style={styles.cardContainer}>
          <Text style={styles.cardLabel}>Cola de sincronización local (Room Outbox):</Text>
          <View style={styles.outboxStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Pendientes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>24</Text>
              <Text style={styles.statLabel}>Guardadas en Room</Text>
            </View>
          </View>
        </View>

        {sharingEnabled ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: COLORS.danger, marginTop: 'auto' }]}
            onPress={() => setConfirmRevokeModal(true)}
          >
            <Text style={styles.primaryButtonText}>Revocar consentimiento comunitario</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: COLORS.primary, marginTop: 'auto' }]}
            onPress={() => setSharingEnabled(true)}
          >
            <Text style={styles.primaryButtonText}>Habilitar aporte comunitario</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL DE CONFIRMACIÓN DE REVOCACIÓN */}
      <Modal
        visible={confirmRevokeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRevokeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔒</Text>
            <Text style={styles.modalTitle}>¿Detener aportes futuros?</Text>
            <Text style={styles.modalBody}>
              Al revocar el permiso, los envíos pendientes pasarán a estado LOCAL_ONLY y WorkManager cancelará la sincronización. Tu historial personal seguirá intacto en tu teléfono.
            </Text>
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: COLORS.danger }]}
                onPress={() => {
                  setSharingEnabled(false);
                  setConfirmRevokeModal(false);
                }}
              >
                <Text style={styles.primaryButtonText}>Sí, pasar a uso solo personal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setConfirmRevokeModal(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  screenBody: { flex: 1, padding: 24 },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  screenSubtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20 },
  cardContainer: {
    backgroundColor: COLORS.cardBg,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusIndicator: { width: 10, height: 10, borderRadius: 5 },
  cardLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4, fontWeight: '600' },
  cardValue: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark },
  cardHelp: { fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 17 },
  outboxStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: { fontSize: 44, marginBottom: 10 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  modalBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
});