import { ACCURACY_LIMIT_M } from './CapturePolicy';
import { captureMessage, type CaptureStatus } from './CaptureState';
import type { SensorReading } from '../specs/NativeTelemetry';

type PresentationInput = {
  status: CaptureStatus;
  enabled: boolean;
  canRecord: boolean;
  problem: string | null;
  reading: SensorReading | null;
  guiding: boolean;
};

export function capturePresentation(input: PresentationInput) {
  const { status, enabled, canRecord, problem, reading, guiding } = input;
  const blocked =
    problem === 'PERMISSION_DENIED' || problem === 'LOCATION_DISABLED';
  const failed = problem === 'SENSOR_UNAVAILABLE' || problem === 'UNKNOWN';
  const locationReady =
    enabled &&
    !guiding &&
    reading?.accuracyM != null &&
    reading.accuracyM > 0 &&
    reading.accuracyM < ACCURACY_LIMIT_M &&
    problem !== 'STALE_READING';
  const signalReady =
    enabled &&
    !guiding &&
    reading?.powerDbm != null &&
    reading.metric !== null &&
    !['NO_SIGNAL', 'STALE_READING', 'NETWORK_CHANGED'].includes(problem ?? '');
  const base = {
    locationReady,
    signalReady,
    tone: 'blue' as 'blue' | 'green' | 'amber',
    busy: false,
  };
  if (guiding)
    return {
      ...base,
      phase: 'guide',
      label: 'Guía en curso',
      title: 'Conoce tu espacio',
      body: 'Explora los controles. Tú decides cuándo activar los sensores.',
    };
  if (status === 'permission')
    return {
      ...base,
      phase: 'permission',
      busy: true,
      label: 'Permiso de ubicación',
      title: 'Prepara la ubicación',
      body: 'Elige ubicación precisa en el permiso de Android para medir este recinto.',
    };
  if (blocked)
    return {
      ...base,
      phase: 'blocked',
      tone: 'amber' as const,
      label: 'Necesita tu atención',
      title: 'Habilita la ubicación',
      body: captureMessage(problem),
    };
  if (!enabled)
    return {
      ...base,
      phase: 'idle',
      label: 'Sensores en pausa',
      title: 'Inicia una medición',
      body: 'Activa los sensores cuando estés en el lugar que quieres medir.',
    };
  if (failed)
    return {
      ...base,
      phase: 'error',
      tone: 'amber' as const,
      label: 'Lectura no disponible',
      title: 'Revisa los sensores',
      body: captureMessage(problem),
    };
  if (status === 'freezing')
    return {
      ...base,
      phase: 'freezing',
      busy: true,
      label: 'Preparando captura',
      title: 'Conservando esta muestra',
      body: 'Guardamos la ubicación y la señal de este instante para completar el recinto.',
    };
  if (canRecord)
    return {
      ...base,
      phase: 'ready',
      tone: 'green' as const,
      label: 'Lectura lista',
      title: 'Tu señal está lista',
      body: 'Ubicación y señal están alineadas. Ya puedes registrar esta muestra.',
    };
  if (problem === 'NO_SIGNAL')
    return {
      ...base,
      phase: 'signal',
      busy: true,
      label: 'Esperando señal',
      title: 'Buscando tu red',
      body: captureMessage(problem),
    };
  if (problem === 'OUT_OF_SYNC' || problem === 'NETWORK_CHANGED')
    return {
      ...base,
      phase: 'aligning',
      busy: true,
      label: 'Actualizando lectura',
      title: 'Alineando ubicación y red',
      body: captureMessage(problem),
    };
  if (problem === 'STALE_READING')
    return {
      ...base,
      phase: 'refreshing',
      busy: true,
      label: 'Renovando lectura',
      title: 'Buscando una muestra nueva',
      body: captureMessage(problem),
    };
  if (reading?.accuracyM != null && reading.accuracyM >= ACCURACY_LIMIT_M)
    return {
      ...base,
      phase: 'stabilizing',
      busy: true,
      label: 'Estabilizando GPS',
      title: 'Afinando tu ubicación',
      body: 'Mantente quieto. La precisión debe ser menor a 10 m para habilitar la captura.',
    };
  return {
    ...base,
    phase: 'locating',
    busy: true,
    label: 'Buscando ubicación',
    title: 'Conectando con tu entorno',
    body: problem
      ? captureMessage(problem)
      : 'Estamos obteniendo la ubicación y la señal. Si tarda, prueba cerca de una ventana.',
  };
}

export type CapturePresentation = ReturnType<typeof capturePresentation>;
