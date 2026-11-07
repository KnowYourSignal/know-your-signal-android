export const METRICS = [
  'wifi_rssi',
  'lte_rsrp',
  'nr_ss_rsrp',
  'celular_dbm',
] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABELS: Record<Metric, string> = {
  wifi_rssi: 'Wi-Fi',
  lte_rsrp: '4G LTE',
  nr_ss_rsrp: '5G NR',
  celular_dbm: 'Otra móvil',
};

export const ZONES = [
  {
    value: 'pequeno',
    label: 'Pequeño',
    description: 'Habitación · hasta 20 m²',
  },
  { value: 'mediano', label: 'Mediano', description: 'Sala · 20 a 50 m²' },
  { value: 'grande', label: 'Grande', description: 'Auditorio · 50 a 100 m²' },
  {
    value: 'muy_grande',
    label: 'Muy grande',
    description: 'Gimnasio · más de 100 m²',
  },
] as const;
export type ZoneSize = (typeof ZONES)[number]['value'];

export function isMetric(value: string): value is Metric {
  return METRICS.some(metric => metric === value);
}

export function metricLabel(metric: string) {
  return isMetric(metric) ? METRIC_LABELS[metric] : 'Red';
}

export function networkLabel(connection: string | null): string {
  switch (connection) {
    case 'wifi_publica':
      return 'Wi-Fi abierta';
    case 'wifi_privada':
      return 'Wi-Fi protegida';
    case 'wifi_desconocida':
      return 'Wi-Fi';
    case 'datos_moviles':
      return 'Datos móviles';
    default:
      return 'Sin red detectada';
  }
}

export function floorLabel(floor: number): string {
  return floor === 0 ? 'Piso 0 · acceso' : 'Piso ' + floor;
}

export function signalWeight(dbm: number, metric: string): number {
  // RSSI and RSRP have different practical ranges. Keep the map layers separate.
  const [weak, strong] = metric === 'wifi_rssi' ? [-95, -45] : [-125, -80];
  return Math.min(1, Math.max(0, (dbm - weak) / (strong - weak)));
}

export function signalQuality(
  dbm: number,
  metric: string,
): 'good' | 'fair' | 'weak' {
  const weight = signalWeight(dbm, metric);
  return weight >= 0.56 ? 'good' : weight >= 0.36 ? 'fair' : 'weak';
}

export function formatSignal(
  dbm: number,
  metric: string,
  technical: boolean,
): string {
  if (technical) {
    return Number(dbm.toFixed(1)) + ' dBm';
  }
  const quality = signalQuality(dbm, metric);
  return quality === 'good'
    ? 'Favorable'
    : quality === 'fair'
    ? 'Intermedia'
    : 'Débil';
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
