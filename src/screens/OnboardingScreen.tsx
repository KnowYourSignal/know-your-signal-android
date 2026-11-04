import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/theme';

const { width } = Dimensions.get('window');

// --- ESTRUCTURA DE DATOS PARA SLIDERS DE ONBOARDING ---
interface SlideData {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  visualType: 'radar' | 'building' | 'privacy' | 'decision';
}

const ONBOARDING_SLIDES: SlideData[] = [
  {
    id: '1',
    badge: 'CONECTIVIDAD REAL',
    title: 'Descubre la calidad de tu red en interiores',
    subtitle: 'Olvídate de adivinar si hay internet',
    description: 'Know Your Signal te permite medir la intensidad exacta de tu Wi-Fi o datos móviles en cualquier espacio cerrado, desde tu hogar hasta salas universitarias o centros comerciales.',
    visualType: 'radar',
  },
  {
    id: '2',
    badge: 'TECNOLOGÍA EJE Z',
    title: 'Medición guiada y precisión por piso',
    subtitle: 'Resolvemos la limitación del GPS',
    description: 'El GPS común falla bajo techo. Nuestra app te guía para estabilizar la muestra y te permite declarar manualmente en qué piso estás midiendo.',
    visualType: 'building',
  },
  {
    id: '3',
    badge: 'TRANSPARENCIA TOTAL',
    title: 'Genera evidencia y apoya a la comunidad',
    subtitle: 'Tus datos son 100% anónimos',
    description: 'Crea mapas de calor personales para reclamar a tu proveedor con pruebas. Si decides aportar, tus métricas se anonimizan sin guardar MAC ni datos personales para alimentar el mapa público.',
    visualType: 'privacy',
  },
  {
    id: '4',
    badge: 'TU DECISIÓN',
    title: '¿Cómo deseas utilizar Know Your Signal?',
    subtitle: 'Puedes cambiar tu elección en cualquier momento',
    description: 'Elige si deseas aportar anónimamente al mapa comunitario o si prefieres utilizar la aplicación de forma estrictamente personal.',
    visualType: 'decision',
  },
];

// --- COMPONENTE DE TARJETAS GRÁFICAS ANIMADAS Y VISUALES ---
const SlideVisualCard = ({ type }: { type: SlideData['visualType'] }) => {
  if (type === 'radar') {
    return (
      <View style={styles.graphicCard}>
        <View style={styles.radarCircleOuter}>
          <View style={styles.radarCircleInner}>
            <Text style={styles.radarSignalText}>Muy Buena</Text>
          </View>
        </View>
        <View style={styles.wifiBadge}>
          <Text style={styles.wifiBadgeText}>📶 Wi-Fi Privada</Text>
        </View>
      </View>
    );
  }

  if (type === 'building') {
    return (
      <View style={styles.graphicCard}>
        <View style={styles.buildingContainer}>
          <View style={[styles.floorRow, { backgroundColor: '#E2F0E8' }]}>
            <Text style={styles.floorLabel}>Piso 3</Text>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.floorStatus}>Buena señal</Text>
          </View>
          <View style={[styles.floorRow, { backgroundColor: '#FFF8E6' }]}>
            <Text style={styles.floorLabel}>Piso 2</Text>
            <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
            <Text style={styles.floorStatus}>Señal media</Text>
          </View>
          <View style={[styles.floorRow, { backgroundColor: '#FDECEE' }]}>
            <Text style={styles.floorLabel}>Piso -1</Text>
            <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
            <Text style={styles.floorStatus}>Punto ciego</Text>
          </View>
        </View>
      </View>
    );
  }

  if (type === 'privacy') {
    return (
      <View style={styles.graphicCard}>
        <View style={styles.shieldContainer}>
          <Text style={styles.shieldIcon}>🛡️</Text>
          <Text style={styles.shieldTitle}>Sin MAC Address · Sin Nombre</Text>
          <Text style={styles.shieldSubtitle}>Sincronización en segundo plano anonimizada</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.graphicCard}>
      <View style={styles.decisionIconContainer}>
        <Text style={{ fontSize: 40 }}>🤝</Text>
        <Text style={styles.decisionTitle}>Comunidad vs Privado</Text>
      </View>
    </View>
  );
};

export const OnboardingScreen = ({ navigation }: any) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisionModal, setDecisionModal] = useState<'accept' | 'reject' | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const confirmNavigation = (acceptedOptIn: boolean) => {
    console.log(`Guardar consentimiento (Opt-in = ${acceptedOptIn})`);
    setDecisionModal(null);
    navigation.replace('MainTabs');
  };

  const renderSlideItem = ({ item }: { item: SlideData }) => {
    const isLastSlide = item.id === '4';

    return (
      <View style={styles.slideWrapper}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
        <SlideVisualCard type={item.visualType} />
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>

        {isLastSlide ? (
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setDecisionModal('accept')}>
              <Text style={styles.primaryButtonText}>Aceptar aporte comunitario</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setDecisionModal('reject')}>
              <Text style={styles.secondaryButtonText}>Solo uso personal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.nextButton} 
            onPress={() => flatListRef.current?.scrollToIndex({ index: currentIndex + 1 })}
          >
            <Text style={styles.nextButtonText}>Siguiente paso  →</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
      <View style={styles.headerCoBranding}>
        <View style={styles.brandBox}>
          <Text style={styles.kysLogoText}>Know Your Signal</Text>
          <Text style={styles.kysSubtext}>Mapeo de Red Interior</Text>
        </View>
        <View style={styles.gtdDivider} />
        <View style={styles.gtdContainer}>
          <Text style={styles.gtdLabel}>Desafío</Text>
          <Image 
            source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Logo_GTD.svg/1200px-Logo_GTD.svg.png' }} 
            style={styles.gtdLogoImage}
            resizeMode="contain"
          />
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        renderItem={renderSlideItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      />

      <View style={styles.paginationContainer}>
        {ONBOARDING_SLIDES.map((_, index) => (
          <View key={index} style={[styles.paginationDot, currentIndex === index && styles.paginationDotActive]} />
        ))}
      </View>

      <Modal visible={decisionModal !== null} transparent animationType="fade" onRequestClose={() => setDecisionModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {decisionModal === 'accept' ? (
              <>
                <Text style={styles.modalEmoji}>🎉</Text>
                <Text style={styles.modalTitle}>¡Muchas gracias por aportar!</Text>
                <Text style={styles.modalBody}>
                  Tus mediciones anónimas ayudarán a construir el mapa comunitario de cobertura.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => confirmNavigation(true)}>
                  <Text style={styles.primaryButtonText}>¡Comenzar a medir!</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalEmoji}>🔒</Text>
                <Text style={styles.modalTitle}>¿Estás seguro que prefieres no aportar?</Text>
                <Text style={styles.modalBody}>
                  Tu experiencia se mantendrá privada. Recuerda que nunca recopilamos datos personales.
                </Text>
                <View style={{ gap: 10, width: '100%' }}>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => confirmNavigation(false)}>
                    <Text style={styles.primaryButtonText}>Sí, continuar solo en privado</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setDecisionModal('accept')}>
                    <Text style={styles.secondaryButtonText}>Cambiar opción y Aportar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: COLORS.surface },
  headerCoBranding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: COLORS.cardBg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  brandBox: { flex: 1 },
  kysLogoText: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  kysSubtext: { fontSize: 11, color: COLORS.textMuted },
  gtdDivider: { width: 1, height: 28, backgroundColor: COLORS.border, marginHorizontal: 16 },
  gtdContainer: { alignItems: 'flex-end' },
  gtdLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  gtdLogoImage: { width: 60, height: 24 },
  slideWrapper: { width: width, paddingHorizontal: 28, paddingVertical: 16, justifyContent: 'center' },
  badgeContainer: { alignSelf: 'flex-start', backgroundColor: '#EBF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 16 },
  badgeText: { color: COLORS.primary, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.8 },
  graphicCard: { height: 170, backgroundColor: COLORS.cardBg, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  radarCircleOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#EBF2FF', justifyContent: 'center', alignItems: 'center' },
  radarCircleInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  radarSignalText: { color: COLORS.textLight, fontWeight: 'bold', fontSize: 12 },
  wifiBadge: { marginTop: 10, backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  wifiBadgeText: { fontSize: 12, color: COLORS.textDark, fontWeight: '600' },
  buildingContainer: { width: '85%', gap: 8 },
  floorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'space-between' },
  floorLabel: { fontWeight: 'bold', fontSize: 13, color: COLORS.textDark },
  dot: { width: 8, height: 8, borderRadius: 4 },
  floorStatus: { fontSize: 12, color: COLORS.textDark },
  shieldContainer: { alignItems: 'center' },
  shieldIcon: { fontSize: 36, marginBottom: 6 },
  shieldTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark },
  shieldSubtitle: { fontSize: 12, color: COLORS.textMuted },
  decisionIconContainer: { alignItems: 'center' },
  decisionTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginTop: 8 },
  slideTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 6 },
  slideSubtitle: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginBottom: 12 },
  slideDescription: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20, marginBottom: 20 },
  nextButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', width: '100%' },
  nextButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  actionButtonGroup: { gap: 10, width: '100%' },
  primaryButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', width: '100%' },
  primaryButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  secondaryButton: { backgroundColor: 'transparent', paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, gap: 8 },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C4D4F2' },
  paginationDotActive: { width: 24, backgroundColor: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: COLORS.modalOverlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard: { width: '100%', backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 24, alignItems: 'center', elevation: 5 },
  modalEmoji: { fontSize: 48, marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'center', marginBottom: 10 },
  modalBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
});