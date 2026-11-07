import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Reveal } from '../components/Motion';
import {
  BrandHeader,
  Button,
  ChoiceTile,
  ProgressSteps,
  ScreenTitle,
  StatusPill,
} from '../components/UI';
import { useSettings } from '../state/SettingsContext';
import { COLORS } from '../theme/theme';
import { globalStyles as g } from '../theme/globalStyles';

const slides = [
  {
    eyebrow: '01 · COBERTURA INTERIOR',
    title: 'Conoce la señal de tu espacio',
    subtitle:
      'Mide Wi-Fi y datos móviles. Descubre dónde la conexión es favorable y dónde conviene mejorarla.',
  },
  {
    eyebrow: '02 · MEDICIÓN GUIADA',
    title: 'Registra por piso',
    subtitle:
      'Espera una lectura precisa y confirma el nivel y el tamaño del recinto. Así puedes comparar espacios del mismo edificio.',
  },
  {
    eyebrow: '03 · PRIVACIDAD',
    title: 'Tu historial viaja contigo',
    subtitle:
      'Revisa tus mediciones sin conexión y crea evidencia para compartir cuando tú decidas.',
  },
  {
    eyebrow: '04 · TU DECISIÓN',
    title: 'Elige cómo participar',
    subtitle: 'Puedes cambiar esta preferencia desde Ajustes.',
  },
];

function Illustration({ step }: { step: number }) {
  if (step === 0) {
    return (
      <View style={s.hero} importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height={168} viewBox="0 0 310 168">
          <Path
            d="M155 12v144 M32 84h246"
            stroke="#A6BCFA"
            strokeDasharray="3 6"
          />
          {[24, 45, 66].map(radius => (
            <Circle
              key={radius}
              cx={155}
              cy={84}
              r={radius}
              fill="none"
              stroke="#87AAF8"
              strokeWidth={1}
            />
          ))}
          <Circle cx={155} cy={84} r={14} fill={COLORS.primary} />
          <Circle cx={197} cy={53} r={6} fill="#54C393" />
          <Circle cx={104} cy={100} r={4} fill="#7196F3" />
        </Svg>
        <View style={s.heroBadge}>
          <StatusPill label="Vista previa de señal" />
        </View>
      </View>
    );
  }
  if (step === 1) {
    return (
      <View
        style={[s.hero, s.floors]}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={s.visualCaption}>
          <Icon name="building" size={18} />
          <Text style={g.caption}>Ejemplo de un recinto</Text>
        </View>
        <StatusPill label="Piso 3 · Señal favorable" tone="green" />
        <StatusPill label="Piso 2 · Señal intermedia" tone="amber" />
        <StatusPill label="Piso −1 · Señal débil" tone="red" />
      </View>
    );
  }
  return (
    <View
      style={[s.hero, s.privacyHero]}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={s.shield}>
        <Icon name="shield" color={COLORS.primary} size={47} />
      </View>
      <Text style={g.sectionTitle}>Historial en tu teléfono</Text>
      <Text style={g.caption}>Aporte comunitario opcional</Text>
    </View>
  );
}

export function OnboardingScreen() {
  const { status, setConsent } = useSettings();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const finalStep = step === slides.length - 1;
  const slide = slides[step];

  function goTo(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  async function finish() {
    if (choice === null || saving.current) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(false);
    try {
      await setConsent(choice);
    } catch {
      setError(true);
      setBusy(false);
    } finally {
      saving.current = false;
    }
  }

  return (
    <View style={g.screen}>
      <BrandHeader />
      <SafeAreaView edges={['bottom']} style={g.screen}>
        <ScrollView ref={scroll} contentContainerStyle={[g.content, s.content]}>
          <ProgressSteps count={slides.length} current={step} />
          <Reveal key={step} style={s.slide}>
            <ScreenTitle {...slide} />
            {finalStep ? (
              <>
                <ChoiceTile
                  label="Solo uso personal"
                  detail="Guarda las capturas en este teléfono."
                  icon="lock"
                  selected={choice === false}
                  disabled={busy}
                  onPress={() => setChoice(false)}
                />
                <ChoiceTile
                  label="Aportar a la comunidad"
                  detail={
                    status?.syncAvailable
                      ? 'Comparte futuras capturas para construir el mapa agregado.'
                      : 'Disponible al configurar el servicio en esta instalación.'
                  }
                  icon="globe"
                  selected={choice === true}
                  disabled={busy || !status?.syncAvailable}
                  onPress={() => setChoice(true)}
                />
                <View style={[g.card, s.notice]}>
                  <Icon name="shield" size={20} />
                  <Text style={[g.caption, s.flex]}>
                    Si aportas, enviamos coordenadas, intensidad, piso y hora
                    asociados a una cuenta técnica. El mapa comunitario muestra
                    celdas agregadas. Puedes detener los aportes futuros desde
                    Ajustes.
                  </Text>
                </View>
              </>
            ) : (
              <Illustration step={step} />
            )}
            {error && (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                No pudimos guardar tu elección. Inténtalo de nuevo.
              </Text>
            )}
          </Reveal>
        </ScrollView>
        <View style={s.actions}>
          {step > 0 && (
            <Button
              label="Atrás"
              kind="quiet"
              onPress={() => goTo(step - 1)}
              disabled={busy}
            />
          )}
          <Button
            label={finalStep ? 'Comenzar' : 'Continuar'}
            icon="arrow"
            style={s.flex}
            busy={busy}
            disabled={finalStep && choice === null}
            onPress={finalStep ? finish : () => goTo(step + 1)}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  content: { maxWidth: 620, width: '100%', alignSelf: 'center' },
  slide: { gap: 14 },
  hero: {
    minHeight: 204,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#E7EFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
  },
  heroBadge: { alignSelf: 'center', marginTop: -10, marginBottom: 12 },
  floors: { padding: 20, gap: 9, alignItems: 'flex-start' },
  visualCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  privacyHero: { alignItems: 'center', gap: 7 },
  shield: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: COLORS.cardBg,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.assistantGlow,
    borderWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  flex: { flex: 1 },
  error: { color: COLORS.danger, fontSize: 13 },
});
