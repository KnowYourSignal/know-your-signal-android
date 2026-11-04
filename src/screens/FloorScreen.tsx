// src/screens/FloorScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';
import { useSettings, formatSignal, getSignalColor } from '../state/SettingsContext';

const SIZES = ['Pequeño', 'Mediano', 'Grande', 'Muy Grande'];
const SIZE_DESCRIPTIONS: Record<string, string> = {
  'Pequeño': 'Ej: Habitación, oficina personal o baño (hasta 20 m²).',
  'Mediano': 'Ej: Living, sala de clases o recepción (20 a 50 m²).',
  'Grande': 'Ej: Auditorio, pasillo largo o hall (50 a 100 m²).',
  'Muy Grande': 'Ej: Bodega, gimnasio o patio techado (+100 m²).',
};

const QUICK_FLOORS = ['-2', '-1', '1', '2', '3', '4'];

export const FloorScreen = ({ navigation, route }: any) => {
  const { technicalMode } = useSettings();
  const [piso, setPiso] = useState('');
  const [tamano, setTamano] = useState('Mediano');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSavedModal, setShowSavedModal] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const modalScaleAnim = useRef(new Animated.Value(0.85)).current;

  const capturedDbm = route?.params?.dbm ?? -68;
  const signalColor = getSignalColor(capturedDbm);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleGuardar = () => {
    const parsedFloor = parseInt(piso.trim(), 10);
    if (!piso.trim() || isNaN(parsedFloor)) {
      setErrorMsg('Ingresa un número de piso válido para continuar.');
      triggerShake();
      return;
    }
    if (parsedFloor < -10 || parsedFloor > 150) {
      setErrorMsg('El piso debe estar dentro del rango permitido (-10 a 150).');
      triggerShake();
      return;
    }

    setErrorMsg(null);
    modalScaleAnim.setValue(0.85);
    setShowSavedModal(true);
    Animated.spring(modalScaleAnim, {
      toValue: 1,
      tension: 65,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.screenBody}>
          <View style={styles.headerBlock}>
            <Text style={styles.screenTitle}>Completar captura</Text>
            <View style={styles.snapshotBadge}>
              <View style={[styles.signalDot, { backgroundColor: signalColor }]} />
              <Text style={styles.snapshotText}>
                Muestra congelada: <Text style={{ fontWeight: 'bold', color: signalColor }}>{formatSignal(capturedDbm, technicalMode)}</Text>
              </Text>
            </View>
          </View>

          {/* BLOQUE SELECTOR DE PISO */}
          <Animated.View style={[styles.selectorBlock, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.selectorLabel}>1. Indica el Piso / Nivel estructural:</Text>
            <TextInput
              style={[styles.numericInput, errorMsg ? styles.inputError : null]}
              keyboardType="numbers-and-punctuation"
              placeholder="Ej: -1, 1, 8..."
              placeholderTextColor={COLORS.textMuted}
              value={piso}
              onChangeText={(val) => {
                setPiso(val);
                if (errorMsg) setErrorMsg(null);
              }}
            />

            <View style={styles.quickFloorRow}>
              <Text style={styles.quickFloorHint}>Selección rápida:</Text>
              {QUICK_FLOORS.map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.quickFloorChip, piso === lvl && styles.quickFloorChipActive]}
                  onPress={() => {
                    setPiso(lvl);
                    setErrorMsg(null);
                  }}
                >
                  <Text style={[styles.quickFloorText, piso === lvl && styles.quickFloorTextActive]}>
                    {lvl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {errorMsg && <Text style={styles.errorText}>⚠️ {errorMsg}</Text>}
          </Animated.View>

          {/* BLOQUE SELECTOR DE TAMAÑO */}
          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>2. Tamaño estimado del recinto:</Text>
            <View style={styles.optionsGrid}>
              {SIZES.map((t) => (
                <TouchableOpacity
                  key={t}
                  activeOpacity={0.8}
                  style={[styles.gridChip, tamano === t && styles.gridChipActive]}
                  onPress={() => setTamano(t)}
                >
                  <Text style={[styles.gridChipText, tamano === t && styles.gridChipTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.tooltipBox}>
              <Text style={styles.tooltipIcon}>ℹ️</Text>
              <Text style={styles.tooltipText}>{SIZE_DESCRIPTIONS[tamano]}</Text>
            </View>
          </View>

          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleGuardar} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Guardar medición local</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
              <Text style={styles.secondaryButtonText}>Descartar captura</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* MODAL DE CONFIRMACIÓN */}
      <Modal
        visible={showSavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSavedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { transform: [{ scale: modalScaleAnim }] }]}>
            <Text style={styles.modalEmoji}>✅</Text>
            <Text style={styles.modalTitle}>¡Medición guardada!</Text>
            <Text style={styles.modalBody}>
              Registrada en Piso {piso} ({tamano}). Persistida localmente en tu dispositivo.
            </Text>
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setShowSavedModal(false);
                  navigation.navigate('Wizard');
                }}
              >
                <Text style={styles.primaryButtonText}>Hacer otra medición</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryModalBtn}
                onPress={() => {
                  setShowSavedModal(false);
                  navigation.getParent()?.navigate('MapaPersonal');
                }}
              >
                <Text style={styles.secondaryModalBtnText}>Ver evidencia en Mi Historial</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  screenBody: { flex: 1, padding: 24 },
  headerBlock: { marginBottom: 20 },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  snapshotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  signalDot: { width: 10, height: 10, borderRadius: 5 },
  snapshotText: { fontSize: 13, color: COLORS.textDark },
  selectorBlock: { marginBottom: 22 },
  selectorLabel: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 10 },
  numericInput: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  inputError: { borderColor: COLORS.danger, backgroundColor: '#FFF5F5' },
  errorText: { color: COLORS.danger, fontSize: 12, fontWeight: '600', marginTop: 6 },
  quickFloorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  quickFloorHint: { fontSize: 12, color: COLORS.textMuted, marginRight: 4 },
  quickFloorChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickFloorChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickFloorText: { fontSize: 12, fontWeight: 'bold', color: COLORS.textDark },
  quickFloorTextActive: { color: COLORS.textLight },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridChip: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gridChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  gridChipText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  gridChipTextActive: { color: COLORS.textLight },
  tooltipBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EBF2FF',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tooltipIcon: { fontSize: 16 },
  tooltipText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '600', lineHeight: 16 },
  footerActions: { flex: 1, justifyContent: 'flex-end', gap: 6 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { backgroundColor: 'transparent', paddingVertical: 10, alignItems: 'center' },
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
    elevation: 6,
  },
  modalEmoji: { fontSize: 48, marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'center', marginBottom: 8 },
  modalBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 22 },
  secondaryModalBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    width: '100%',
  },
  secondaryModalBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold' },
});