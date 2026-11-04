// App.tsx
import React, { useRef, useEffect } from 'react';
import {
  StatusBar,
  Text,
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from './src/theme/theme';
import { SettingsProvider } from './src/state/SettingsContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { WizardScreen } from './src/screens/WizardScreen';
import { FloorScreen } from './src/screens/FloorScreen';
import { PersonalMapScreen } from './src/screens/PersonalMapScreen';
import { PublicMapScreen } from './src/screens/PublicMapScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

// --- TRANSICIÓN SUAVE PARA PANTALLAS (SE EJECUTA EN CADA VISITA) ---
const SmoothScreenWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isFocused = useIsFocused();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(14)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    if (isFocused) {
      fadeAnim.setValue(0);
      translateYAnim.setValue(14);
      scaleAnim.setValue(0.98);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          tension: 75,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 75,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      translateYAnim.setValue(14);
      scaleAnim.setValue(0.98);
    }
  }, [isFocused, fadeAnim, translateYAnim, scaleAnim]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        transform: [{ translateY: translateYAnim }, { scale: scaleAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// --- HEADER GLOBAL CON CO-BRANDING GTD ---
const CustomAppHeader = () => (
  <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
    <View style={styles.headerCoBranding}>
      <View style={styles.brandBox}>
        <View style={styles.titleRow}>
          <View style={styles.statusDot} />
          <Text style={styles.kysLogoText}>Know Your Signal</Text>
        </View>
        <Text style={styles.kysSubtext}>Mapeo Colaborativo de Red Interior</Text>
      </View>
      <View style={styles.gtdDivider} />
      <View style={styles.gtdContainer}>
        <Text style={styles.gtdLabel}>Desafío</Text>
        <Image
          source={{
            uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Logo_GTD.svg/1200px-Logo_GTD.svg.png',
          }}
          style={styles.gtdLogoImage}
          resizeMode="contain"
        />
      </View>
    </View>
  </SafeAreaView>
);

// --- ITEM INDIVIDUAL DEL TAB CON FÍSICA DE RESORTE (SPRING) ---
interface AnimatedTabItemProps {
  route: any;
  label: string;
  isFocused: boolean;
  onPress: () => void;
}

const AnimatedTabItem: React.FC<AnimatedTabItemProps> = ({ route, label, isFocused, onPress }) => {
  const animProgress = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(animProgress, {
      toValue: isFocused ? 1 : 0,
      tension: 65,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [isFocused, animProgress]);

  const animatedFlex = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1.35, 0.65],
  });

  const animatedBgColor = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(232, 240, 255, 0)', COLORS.assistantGlow],
  });

  const animatedBorderColor = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(32, 93, 245, 0)', COLORS.primary],
  });

  const labelMaxWidth = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [90, 0],
  });

  const labelOpacity = animProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0, 0],
  });

  const labelMarginLeft = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  const iconScale = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.2],
  });

  let iconEmoji = '📍';
  if (route.name === 'WizardTab') iconEmoji = '📍';
  else if (route.name === 'MapaPersonal') iconEmoji = '🗺️';
  else if (route.name === 'MapaPublico') iconEmoji = '🌐';
  else if (route.name === 'Ajustes') iconEmoji = '⚙️';

  return (
    <Animated.View
      style={[
        styles.tabButtonWrapper,
        {
          flex: animatedFlex,
          backgroundColor: animatedBgColor,
          borderColor: animatedBorderColor,
        },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        onPress={onPress}
        activeOpacity={0.75}
        style={styles.tabPressableArea}
      >
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Text style={[styles.tabIcon, isFocused && styles.tabIconFocused]}>{iconEmoji}</Text>
        </Animated.View>

        <Animated.View
          style={{
            maxWidth: labelMaxWidth,
            opacity: labelOpacity,
            marginLeft: labelMarginLeft,
            overflow: 'hidden',
          }}
        >
          <Text numberOfLines={1} style={styles.tabLabelUnfocused}>
            {label}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// --- TAB BAR PERSONALIZADO ---
const AnimatedCustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarSafeArea}>
      <View style={styles.tabBarContainer}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? String(options.tabBarLabel)
              : options.title !== undefined
              ? String(options.title)
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <React.Fragment key={route.key}>
              <AnimatedTabItem
                route={route}
                label={label}
                isFocused={isFocused}
                onPress={onPress}
              />

              {index < state.routes.length - 1 && <View style={styles.tabSeparator} />}
            </React.Fragment>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

// --- NAVEGADORES ---
const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const WizardStack = createNativeStackNavigator();

const WizardStackNavigator = () => (
  <WizardStack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
    }}
  >
    <WizardStack.Screen name="Wizard" component={WizardScreen} />
    <WizardStack.Screen name="Floor" component={FloorScreen} />
  </WizardStack.Navigator>
);

const MainTabNavigator = () => (
  <Tab.Navigator
    tabBar={(props) => <AnimatedCustomTabBar {...props} />}
    screenOptions={{
      header: () => <CustomAppHeader />,
    }}
  >
    <Tab.Screen name="WizardTab" options={{ title: 'Medir' }}>
      {() => (
        <SmoothScreenWrapper>
          <WizardStackNavigator />
        </SmoothScreenWrapper>
      )}
    </Tab.Screen>
    <Tab.Screen name="MapaPersonal" options={{ title: 'Historial' }}>
      {(props) => (
        <SmoothScreenWrapper>
          <PersonalMapScreen {...props} />
        </SmoothScreenWrapper>
      )}
    </Tab.Screen>
    <Tab.Screen name="MapaPublico" options={{ title: 'Comunidad' }}>
      {() => (
        <SmoothScreenWrapper>
          <PublicMapScreen />
        </SmoothScreenWrapper>
      )}
    </Tab.Screen>
    <Tab.Screen name="Ajustes" options={{ title: 'Ajustes' }}>
      {() => (
        <SmoothScreenWrapper>
          <SettingsScreen />
        </SmoothScreenWrapper>
      )}
    </Tab.Screen>
  </Tab.Navigator>
);

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.cardBg} translucent={false} />
        <NavigationContainer>
          <RootStack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'fade_from_bottom',
            }}
          >
            <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
            <RootStack.Screen name="MainTabs" component={MainTabNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </SettingsProvider>
  );
}

// --- ESTILOS ---
const styles = StyleSheet.create({
  headerSafeArea: {
    backgroundColor: COLORS.cardBg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    zIndex: 10,
  },
  headerCoBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandBox: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  kysLogoText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, letterSpacing: 0.2 },
  kysSubtext: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, marginLeft: 16 },
  gtdDivider: { width: 1, height: 30, backgroundColor: COLORS.border, marginHorizontal: 16 },
  gtdContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  gtdLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  gtdLogoImage: { width: 58, height: 22 },
  tabBarSafeArea: {
    backgroundColor: COLORS.cardBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 8,
    backgroundColor: COLORS.cardBg,
  },
  tabButtonWrapper: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    marginHorizontal: 3,
    overflow: 'hidden',
  },
  tabPressableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabIcon: { fontSize: 16, opacity: 0.6 },
  tabIconFocused: { opacity: 1 },
  tabLabelUnfocused: { fontSize: 12, fontWeight: '700', color: COLORS.textDark },
  tabSeparator: {
    width: 1,
    height: 26,
    backgroundColor: '#1A1A1A',
    opacity: 0.28,
    alignSelf: 'center',
    marginHorizontal: 2,
  },
});