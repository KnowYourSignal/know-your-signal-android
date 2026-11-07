import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { Icon, type IconName } from './src/components/Icon';
import { MotionProvider, useReducedMotion } from './src/components/Motion';
import { BrandHeader, StatePanel } from './src/components/UI';
import { SettingsProvider, useSettings } from './src/state/SettingsContext';
import type { MainTabsParamList, RootParamList } from './src/state/WizardState';
import { COLORS } from './src/theme/theme';
import { globalStyles as g } from './src/theme/globalStyles';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { WizardScreen } from './src/screens/WizardScreen';
import { FloorScreen } from './src/screens/FloorScreen';
import { PersonalMapScreen } from './src/screens/PersonalMapScreen';
import { PublicMapScreen } from './src/screens/PublicMapScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { fieldworkAvailable } from './src/services/LocalRepositoryAdapter';

const Stack = createNativeStackNavigator<RootParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.surface,
    card: COLORS.cardBg,
    primary: COLORS.primary,
    border: COLORS.border,
  },
};

function tabIcon(name: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Icon name={name} color={color} size={21} />
    </View>
  );
}

const tabIcons = {
  Medir: tabIcon('radar'),
  MapaPersonal: tabIcon('map'),
  MapaPublico: tabIcon('globe'),
  Ajustes: tabIcon('settings'),
};

function MainTabs() {
  const reduced = useReducedMotion();
  const { bottom } = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: BrandHeader,
        animation: reduced ? 'none' : 'fade',
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: [styles.tabBar, { height: 62 + bottom }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: tabIcons[route.name],
      })}
    >
      <Tab.Screen name="Medir" component={WizardScreen} />
      <Tab.Screen
        name="MapaPersonal"
        component={PersonalMapScreen}
        options={{ title: 'Mi historial' }}
      />
      <Tab.Screen
        name="MapaPublico"
        component={PublicMapScreen}
        options={{ title: 'Comunidad' }}
      />
      <Tab.Screen name="Ajustes" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { status, loadError, refresh } = useSettings();
  const reduced = useReducedMotion();

  if (!status) {
    return (
      <View style={g.screen}>
        <BrandHeader />
        <View style={styles.launch}>
          {loadError ? (
            <StatePanel
              icon="info"
              title={
                fieldworkAvailable
                  ? 'No pudimos abrir tu historial'
                  : 'Know Your Signal para Android'
              }
              body={
                fieldworkAvailable
                  ? 'Intenta volver a abrir el almacenamiento local.'
                  : 'Las mediciones y el historial local están disponibles en la aplicación Android.'
              }
              action={
                fieldworkAvailable
                  ? { label: 'Reintentar', onPress: refresh }
                  : undefined
              }
            />
          ) : (
            <StatePanel
              icon="radar"
              title="Preparando tu espacio"
              body="Abriendo tu historial y tus preferencias."
              busy
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: reduced ? 'none' : 'fade_from_bottom',
        }}
      >
        {status.choice === 'undecided' ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="Floor"
              component={FloorScreen}
              options={{ headerShown: true, header: BrandHeader }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MotionProvider>
        <SettingsProvider>
          <StatusBar barStyle="dark-content" />
          <AppNavigator />
        </SettingsProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, justifyContent: 'center' },
  tabBar: {
    backgroundColor: COLORS.cardBg,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
  tabIcon: {
    minWidth: 48,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 11,
  },
  tabIconActive: { backgroundColor: COLORS.assistantGlow },
  tabLabel: { fontSize: 11, fontWeight: '700', paddingBottom: 2 },
});
