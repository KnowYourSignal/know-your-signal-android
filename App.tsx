import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { 
  SafeAreaProvider, 
  SafeAreaView 
} from 'react-native-safe-area-context';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList, 
  Dimensions, 
  Image, 
  StatusBar,
  Modal,
  Animated,
  Easing,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform
} from 'react-native';

const { width } = Dimensions.get('window');

// --- PALETA DE COLORES E IDENTIDAD VISUAL ---
const COLORS = {
  primary: '#205DF5',      
  gtdBlue: '#0038A8',      
  surface: '#F4F7FF',      
  cardBg: '#FFFFFF',       
  textDark: '#183369',     
  textMuted: '#5C6E91',    
  textLight: '#FFFFFF',    
  success: '#278B58',      
  warning: '#D6A521',      
  danger: '#CB4444',       
  border: '#D8E2F5',       
  assistantGlow: '#E8F0FF',
  modalOverlay: 'rgba(10, 25, 55, 0.65)',
};

// --- CONTEXTO PARA EL MODO TÉCNICO ---
const SettingsContext = createContext({
  technicalMode: false,
  toggleTechnicalMode: () => {},
});

const formatSignal = (dbm: number, isTechnical: boolean) => {
  if (isTechnical) return `${dbm} dBm`;
  if (dbm >= -67) return "Muy Buena";
  if (dbm >= -75) return "Intermedia";
  return "Débil";
};

const getSignalColor = (dbm: number) => {
  if (dbm >= -67) return COLORS.success;
  if (dbm >= -75) return COLORS.warning;
  return COLORS.danger;
};

// --- COMPONENTE DE PUNTO DE CALOR DEGRADADO (8 CAPAS SUPERPUESTAS) ---
const HeatmapPoint = ({ lat, lng, color, dbm, isTechnical }: { lat: string, lng: string, color: string, dbm: number, isTechnical: boolean }) => (
  <View style={[styles.heatmapPointContainer, { top: lat as any, left: lng as any }]}>
    <View style={[styles.heatLayer1, { backgroundColor: color }]} />
    <View style={[styles.heatLayer2, { backgroundColor: color }]} />
    <View style={[styles.heatLayer3, { backgroundColor: color }]} />
    <View style={[styles.heatLayer4, { backgroundColor: color }]} />
    <View style={[styles.heatLayer5, { backgroundColor: color }]} />
    <View style={[styles.heatLayer6, { backgroundColor: color }]} />
    <View style={[styles.heatLayer7, { backgroundColor: color }]} />
    <View style={[styles.heatLayer8, { backgroundColor: color }]} />
    
    {isTechnical && (
      <Text style={styles.heatDbmLabel}>{dbm}</Text>
    )}
  </View>
);

// --- TIPOS DE NAVEGACIÓN ---
type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
};

type MainTabParamList = {
  WizardTab: undefined;
  MapaPersonal: undefined;
  MapaPublico: undefined;
  Ajustes: undefined;
};

type WizardStackParamList = {
  Wizard: undefined;
  Floor: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const WizardStack = createNativeStackNavigator<WizardStackParamList>();

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

// --- PANTALLA 1: ONBOARDING CON SLIDERS Y MODALES DE CONFIRMACIÓN ---
const OnboardingScreen = ({ navigation }: any) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisionModal, setDecisionModal] = useState<'accept' | 'reject' | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const confirmNavigation = (acceptedOptIn: boolean) => {
    console.log(`Función por desarrollar: Guardar consentimiento (Opt-in = ${acceptedOptIn})`);
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

// --- PANTALLA 2: WIZARD DE CAPTURA ---
const WizardScreen = ({ navigation }: any) => {
  const { technicalMode } = useContext(SettingsContext);
  const [tourStep, setTourStep] = useState<number | null>(0);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const mockDbm = -68;

  useEffect(() => {
    const bounceLoop = Animated.loop(
      Animated.sequence([
        // Cambiado useNativeDriver a false para sincronizar el hitbox del botón "Siguiente"
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

    // Cambiado useNativeDriver a false para resolver problemas de toque en Android
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
            <Text style={[styles.cardValue, { color: COLORS.success }]}>8 metros (Estable)</Text>
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

        <Text style={styles.statusFooter}>Estado de sensor: READY</Text>

        {tourStep !== null && tourStep > 0 && (
          <Animated.View pointerEvents="box-none" style={[styles.floatingOverlayContainer, { transform: [{ translateY: slideAnim }] }]}>
            <Animated.View pointerEvents="box-none" style={{ transform: [{ translateY: bounceAnim }] }}>
              {(tourStep === 1 || tourStep === 2) && <View style={styles.arrowUpPointer} />}
              <View style={[styles.arrowUpPointer, tourStep === 3 ? { alignSelf: 'center', marginLeft: 0 } : {}]} />
              <View style={styles.floatingBubbleCard}>
                <Text style={styles.floatingBubbleText}>
                  {tourStep === 1 && "Esta es la precisión del GPS. Debe ser menor a 10m para habilitar."}
                  {tourStep === 2 && `Aquí detectamos automáticamente la red y su calidad.`}
                  {tourStep === 3 && "Este es el botón para guardar la muestra e ir al selector de piso."}
                </Text>
                <TouchableOpacity style={styles.sigButton} onPress={() => setTourStep(tourStep < 3 ? tourStep + 1 : null)}>
                  <Text style={styles.sigButtonText}>{tourStep === 3 ? "¡Entendido! ✨" : "Sig. →"}</Text>
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

// --- PANTALLA 3: SELECTOR DE PISO Y TAMAÑO ---
const FloorScreen = ({ navigation, route }: any) => {
  const { technicalMode } = useContext(SettingsContext);
  const [piso, setPiso] = useState('');
  const [tamano, setTamano] = useState('Mediano');
  const [showSavedModal, setShowSavedModal] = useState(false);
  const capturedDbm = route.params?.dbm || -68;

  const SIZES = ['Pequeño', 'Mediano', 'Grande', 'Muy Grande'];
  const SIZE_DESCRIPTIONS: Record<string, string> = {
    'Pequeño': 'Ej: Habitación, oficina personal o baño (hasta 20 m²).',
    'Mediano': 'Ej: Living, sala de clases o recepción (20 a 50 m²).',
    'Grande': 'Ej: Auditorio, pasillo largo o hall (50 a 100 m²).',
    'Muy Grande': 'Ej: Bodega, gimnasio o patio techado (+100 m²).'
  };

  const handleGuardar = () => {
    if (!piso) {
      alert("Por favor, ingresa el piso en el que te encuentras.");
      return;
    }
    setShowSavedModal(true);
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.screenBody}>
          <Text style={styles.screenTitle}>Completar captura</Text>
          <Text style={styles.screenSubtitle}>Lectura capturada: {formatSignal(capturedDbm, technicalMode)}</Text>
          
          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>Ingresa el Piso / Nivel (Ej: -2, 1, 15):</Text>
            <TextInput 
              style={styles.numericInput}
              keyboardType="numbers-and-punctuation"
              placeholder="Escribe el número del piso"
              placeholderTextColor={COLORS.textMuted}
              value={piso}
              onChangeText={setPiso}
            />
          </View>

          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>Tamaño estimado del recinto:</Text>
            <View style={styles.optionsGrid}>
              {SIZES.map((t) => (
                <TouchableOpacity key={t} style={[styles.gridChip, tamano === t && styles.gridChipActive]} onPress={() => setTamano(t)}>
                  <Text style={[styles.gridChipText, tamano === t && styles.gridChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.tooltipBox}>
              <Text style={styles.tooltipIcon}>ℹ️</Text>
              <Text style={styles.tooltipText}>{SIZE_DESCRIPTIONS[tamano]}</Text>
            </View>
          </View>

          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleGuardar}>
              <Text style={styles.primaryButtonText}>Guardar medición local</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
              <Text style={styles.secondaryButtonText}>Descartar captura</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSavedModal} transparent animationType="fade" onRequestClose={() => setShowSavedModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>✅</Text>
            <Text style={styles.modalTitle}>¡Medición guardada!</Text>
            <Text style={styles.modalBody}>¿Quieres registrar una nueva señal en este recinto, o prefieres revisar la evidencia en tu mapa personal?</Text>
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => { setShowSavedModal(false); navigation.navigate('Wizard'); }}>
                <Text style={styles.primaryButtonText}>Hacer otra medición</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { setShowSavedModal(false); navigation.navigate('MapaPersonal'); }}>
                <Text style={styles.secondaryButtonText}>Ver el mapa</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// --- PANTALLA 4: MAPA PERSONAL (HEATMAP MULTICAPA CERCANO) ---
const PersonalMapScreen = () => {
  const { technicalMode } = useContext(SettingsContext);
  const [pisoActivo, setPisoActivo] = useState('1');

  // MOCK DATA: Puntos muy cercanos entre sí para forzar el degradado
  const MOCK_MEASUREMENTS = [
    // --- PISO 1 (Pasillo escaneado en diagonal) ---
    // Zona Verde (Buena señal cerca del router)
    { id: '1', lat: '30%', lng: '30%', floor: '1', dbm: -58 },
    { id: '2', lat: '31%', lng: '28%', floor: '1', dbm: -61 },
    { id: '3', lat: '28%', lng: '32%', floor: '1', dbm: -60 },
    { id: '4', lat: '32%', lng: '34%', floor: '1', dbm: -64 },
    { id: '5', lat: '29%', lng: '29%', floor: '1', dbm: -66 },
    
    // Transición a Amarillo (Caminando por el pasillo)
    { id: '6', lat: '36%', lng: '38%', floor: '1', dbm: -69 },
    { id: '7', lat: '38%', lng: '40%', floor: '1', dbm: -72 },
    { id: '8', lat: '41%', lng: '44%', floor: '1', dbm: -74 },
    { id: '9', lat: '44%', lng: '46%', floor: '1', dbm: -76 },
    { id: '10', lat: '47%', lng: '49%', floor: '1', dbm: -78 },
    
    // Zona Amarilla Central
    { id: '11', lat: '51%', lng: '53%', floor: '1', dbm: -75 },
    { id: '12', lat: '53%', lng: '51%', floor: '1', dbm: -80 },
    
    // Transición a Rojo
    { id: '13', lat: '57%', lng: '58%', floor: '1', dbm: -84 },
    { id: '14', lat: '60%', lng: '61%', floor: '1', dbm: -86 },
    
    // Zona Roja (Punto Ciego / Fondo de la sala)
    { id: '15', lat: '64%', lng: '65%', floor: '1', dbm: -92 },
    { id: '16', lat: '66%', lng: '63%', floor: '1', dbm: -95 },
    { id: '17', lat: '63%', lng: '67%', floor: '1', dbm: -90 },
    { id: '18', lat: '68%', lng: '68%', floor: '1', dbm: -88 },
    { id: '19', lat: '65%', lng: '70%', floor: '1', dbm: -98 },

    // --- PISO 2 (ZONA COMPACTA) ---
    { id: '20', lat: '45%', lng: '45%', floor: '2', dbm: -50 },
    { id: '21', lat: '46%', lng: '46%', floor: '2', dbm: -55 },
    { id: '22', lat: '44%', lng: '47%', floor: '2', dbm: -62 },

    // --- PISO -1 (SÓTANO, PURO ROJO) ---
    { id: '23', lat: '50%', lng: '50%', floor: '-1', dbm: -90 },
    { id: '24', lat: '51%', lng: '52%', floor: '-1', dbm: -95 },
  ];

  const datosVisibles = MOCK_MEASUREMENTS.filter(m => m.floor === pisoActivo);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <View style={styles.screenHeaderRow}>
          <View>
            <Text style={styles.screenTitle}>Mi Historial</Text>
            <Text style={styles.screenSubtitle}>Filtro Wi-Fi Activo</Text>
          </View>
        </View>

        {/* SELECTOR DE PISOS DINÁMICO */}
        <View style={styles.mapFloorSelector}>
          {['-1', '1', '2', '3'].map((piso) => (
            <TouchableOpacity 
              key={piso} 
              style={[styles.floorTab, pisoActivo === piso && styles.floorTabActive]}
              onPress={() => setPisoActivo(piso)}
            >
              <Text style={[styles.floorTabText, pisoActivo === piso && styles.floorTabTextActive]}>
                Piso {piso}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* LIENZO DEL MAPA CON HEATMAP MULTICAPA */}
        <View style={styles.mapCanvasPlaceholder}>
          <Text style={styles.mapCanvasText}>Mapa Base (Google Maps / OSM)</Text>
          
          {datosVisibles.length === 0 ? (
            <View style={styles.emptyMapState}>
              <Text style={styles.emptyMapText}>No hay mediciones guardadas en el Piso {pisoActivo}</Text>
            </View>
          ) : (
            datosVisibles.map((punto) => (
              <HeatmapPoint 
                key={punto.id}
                lat={punto.lat}
                lng={punto.lng}
                color={getSignalColor(punto.dbm)}
                dbm={punto.dbm}
                isTechnical={technicalMode}
              />
            ))
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Exportar evidencia a mi proveedor</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- PANTALLA 5: MAPA PÚBLICO COMUNITARIO ---
const PublicMapScreen = () => {
  const { technicalMode } = useContext(SettingsContext);
  const [pisoActivo, setPisoActivo] = useState('1');

  // MOCK DATA PÚBLICO
  const MOCK_COMMUNITY = [
    { id: 'c1', lat: '40%', lng: '40%', floor: '1', dbm: -63 },
    { id: 'c2', lat: '42%', lng: '42%', floor: '1', dbm: -75 },
    { id: 'c3', lat: '44%', lng: '44%', floor: '1', dbm: -92 },
  ];

  const datosVisibles = MOCK_COMMUNITY.filter(m => m.floor === pisoActivo);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <Text style={styles.screenTitle}>Mapa Comunitario</Text>
        <Text style={styles.screenSubtitle}>Celdas agregadas anónimas</Text>
        
        <View style={styles.mapFloorSelector}>
          {['-1', '1', '2', '3'].map((piso) => (
            <TouchableOpacity 
              key={piso} 
              style={[styles.floorTab, pisoActivo === piso && styles.floorTabActive]}
              onPress={() => setPisoActivo(piso)}
            >
              <Text style={[styles.floorTabText, pisoActivo === piso && styles.floorTabTextActive]}>Piso {piso}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.mapCanvasPlaceholder}>
          <Text style={styles.mapCanvasText}>(Agregados espaciales Supabase / PostGIS)</Text>
          
          {datosVisibles.length === 0 ? (
            <View style={styles.emptyMapState}>
              <Text style={styles.emptyMapText}>Sin datos comunitarios en el Piso {pisoActivo}</Text>
            </View>
          ) : (
            datosVisibles.map((punto) => (
              <HeatmapPoint 
                key={punto.id}
                lat={punto.lat}
                lng={punto.lng}
                color={getSignalColor(punto.dbm)}
                dbm={punto.dbm}
                isTechnical={technicalMode}
              />
            ))
          )}
        </View>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Actualizar zona</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- PANTALLA 6: AJUSTES ---
const SettingsScreen = () => {
  const { technicalMode, toggleTechnicalMode } = useContext(SettingsContext);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['bottom']}>
      <View style={styles.screenBody}>
        <Text style={styles.screenTitle}>Ajustes y Privacidad</Text>
        <Text style={styles.screenSubtitle}>Configuración general de la aplicación</Text>
        
        <View style={styles.cardContainer}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardValue}>Activar Modo Técnico</Text>
              <Text style={styles.cardHelp}>Muestra los valores exactos en dBm en lugar de textos simples (Buena/Mala).</Text>
            </View>
            <Switch 
              value={technicalMode} 
              onValueChange={toggleTechnicalMode}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.cardBg}
            />
          </View>
        </View>

        <View style={styles.cardContainer}>
          <Text style={styles.cardLabel}>Estado actual:</Text>
          <Text style={[styles.cardValue, { color: COLORS.success }]}>Aporte comunitario activo (Anónimo)</Text>
          <Text style={styles.cardHelp}>Tus mediciones ayudan a mapear zonas sin internet.</Text>
        </View>

        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: COLORS.danger, marginTop: 'auto' }]}>
          <Text style={styles.primaryButtonText}>Revocar consentimiento comunitario</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- NAVEGADORES ---
const WizardStackNavigator = () => (
  <WizardStack.Navigator screenOptions={{ headerShown: false }}>
    <WizardStack.Screen name="Wizard" component={WizardScreen} />
    <WizardStack.Screen name="Floor" component={FloorScreen} />
  </WizardStack.Navigator>
);

const MainTabNavigator = () => (
  <Tab.Navigator 
    screenOptions={({ route }) => ({ 
      headerStyle: { backgroundColor: COLORS.primary },
      headerTintColor: COLORS.textLight,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: 'gray',
      tabBarIcon: ({ focused, color }) => {
        let iconEmoji = '';
        if (route.name === 'WizardTab') iconEmoji = '📍';
        else if (route.name === 'MapaPersonal') iconEmoji = '🗺️';
        else if (route.name === 'MapaPublico') iconEmoji = '🌐';
        else if (route.name === 'Ajustes') iconEmoji = '⚙️';
        
        return (
          <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>
            {iconEmoji}
          </Text>
        );
      }
    })}
  >
    <Tab.Screen name="WizardTab" component={WizardStackNavigator} options={{ title: 'Medir' }} />
    <Tab.Screen name="MapaPersonal" component={PersonalMapScreen} options={{ title: 'Mi Historial' }} />
    <Tab.Screen name="MapaPublico" component={PublicMapScreen} options={{ title: 'Comunidad' }} />
    <Tab.Screen name="Ajustes" component={SettingsScreen} options={{ title: 'Ajustes' }} />
  </Tab.Navigator>
);

// --- COMPONENTE PRINCIPAL (PROVIDER Y ROOT) ---
export default function App() {
  const [technicalMode, setTechnicalMode] = useState(false);
  const toggleTechnicalMode = () => setTechnicalMode(!technicalMode);

  return (
    <SettingsContext.Provider value={{ technicalMode, toggleTechnicalMode }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.cardBg} translucent={false} />
        <NavigationContainer>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
            <RootStack.Screen name="MainTabs" component={MainTabNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </SettingsContext.Provider>
  );
}

// --- ESTILOS COMPLETOS ---
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
  nextButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  nextButtonText: { color: COLORS.textLight, fontSize: 15, fontWeight: 'bold' },
  actionButtonGroup: { gap: 10 },
  primaryButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
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
  selectorBlock: { marginBottom: 24 },
  selectorLabel: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 12 },
  numericInput: { backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.textDark },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border },
  gridChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  gridChipText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  gridChipTextActive: { color: COLORS.textLight },
  tooltipBox: { marginTop: 12, padding: 12, backgroundColor: '#EBF2FF', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tooltipIcon: { fontSize: 16 },
  tooltipText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  
  // ESTILOS MAPA Y HEATMAP
  mapFloorSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  floorTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border },
  floorTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  floorTabText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  floorTabTextActive: { color: COLORS.textLight },
  mapCanvasPlaceholder: { flex: 1, backgroundColor: '#E2E8F0', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  mapCanvasText: { color: COLORS.textMuted, fontWeight: 'bold', zIndex: -1 },
  emptyMapState: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.85)', padding: 12, borderRadius: 8 },
  emptyMapText: { color: COLORS.textMuted, fontWeight: 'bold' },
  
  // ESTILOS DEGRADADO DE CALOR (8 CAPAS SUPERPUESTAS)
  heatmapPointContainer: {
    position: 'absolute',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -70 }, { translateY: -70 }], 
  },
  heatLayer1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, opacity: 0.04 },
  heatLayer2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.06 },
  heatLayer3: { position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.08 },
  heatLayer4: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  heatLayer5: { position: 'absolute', width: 60, height: 60, borderRadius: 30, opacity: 0.18 },
  heatLayer6: { position: 'absolute', width: 40, height: 40, borderRadius: 20, opacity: 0.25 },
  heatLayer7: { position: 'absolute', width: 25, height: 25, borderRadius: 12.5, opacity: 0.4 },
  heatLayer8: { position: 'absolute', width: 10, height: 10, borderRadius: 5, opacity: 0.7 },
  
  heatDbmLabel: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    position: 'absolute',
  }
});