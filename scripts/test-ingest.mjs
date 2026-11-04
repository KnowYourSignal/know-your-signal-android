/** Explicit integration test for a disposable local Supabase stack, never auto-run by Jest. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
if (!key)
  throw new Error(
    'Set SUPABASE_ANON_KEY to the key of your local Supabase stack.'
  );
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname))
  throw new Error('This test requires a disposable local Supabase stack.');
let token;
async function call(path, body) {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}
const auth = await call('/auth/v1/signup', {});
assert.equal(auth.status, 200, 'Anonymous sign-in failed');
assert.ok(
  auth.data.access_token,
  'No user token returned; a publishable key is not a substitute'
);
token = auth.data.access_token;
assert.equal(
  (
    await call('/rest/v1/rpc/set_consent', {
      p_habilitado: true,
      p_version_aviso: '1.0',
    })
  ).status,
  200
);
const measurement = {
  id: randomUUID(),
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
};
const ingest = (items) =>
  call('/functions/v1/ingest-measurements', {
    esquema_version: '1.0',
    mediciones: items,
  });
let result = await ingest([measurement]);
assert.equal(result.status, 200);
assert.deepEqual(result.data.aceptadas, [measurement.id]);
result = await ingest([measurement]);
assert.deepEqual(result.data.duplicadas, [measurement.id]);
result = await ingest([{ ...measurement, potencia_dbm: -73 }]);
assert.equal(result.data.rechazadas[0].codigo_error, 'ID_CONFLICT');
result = await ingest([{ ...measurement, id: randomUUID(), precision_m: 25 }]);
assert.equal(result.data.rechazadas[0].codigo_error, 'INVALID_ACCURACY');
await call('/rest/v1/rpc/set_consent', {
  p_habilitado: false,
  p_version_aviso: '1.0',
});
assert.equal(
  (await ingest([{ ...measurement, id: randomUUID() }])).status,
  403
);
console.log(
  'Local integration passed: Auth, consent, floor 0, insert, retry, conflict, precision and revocation.'
);
