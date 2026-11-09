export type CaptureStatus =
  | 'idle'
  | 'permission'
  | 'reading'
  | 'ready'
  | 'freezing';

const captureMessages: Record<string, string> = {
  PERMISSION_DENIED:
    'Habilita la ubicación precisa para medir en este recinto.',
  LOCATION_DISABLED:
    'Activa la ubicación del teléfono para obtener una lectura.',
  LOCATION_TIMEOUT:
    'Estamos buscando una posición. Prueba cerca de una ventana.',
  LOW_ACCURACY: 'Mantente quieto hasta que la precisión sea menor a 10 m.',
  NO_SIGNAL: 'Conéctate a Wi-Fi o datos móviles y espera una lectura de señal.',
  STALE_READING: 'La lectura venció. Espera una muestra nueva.',
  OUT_OF_SYNC: 'Estamos alineando las lecturas de ubicación y señal.',
  NETWORK_CHANGED:
    'Cambiaste de red. Espera una lectura de la conexión actual.',
  SENSOR_UNAVAILABLE:
    'No pudimos leer los sensores. Intenta iniciar otra lectura.',
  CAPTURE_EXPIRED: 'Vuelve a Medir para obtener una muestra nueva.',
  READING_CANCELLED: 'La lectura se pausó. Espera una muestra nueva.',
};

export function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
}

export function captureMessage(code: string | null): string {
  return (
    (code && captureMessages[code]) ||
    'Obtendremos la ubicación y la señal en el mismo momento.'
  );
}
