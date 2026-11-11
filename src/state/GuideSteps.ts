import type { MainTabsParamList } from './WizardState';

export type GuideScope = 'overview' | 'room';
export type GuideTargetId =
  | 'accuracy'
  | 'network'
  | 'capture'
  | 'history'
  | 'community'
  | 'privacy'
  | 'technical'
  | 'floor'
  | 'zone'
  | 'save';
export type GuideStep = {
  target: GuideTargetId;
  tab?: keyof MainTabsParamList;
  title: string;
  body: string;
};

export const GUIDE_STEPS: Record<GuideScope, readonly GuideStep[]> = {
  overview: [
    {
      target: 'accuracy',
      tab: 'Medir',
      title: 'Una ubicación precisa',
      body: 'Aquí verás la precisión real del GPS. Quédate quieto hasta que sea menor a 10 m para registrar una muestra.',
    },
    {
      target: 'network',
      tab: 'Medir',
      title: 'La red que estás midiendo',
      body: 'Comprueba la red y su nivel de señal. La app distingue Wi-Fi y redes móviles; cada tecnología conserva su propia escala.',
    },
    {
      target: 'capture',
      tab: 'Medir',
      title: 'Tú inicias la medición',
      body: 'Activa los sensores cuando estés listo. Con una lectura reciente y válida, este botón permite capturar la señal y completar el recinto.',
    },
    {
      target: 'history',
      tab: 'MapaPersonal',
      title: 'Tu historial, siempre contigo',
      body: 'Las capturas guardadas se consultan aquí, incluso sin conexión. Podrás filtrar por piso y preparar una imagen para compartir.',
    },
    {
      target: 'community',
      tab: 'MapaPublico',
      title: 'Explora la cobertura',
      body: 'Combina piso y tecnología para consultar el mapa comunitario. Los colores representan calidad de señal, no cantidad de muestras.',
    },
    {
      target: 'privacy',
      tab: 'Ajustes',
      title: 'Tú eliges qué compartir',
      body: 'Puedes habilitar o revocar los aportes futuros. Este recorrido no cambia tu decisión ni comparte tu historial anterior.',
    },
    {
      target: 'technical',
      tab: 'Ajustes',
      title: 'El detalle que necesitas',
      body: 'Activa el modo técnico si prefieres ver dBm. Puedes repetir esta guía desde Ajustes o desde el botón Guía en Medir.',
    },
  ],
  room: [
    {
      target: 'floor',
      title: 'Indica el piso real',
      body: 'Escribe el nivel donde tomaste la muestra. El 0 es el acceso y los niveles subterráneos usan números negativos.',
    },
    {
      target: 'zone',
      title: 'Describe el recinto',
      body: 'Elige el tamaño que mejor representa este espacio. No se selecciona ninguna opción por ti.',
    },
    {
      target: 'save',
      title: 'Confirma y guarda',
      body: 'Revisa piso y tamaño antes de guardar. La muestra conserva la señal y la ubicación del momento de la captura.',
    },
  ],
};
