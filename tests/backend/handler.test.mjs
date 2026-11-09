import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandler,
  validateMeasurement,
  ApiError,
  MAX_BYTES,
} from '../../supabase/functions/ingest-measurements/handler.ts';
import { createDependencies } from '../../supabase/functions/ingest-measurements/transport.ts';

const measurement = () => ({
  id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  latitud: -33.456,
  longitud: -70.654,
  precision_m: 5,
  potencia_dbm: -72,
  metrica: 'wifi_rssi',
  tecnologia_radio: 'wifi',
  tipo_conexion: 'wifi_privada',
  origen_clasificacion: 'sistema',
  piso_nivel: 0,
  tamano_zona: 'mediano',
  capturada_en: new Date().toISOString(),
  version_config: 'mvp-1',
  version_aviso: '1.0',
});
const envelope = (items = [measurement()]) => ({
  esquema_version: '1.0',
  mediciones: items,
});
function fixture(overrides = {}) {
  const calls = [];
  const handler = createHandler({
    authenticate: async () => {},
    ingest: async (token, payload) => {
      calls.push({ token, payload });
      return {
        aceptadas: payload.mediciones.map((m) => m.id),
        duplicadas: [],
        rechazadas: [],
      };
    },
    ...overrides,
  });
  async function send(body = envelope(), options = {}) {
    const { headers = {}, method = 'POST', raw, ...extra } = options;
    const response = await handler(
      new Request('http://local.test', {
        method,
        headers: {
          Authorization: 'Bearer test-user-token',
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(['GET', 'HEAD'].includes(method)
          ? {}
          : { body: raw ?? JSON.stringify(body) }),
        ...extra,
      })
    );
    return {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  return { send, calls };
}
test('floor zero is valid and a batch uses one scoped RPC', async () => {
  const { send, calls } = fixture();
  const r = await send(envelope([measurement(), measurement()]));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, 'test-user-token');
  assert.equal(calls[0].payload.mediciones[0].piso_nivel, 0);
});
test('manual Wi-Fi declarations and unclassified readings retain their origin', async () => {
  const { send, calls } = fixture();
  const readings = [
    { tipo_conexion: 'wifi_publica', origen_clasificacion: 'manual' },
    { tipo_conexion: 'wifi_privada', origen_clasificacion: 'manual' },
    { tipo_conexion: 'wifi_desconocida', origen_clasificacion: 'desconocido' },
  ].map((declaration) => ({ ...measurement(), ...declaration }));
  const result = await send(envelope(readings));
  assert.equal(result.status, 200);
  assert.equal(result.body.aceptadas.length, 3);
  assert.deepEqual(calls[0].payload.mediciones, readings);
});
for (const [label, change, code] of [
  ['latitude', { latitud: 91 }, 'INVALID_COORDINATES'],
  ['numeric string', { latitud: '-33' }, 'INVALID_COORDINATES'],
  ['NaN', { latitud: NaN }, 'INVALID_COORDINATES'],
  ['accuracy', { precision_m: 0 }, 'INVALID_ACCURACY'],
  ['power', { potencia_dbm: -200 }, 'INVALID_METRIC'],
  ['fractional power', { potencia_dbm: -65.5 }, 'INVALID_METRIC'],
  ['metric technology', { tecnologia_radio: 'lte' }, 'INVALID_METRIC'],
  ['connection', { tipo_conexion: 'datos_moviles' }, 'INVALID_CONNECTION'],
  ['fractional floor', { piso_nivel: 0.5 }, 'INVALID_FLOOR'],
  ['zone', { tamano_zona: 'inventado' }, 'INVALID_ZONE_SIZE'],
  ['timestamp', { capturada_en: 'yesterday' }, 'INVALID_TIMESTAMP'],
  ['id', { id: 'invalid' }, 'INVALID_ID'],
  ['sensitive extra field', { imei: '123' }, 'UNKNOWN_FIELDS'],
  ['owner injection', { usuario_id: 'other' }, 'UNKNOWN_FIELDS'],
  [
    'classification',
    { origen_clasificacion: 'other' },
    'INVALID_CLASSIFICATION',
  ],
])
  test(`validator rejects ${label}`, () =>
    assert.equal(validateMeasurement({ ...measurement(), ...change }), code));
test('missing mandatory fields are not silently defaulted', () => {
  const m = measurement();
  delete m.version_config;
  assert.equal(validateMeasurement(m), 'MISSING_FIELDS');
});
test('cellular metric and network must match', () => {
  assert.equal(
    validateMeasurement({
      ...measurement(),
      metrica: 'lte_rsrp',
      tecnologia_radio: 'lte',
      tipo_conexion: 'datos_moviles',
      potencia_dbm: -140,
    }),
    null
  );
});
for (const [name, body, status] of [
  ['null body', null, 400],
  ['array body', [], 400],
  ['unknown schema', { ...envelope(), esquema_version: '2.0' }, 400],
  ['extra envelope property', { ...envelope(), usuario_id: 'injected' }, 400],
  ['empty batch', envelope([]), 400],
  ['oversized batch', envelope(Array(101).fill(measurement())), 400],
  ['malformed batch', envelope([measurement(), null]), 400],
])
  test(`handler rejects ${name} before writes`, async () => {
    const { send, calls } = fixture();
    const r = await send(body);
    assert.equal(r.status, status);
    assert.equal(calls.length, 0);
  });
test('invalid JSON is a client error, not 500', async () => {
  const { send, calls } = fixture();
  assert.equal((await send(null, { raw: '{bad' })).status, 400);
  assert.equal(calls.length, 0);
});
test('partial domain rejection preserves valid items and stable error fields', async () => {
  const { send, calls } = fixture();
  const r = await send(
    envelope([
      measurement(),
      {
        ...measurement(),
        id: 'b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        potencia_dbm: -200,
      },
    ])
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.aceptadas.length, 1);
  assert.equal(r.body.rechazadas[0].codigo_error, 'INVALID_METRIC');
  assert.equal(calls[0].payload.mediciones.length, 1);
});
test('all-invalid batch performs no database writes', async () => {
  const { send, calls } = fixture();
  const r = await send(envelope([{ ...measurement(), potencia_dbm: -200 }]));
  assert.equal(r.body.rechazadas.length, 1);
  assert.equal(calls.length, 0);
});
test('SQL dynamic-policy rejections and duplicates pass through unchanged', async () => {
  const result = {
    aceptadas: [],
    duplicadas: [measurement().id],
    rechazadas: [
      {
        id: 'other',
        codigo_error: 'INVALID_ACCURACY',
        mensaje: 'INVALID_ACCURACY',
        reintentable: false,
      },
    ],
  };
  const { send } = fixture({ ingest: async () => result });
  assert.deepEqual((await send()).body, result);
});
test('stream body limit does not trust Content-Length', async () => {
  const { send, calls } = fixture();
  assert.equal(
    (await send(null, { raw: ' '.repeat(MAX_BYTES + 1) })).status,
    413
  );
  assert.equal(calls.length, 0);
});
test('declared oversized body is rejected', async () => {
  const { send } = fixture();
  assert.equal(
    (await send(null, { headers: { 'Content-Length': String(MAX_BYTES + 1) } }))
      .status,
    413
  );
});
for (const [name, options, status] of [
  ['missing auth', { headers: { Authorization: '' } }, 401],
  [
    'API key as raw auth',
    { headers: { Authorization: 'sb_publishable_x' } },
    401,
  ],
  ['wrong content type', { headers: { 'Content-Type': 'text/plain' } }, 415],
  ['wrong method', { method: 'GET' }, 405],
])
  test(name, async () => {
    const { send } = fixture();
    assert.equal((await send(envelope(), options)).status, status);
  });
for (const [status, code, retryable] of [
  [401, 'UNAUTHORIZED', false],
  [403, 'CONSENT_REQUIRED', false],
  [429, 'RATE_LIMITED', true],
  [503, 'SERVICE_UNAVAILABLE', true],
]) {
  test(`backend error ${code} is classified`, async () => {
    const { send } = fixture({
      ingest: async () => {
        throw new ApiError(status, code, retryable);
      },
    });
    const r = await send();
    assert.equal(r.status, status);
    assert.equal(r.body.error.reintentable, retryable);
    if (status === 429) assert.equal(r.headers.get('Retry-After'), '60');
  });
}
test('unexpected errors do not disclose tokens or database messages', async () => {
  const { send } = fixture({
    ingest: async () => {
      throw new Error('SECRET postgres diagnostic');
    },
  });
  const r = await send();
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.body).includes('SECRET'));
});
test('preflight has no auth or database side effects', async () => {
  const { send, calls } = fixture({
    authenticate: async () => {
      throw new Error('must not authenticate preflight');
    },
  });
  assert.equal((await send(null, { method: 'OPTIONS' })).status, 204);
  assert.equal(calls.length, 0);
});
test('transport keeps user JWT and sends only scoped payload', async () => {
  const calls = [];
  const deps = createDependencies(
    'https://example.test/',
    'public-key',
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        url.endsWith('/user')
          ? { id: 'user' }
          : { aceptadas: [], duplicadas: [], rechazadas: [] }
      );
    }
  );
  await deps.authenticate('user-jwt');
  await deps.ingest('user-jwt', envelope());
  assert.equal(calls[0].url, 'https://example.test/auth/v1/user');
  assert.equal(
    calls[1].url,
    'https://example.test/rest/v1/rpc/ingest_measurements'
  );
  assert.equal(calls[1].options.headers.Authorization, 'Bearer user-jwt');
  assert.equal(calls[1].options.headers.apikey, 'public-key');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_payload: envelope(JSON.parse(calls[1].options.body).p_payload.mediciones),
  });
});
test('transport maps transient errors instead of acknowledging rejected items', async () => {
  const deps = createDependencies('https://example.test', 'key', async () =>
    Response.json({ message: 'secret database info' }, { status: 500 })
  );
  await assert.rejects(
    () => deps.ingest('jwt', envelope()),
    (e) => e.status === 503 && e.retryable && !e.message.includes('secret')
  );
});
test('transport treats failed anonymous signup tokens as unauthorized', async () => {
  const deps = createDependencies('https://example.test', 'key', async () =>
    Response.json({ message: 'invalid JWT' }, { status: 401 })
  );
  await assert.rejects(
    () => deps.authenticate('sb_publishable_not_a_jwt'),
    (e) => e.status === 401
  );
});
