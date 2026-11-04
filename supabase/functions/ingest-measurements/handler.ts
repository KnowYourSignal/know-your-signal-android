/** PostgreSQL remains authoritative for dynamic configuration and consent. */
export const MAX_BYTES = 256 * 1024;
export const MAX_BATCH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const fields = [
  'id',
  'latitud',
  'longitud',
  'precision_m',
  'potencia_dbm',
  'metrica',
  'tecnologia_radio',
  'tipo_conexion',
  'origen_clasificacion',
  'piso_nivel',
  'tamano_zona',
  'capturada_en',
  'version_config',
  'version_aviso',
];
export type Measurement = Record<string, unknown>;
export type Rejection = {
  id: string | null;
  codigo_error: string;
  mensaje: string;
  reintentable: boolean;
};
export type BatchResult = {
  aceptadas: string[];
  duplicadas: string[];
  rechazadas: Rejection[];
};
export type Dependencies = {
  authenticate: (token: string) => Promise<void>;
  ingest: (token: string, payload: unknown) => Promise<BatchResult>;
};
export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  constructor(status: number, code: string, retryable = false) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const isObject = (v: unknown): v is Measurement =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = (v: unknown, allowed: string[]) =>
  typeof v === 'string' && allowed.includes(v);
const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Static contract checks; the database also enforces config-specific rules. */
export function validateMeasurement(m: Measurement): string | null {
  if (Object.keys(m).some((k) => !fields.includes(k))) return 'UNKNOWN_FIELDS';
  if (typeof m.id !== 'string' || !UUID.test(m.id)) return 'INVALID_ID';
  if (fields.some((k) => !(k in m) || m[k] === null)) return 'MISSING_FIELDS';
  if (
    !number(m.latitud) ||
    !number(m.longitud) ||
    Math.abs(m.latitud) > 90 ||
    Math.abs(m.longitud) > 180
  )
    return 'INVALID_COORDINATES';
  if (!number(m.precision_m) || m.precision_m <= 0) return 'INVALID_ACCURACY';
  const tech: Record<string, string> = {
    wifi_rssi: 'wifi',
    lte_rsrp: 'lte',
    nr_ss_rsrp: 'nr',
    celular_dbm: 'otra',
  };
  if (
    typeof m.metrica !== 'string' ||
    !Object.hasOwn(tech, m.metrica) ||
    tech[m.metrica] !== m.tecnologia_radio
  )
    return 'INVALID_METRIC';
  if (
    !number(m.potencia_dbm) ||
    !Number.isInteger(m.potencia_dbm) ||
    m.potencia_dbm > -1 ||
    m.potencia_dbm < (m.metrica === 'wifi_rssi' ? -127 : -160)
  )
    return 'INVALID_METRIC';
  if (
    m.metrica === 'wifi_rssi'
      ? !oneOf(m.tipo_conexion, [
          'wifi_publica',
          'wifi_privada',
          'wifi_desconocida',
        ])
      : m.tipo_conexion !== 'datos_moviles'
  )
    return 'INVALID_CONNECTION';
  if (!oneOf(m.origen_clasificacion, ['sistema', 'manual', 'desconocido']))
    return 'INVALID_CLASSIFICATION';
  if (
    !number(m.piso_nivel) ||
    !Number.isInteger(m.piso_nivel) ||
    m.piso_nivel < -32768 ||
    m.piso_nivel > 32767
  )
    return 'INVALID_FLOOR';
  if (!oneOf(m.tamano_zona, ['pequeno', 'mediano', 'grande', 'muy_grande']))
    return 'INVALID_ZONE_SIZE';
  if (
    typeof m.capturada_en !== 'string' ||
    !UTC.test(m.capturada_en) ||
    !Number.isFinite(Date.parse(m.capturada_en))
  )
    return 'INVALID_TIMESTAMP';
  if (
    typeof m.version_config !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(m.version_config)
  )
    return 'UNKNOWN_CONFIG';
  if (
    typeof m.version_aviso !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(m.version_aviso)
  )
    return 'INVALID_NOTICE';
  return null;
}
export function rejection(m: Measurement, code: string): Rejection {
  return {
    id: typeof m.id === 'string' ? m.id : null,
    codigo_error: code,
    mensaje: code,
    reintentable: false,
  };
}
async function readLimited(req: Request): Promise<unknown> {
  const declared = req.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES))
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  if (!req.body) throw new ApiError(400, 'INVALID_JSON');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, 'INVALID_JSON');
  }
}
export function createHandler(deps: Dependencies) {
  const json = (body: unknown, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...extra,
      },
    });
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST')
      return json(
        { error: { codigo: 'METHOD_NOT_ALLOWED', reintentable: false } },
        405,
        { Allow: 'POST, OPTIONS' }
      );
    try {
      const match = req.headers
        .get('Authorization')
        ?.match(/^Bearer\s+(\S+)$/i);
      if (!match) throw new ApiError(401, 'UNAUTHORIZED');
      if (
        req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
        'application/json'
      )
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
      await deps.authenticate(match[1]);
      const payload = await readLimited(req);
      if (
        !isObject(payload) ||
        Object.keys(payload).some(
          (k) => !['esquema_version', 'mediciones'].includes(k)
        )
      )
        throw new ApiError(400, 'INVALID_ENVELOPE');
      if (payload.esquema_version !== '1.0')
        throw new ApiError(400, 'UNSUPPORTED_SCHEMA');
      if (
        !Array.isArray(payload.mediciones) ||
        payload.mediciones.length < 1 ||
        payload.mediciones.length > MAX_BATCH ||
        payload.mediciones.some((m) => !isObject(m))
      )
        throw new ApiError(400, 'INVALID_BATCH');
      const valid: Measurement[] = [];
      const rejected: Rejection[] = [];
      for (const m of payload.mediciones as Measurement[]) {
        const error = validateMeasurement(m);
        if (error) rejected.push(rejection(m, error));
        else valid.push(m);
      }
      const result = valid.length
        ? await deps.ingest(match[1], {
            esquema_version: '1.0',
            mediciones: valid,
          })
        : { aceptadas: [], duplicadas: [], rechazadas: [] };
      return json({
        ...result,
        rechazadas: [...result.rechazadas, ...rejected],
      });
    } catch (error) {
      const e =
        error instanceof ApiError
          ? error
          : new ApiError(503, 'SERVICE_UNAVAILABLE', true);
      return json(
        { error: { codigo: e.code, reintentable: e.retryable } },
        e.status,
        e.status === 429 ? { 'Retry-After': '60' } : {}
      );
    }
  };
}
