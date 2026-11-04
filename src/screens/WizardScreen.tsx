// src/screens/WizardScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';
import { useSettings, formatSignal } from '../state/SettingsContext';

export const WizardScreen = ({ navigation }: any) => {
  const { technicalMode } = useSettings();
  const [tourStep, setTourStep] = useState<number | null>(0);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const mockDbm = -68;

  useEffect(() => {
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, [bounceAnim]);

  useEffect(() => {
    let targetY = 0;
    if (tourStep === 1) targetY = 85;
    else if (tourStep === 2) targetY = 175;
    else if (tourStep === 3) targetY = 270;

    Animated.spring(slideAnim, { toValue: targetY, tension: 40, friction: 7, useNativeDriver: false }).start();
  }, [tourStep, slideAnim]);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <View style={styles.screenHeaderRow}>
          <View>
            <Text style={styles.screenTitle}>Medir señal de red</Text>
            <Text style={styles.screenSubtitle}>Quédate quieto en el centro del recinto.</Text>
          </View>
          <TouchableOpacity style={styles.assistantHelpButton} onPress={() => setTourStep(0)}>
            <Text style={styles.assistantHelpButtonText}>💡 Guía</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardContainer}>
          <View style={[styles.focusSection, tourStep === 1 && styles.activeGlowBox]}>
            <Text style={styles.cardLabel}>Precisión GPS actual:</Text>
            <Text style={[styles.cardValue, { color: COLORS.success }]}>8.2 metros (Estable)</Text>
            <Text style={styles.cardHelp}>Requisito: Menos de 10 m para habilitar</Text>
          </View>

          <View style={styles.cardDivider} />

          <View style={[styles.focusSection, tourStep === 2 && styles.activeGlowBox]}>
            <Text style={styles.cardLabel}>Red detectada:</Text>
            <Text style={[styles.cardValue, { color: COLORS.success }]}>
              Wi-Fi Privada · {formatSignal(mockDbm, technicalMode)}
            </Text>
          </View>
        </View>

        <View style={tourStep === 3 ? styles.activeGlowBox : {}}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Floor', { dbm: mockDbm })}>
            <Text style={styles.primaryButtonText}>Registrar Señal</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.statusFooter}>Estado de sensor: READY · 3/3 muestras válidas</Text>

        {tourStep !== null && tourStep > 0 && (
          <Animated.View pointerEvents="box-none" style={[styles.floatingOverlayContainer, { transform: [{ translateY: slideAnim }] }]}>
            <Animated.View pointerEvents="box-none" style={{ transform: [{ translateY: bounceAnim }] }}>
              {(tourStep === 1 || tourStep === 2) && <View style={styles.arrowUpPointer} />}
              <View style={[styles.arrowUpPointer, tourStep === 3 ? { alignSelf: 'center', marginLeft: 0 } : {}]} />
              <View style={styles.floatingBubbleCard}>
                <Text style={styles.floatingBubbleText}>
                  {tourStep === 1 && 'Esta es la precisión del GPS. Debe ser menor a 10m para habilitar.'}
                  {tourStep === 2 && 'Aquí detectamos automáticamente la red y su calidad.'}
                  {tourStep === 3 && 'Este es el botón para congelar la muestra e ir al selector de piso.'}
                </Text>
                <TouchableOpacity style={styles.sigButton} onPress={() => setTourStep(tourStep < 3 ? tourStep + 1 : null)}>
                  <Text style={styles.sigButtonText}>{tourStep === 3 ? '¡Entendido! ✨' : 'Sig. →'}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        )}

        {tourStep === 0 && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
            <View style={styles.introOverlay}>
              <Animated.View style={[styles.introCard, { transform: [{ translateY: bounceAnim }] }]}>
                <Text style={styles.introEmoji}>👋</Text>
                <Text style={styles.introTitle}>¡Hola! Soy tu asistente</Text>
                <Text style={styles.introBody}>Te ayudaré paso a paso a conocer cómo funciona la medición.</Text>
                <View style={styles.introRowButtons}>
                  <TouchableOpacity style={styles.introOmitirBtn} onPress={() => setTourStep(null)}>
                    <Text style={styles.introOmitirText}>Omitir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.introSigBtn} onPress={() => setTourStep(1)}>
                    <Text style={styles.introSigText}>Sig. →</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  screenBody: { flex: 1, padding: 24, position: 'relative' },
  screenHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  assistantHelpButton: { backgroundColor: COLORS.assistantGlow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#C4D8FF' },
  assistantHelpButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold' },
  screenTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  screenSubtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 20 },
  cardContainer: { backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  focusSection: { padding: 6, borderRadius: 8 },
  activeGlowBox: { borderWidth: 2, borderColor: COLORS.primary, borderRadius: 8, backgroundColor: '#F0F5FF' },
  cardLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  cardValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  cardHelp: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },
  primaryButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  statusFooter: { textAlign: 'center', marginTop: 12, fontSize: 12, color: COLORS.textMuted },
  floatingOverlayContainer: { position: 'absolute', left: 24, right: 24, top: 115, zIndex: 999 },
  floatingBubbleCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: 14, borderWidth: 2, borderColor: COLORS.primary, elevation: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  floatingBubbleText: { flex: 1, fontSize: 12, color: COLORS.textDark, fontWeight: '600', lineHeight: 16 },
  sigButton: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  sigButtonText: { color: COLORS.textLight, fontSize: 12, fontWeight: 'bold' },
  arrowUpPointer: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: COLORS.primary, marginLeft: 40, marginBottom: -1 },
  introOverlay: { flex: 1, backgroundColor: COLORS.modalOverlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  introCard: { width: '100%', backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 24, alignItems: 'center', elevation: 6, borderWidth: 2, borderColor: COLORS.primary },
  introEmoji: { fontSize: 44, marginBottom: 8 },
  introTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'center', marginBottom: 8 },
  introBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  introRowButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 12 },
  introOmitirBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  introOmitirText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: 14 },
  introSigBtn: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  introSigText: { color: COLORS.textLight, fontWeight: 'bold', fontSize: 14 },
});