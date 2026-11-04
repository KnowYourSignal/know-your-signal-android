import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

test('PostgreSQL/PostGIS migrations, permissions and domain contract', async (t) => {
  const db = new PGlite({ extensions: { postgis } });
  const users = Array.from(
    { length: 7 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
  );
  let serial = 0;
  const point = { latitud: -33.456, longitud: -70.654 };
  const m = (extra = {}) => ({
    id: `10000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    ...point,
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
    ...extra,
  });
  const body = (items) => ({ esquema_version: '1.0', mediciones: items });
  async function asUser(user, fn, role = 'authenticated') {
    await db.exec(`SET ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      user ?? '',
    ]);
    try {
      return await fn();
    } finally {
      await db.exec('RESET ROLE');
    }
  }
  async function ingest(user, items) {
    return asUser(
      user,
      async () =>
        (
          await db.query(
            'SELECT public.ingest_measurements($1::jsonb) AS result',
            [JSON.stringify(body(items))]
          )
        ).rows[0].result
    );
  }
  async function consent(user, enabled = true, version = '1.0') {
    return asUser(user, () =>
      db.query('SELECT public.set_consent($1,$2)', [enabled, version])
    );
  }
  const box = {
    min_lon: -70.655,
    min_lat: -33.457,
    max_lon: -70.653,
    max_lat: -33.455,
  };
  async function map(extra = {}) {
    const p = {
      ...box,
      piso_filtro: 0,
      tipo_conexion_filtro: null,
      grid_size_m: 50,
      metrica_filtro: 'wifi_rssi',
      ...extra,
    };
    return asUser(
      null,
      async () =>
        (
          await db.query(
            `SELECT * FROM public.public_map_cells(
      $1::float8,$2::float8,$3::float8,$4::float8,$5::smallint,$6::text,$7::float8,$8::text)`,
            Object.values(p)
          )
        ).rows,
      'anon'
    );
  }
  try {
    // Minimal Auth schema models Supabase JWT role/uid behavior, never a live project.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
    for (const uid of users)
      await db.query('INSERT INTO auth.users VALUES($1)', [uid]);
    const dir = new URL('../../supabase/migrations/', import.meta.url);
    let legacyId;
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      try {
        if (file.endsWith('_harden_backend.sql')) {
          // Reproduce a manually initialized Cloud project with existing data.
          legacyId = m().id;
          await db.query(`SELECT public.insertar_medicion_individual(
            $1::uuid,$2::uuid,-33.456::float8,-70.654::float8,5::real,-72::smallint,
            'wifi_rssi','wifi','wifi_privada','sistema',0::smallint,'mediano',
            now(),'mvp-1','1.0')`, [legacyId, users[0]]);
        }
        await db.exec(await readFile(new URL(file, dir), 'utf8'));
      } catch (e) {
        throw new Error(
          `${file}: ${e.message}; position=${e.position}; context=${e.where}`
        );
      }
    }
    await t.test('hardening preserves existing measurements without inventing consent', async () => {
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.mediciones WHERE id=$1', [legacyId])).rows[0].n, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.consentimientos')).rows[0].n, 0);
    });
    await t.test(
      'all migrations apply and PostGIS 4326 is available',
      async () => {
        assert.equal(
          (
            await db.query(
              'SELECT ST_SRID(ST_SetSRID(ST_MakePoint(-70,-33),4326)::geography::geometry) AS srid'
            )
          ).rows[0].srid,
          4326
        );
      }
    );
    await t.test('projection cache is derived, consistent and cannot be overridden', async () => {
      const info=(await db.query(`SELECT a.attgenerated AS generated,
        ST_SRID(m.geom_6933) AS srid,
        ST_Equals(m.geom_6933,ST_Transform(m.geom::geometry,6933)) AS matches
        FROM public.mediciones m CROSS JOIN pg_attribute a
        WHERE a.attrelid='public.mediciones'::regclass AND a.attname='geom_6933'
        AND m.id=$1`,[legacyId])).rows[0];
      assert.equal(info.generated,'s');
      assert.equal(info.srid,6933);
      assert.equal(info.matches,true);
      await assert.rejects(()=>db.query('UPDATE public.mediciones SET geom_6933=ST_SetSRID(ST_MakePoint(0,0),6933) WHERE id=$1',[legacyId]),e=>e.code==='428C9');
    });
    await t.test('consent is required even for direct RPC calls', async () => {
      await assert.rejects(
        () => ingest(users[0], [m()]),
        (e) => e.code === 'PT403'
      );
      await consent(users[0]);
    });
    await t.test('no JWT identity is rejected', async () => {
      await assert.rejects(
        () => ingest(null, [m()]),
        (e) => e.code === 'PT401'
      );
    });
    await t.test('projection cache preserves ingestion at geographic extremes', async () => {
      for(const [latitud,longitud] of [[-90,-180],[-86,180],[0,0],[86,-180],[90,180]]) {
        const item=m({latitud,longitud});
        assert.deepEqual((await ingest(users[0],[item])).aceptadas,[item.id]);
        const row=(await db.query('SELECT ST_SRID(geom_6933) AS srid,ST_IsEmpty(geom_6933) AS empty FROM public.mediciones WHERE id=$1',[item.id])).rows[0];
        assert.equal(row.srid,6933);
        assert.equal(row.empty,false);
      }
    });
    await t.test(
      'raw measurements and private policy are inaccessible',
      async () => {
        for (const role of ['anon', 'authenticated'])
          for (const sql of [
            'SELECT * FROM public.mediciones',
            'SELECT * FROM kys_private.politica',
          ]) {
            await assert.rejects(
              () => asUser(users[0], () => db.query(sql), role),
              (e) => e.code === '42501'
            );
          }
        await assert.rejects(
          () =>
            asUser(users[0], () =>
              db.query(
                'INSERT INTO public.mediciones(id) VALUES(gen_random_uuid())'
              )
            ),
          (e) => e.code === '42501'
        );
      }
    );
    await t.test(
      'legacy owner-injection RPC has no API execute grant',
      async () => {
        const rows = (
          await db.query(`SELECT has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='insertar_medicion_individual'`)
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].anon, false);
        assert.equal(rows[0].authenticated, false);
      }
    );
    await t.test(
      'floor zero persists, exact retries duplicate, mutations conflict',
      async () => {
        const original = m();
        const first = await ingest(users[0], [original]);
        assert.deepEqual(first.aceptadas, [original.id]);
        assert.deepEqual((await ingest(users[0], [original])).duplicadas, [
          original.id,
        ]);
        assert.equal(
          (await ingest(users[0], [{ ...original, potencia_dbm: -73 }]))
            .rechazadas[0].codigo_error,
          'ID_CONFLICT'
        );
        await consent(users[1]);
        assert.equal(
          (await ingest(users[1], [original])).rechazadas[0].codigo_error,
          'ID_CONFLICT'
        );
      }
    );
    await t.test(
      'RLS exposes only the caller consent and versions are immutable',
      async () => {
        const rows = await asUser(
          users[0],
          async () =>
            (
              await db.query('SELECT usuario_id FROM public.consentimientos')
            ).rows
        );
        assert.deepEqual(
          rows.map((r) => r.usuario_id),
          [users[0]]
        );
        await assert.rejects(
          () =>
            db.query(
              "UPDATE public.configuraciones SET umbral_precision_m=99 WHERE version='mvp-1'"
            ),
          (e) => e.code === 'P0001'
        );
      }
    );
    await t.test(
      'direct RPC rejects array/null envelope with a client error',
      async () => {
        for (const value of [[], null, 42])
          await assert.rejects(
            () =>
              asUser(users[0], () =>
                db.query('SELECT public.ingest_measurements($1::jsonb)', [
                  JSON.stringify(value),
                ])
              ),
            (e) => e.code === 'PT400'
          );
      }
    );
    await t.test(
      'SQL independently rejects invalid domain values',
      async () => {
        for (const [change, code] of [
          [{ precision_m: 10 }, 'INVALID_ACCURACY'],
          [{ precision_m: 9.99999999 }, 'INVALID_ACCURACY'],
          [{ precision_m: 25 }, 'INVALID_ACCURACY'],
          [{ potencia_dbm: -200 }, 'INVALID_METRIC'],
          [{ piso_nivel: 999 }, 'INVALID_FLOOR'],
          [{ piso_nivel: 0.5 }, 'INVALID_FLOOR'],
          [{ tecnologia_radio: 'nr' }, 'INVALID_METRIC'],
          [{ tamano_zona: 'other' }, 'INVALID_ZONE_SIZE'],
          [{ version_config: 'missing' }, 'UNKNOWN_CONFIG'],
          [{ usuario_id: users[1] }, 'UNKNOWN_FIELDS'],
          [{ geom_6933: 'POINT(0 0)' }, 'UNKNOWN_FIELDS'],
          [{ capturada_en: '2026-02-30T12:00:00Z' }, 'INVALID_TIMESTAMP'],
          [
            { capturada_en: new Date(Date.now() + 600000).toISOString() },
            'FUTURE_TIMESTAMP',
          ],
        ]) {
          const result = await ingest(users[0], [m(change)]);
          assert.equal(
            result.rechazadas[0]?.codigo_error,
            code,
            JSON.stringify(change)
          );
        }
      }
    );
    await t.test(
      'null batch item rejects the complete envelope before writes',
      async () => {
        const first = m();
        await assert.rejects(
          () => ingest(users[0], [first, null]),
          (e) => e.code === 'PT400'
        );
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int AS n FROM public.mediciones WHERE id=$1',
              [first.id]
            )
          ).rows[0].n,
          0
        );
      }
    );
    await t.test(
      'mixed valid/invalid items have independent results',
      async () => {
        const a = m(),
          b = m({ precision_m: 20 });
        const r = await ingest(users[0], [a, b]);
        assert.deepEqual(r.aceptadas, [a.id]);
        assert.equal(r.rechazadas[0].id, b.id);
      }
    );
    await t.test('shared fixtures match actual SQL responses', async () => {
      const fixtureDir = new URL(
        '../../supabase/functions/ingest-measurements/_fixtures/',
        import.meta.url
      );
      for (const kind of ['valid', 'invalid']) {
        const payload = JSON.parse(
          await readFile(
            new URL(`${kind}_batch_payload.json`, fixtureDir),
            'utf8'
          )
        );
        const expected = JSON.parse(
          await readFile(
            new URL(`${kind}_batch_response.json`, fixtureDir),
            'utf8'
          )
        );
        // Fixture dates illustrate the contract; refresh only the clock-dependent value.
        for (const item of payload.mediciones)
          item.capturada_en = new Date().toISOString();
        assert.deepEqual(await ingest(users[0], payload.mediciones), expected);
      }
    });
    await t.test(
      'notice version and revoked consent prevent new contributions',
      async () => {
        assert.equal(
          (await ingest(users[0], [m({ version_aviso: 'other' })]))
            .rechazadas[0].codigo_error,
          'CONSENT_REQUIRED'
        );
        await consent(users[0], false);
        await assert.rejects(
          () => ingest(users[0], [m()]),
          (e) => e.code === 'PT403'
        );
        await consent(users[0]);
      }
    );
    await t.test(
      'map hides single contributor cells and preserves floor/metric filters',
      async () => {
        assert.equal((await map()).length, 0);
        assert.equal((await map({ piso_filtro: 1 })).length, 0);
        assert.equal((await map({ metrica_filtro: 'lte_rsrp' })).length, 0);
      }
    );
    await t.test(
      'five distinct accounts publish a fixed cell center and median',
      async () => {
        // Clear earlier records as fixture setup, then create one sample per account.
        await db.exec('TRUNCATE public.mediciones');
        for (let i = 0; i < 5; i++) {
          await consent(users[i]);
          await ingest(users[i], [m({ potencia_dbm: -65 - 5 * i })]);
        }
        const rows = await map();
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].total_contribuyentes), 5);
        assert.equal(Number(rows[0].mediana_potencia), -75);
        assert.notEqual(rows[0].longitud_centro, point.longitud);
        assert.equal(rows[0].resolucion_m, 50);
        assert.ok(!('usuario_id' in rows[0]));
        const narrow = await map({
          min_lon: point.longitud - 0.000001,
          max_lon: point.longitud + 0.000001,
          min_lat: point.latitud - 0.000001,
          max_lat: point.latitud + 0.000001,
        });
        assert.deepEqual(narrow, rows);
      }
    );
    await t.test(
      'invalid map parameters are rejected rather than dividing by zero',
      async () => {
        for (const change of [
          { grid_size_m: 0 },
          { grid_size_m: -50 },
          { grid_size_m: 1 },
          { metrica_filtro: null },
          { min_lon: -75 },
          { min_lat: 10, max_lat: 0 },
          { piso_filtro: null },
        ]) {
          await assert.rejects(
            () => map(change),
            (e) => e.code === 'PT400',
            JSON.stringify(change)
          );
        }
      }
    );
    await t.test(
      'large viewport coarsens resolution instead of truncating cells',
      async () => {
        const rows = await map({
          min_lon: -71,
          max_lon: -70,
          min_lat: -34,
          max_lat: -33,
        });
        assert.ok(rows.length > 0 && rows.length <= 1000);
        assert.ok(rows[0].resolucion_m > 50);
      }
    );
    await t.test(
      'rate limiting is enforced by SQL, including direct callers',
      async () => {
        await consent(users[6]);
        await db.exec('UPDATE kys_private.politica SET solicitudes_minuto=1');
        await ingest(users[6], [m()]);
        await assert.rejects(
          () => ingest(users[6], [m()]),
          (e) => e.code === 'PT429'
        );
        await db.exec('UPDATE kys_private.politica SET solicitudes_minuto=60');
      }
    );
    await t.test('projected cell selection preserves high-latitude, dateline and origin points', async () => {
      for(const [latitud,longitud] of [[84,179.8],[-84,-179.8],[0,0],[45,-70]]) {
        for(let i=0;i<5;i++)
          await ingest(users[i],[m({latitud,longitud,potencia_dbm:-65-5*i})]);
        const rows=await map({min_lon:longitud-0.000001,max_lon:longitud+0.000001,min_lat:latitud-0.000001,max_lat:latitud+0.000001});
        assert.equal(rows.length,1);
        assert.equal(Number(rows[0].total_contribuyentes),5);
        assert.equal(Number(rows[0].mediana_potencia),-75);
      }
    });
    await t.test(
      'unexpected SQL failure rolls back earlier inserts in the batch',
      async () => {
        const a = m(),
          b = m();
        await db.exec(`CREATE FUNCTION kys_private.test_fail() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN IF NEW.id='${b.id}'::uuid THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN NEW; END$$;
        CREATE TRIGGER test_fail BEFORE INSERT ON public.mediciones FOR EACH ROW EXECUTE FUNCTION kys_private.test_fail();`);
        await assert.rejects(
          () => ingest(users[0], [a, b]),
          (e) => e.code === 'P0001'
        );
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int AS n FROM public.mediciones WHERE id=$1',
              [a.id]
            )
          ).rows[0].n,
          0
        );
        await db.exec(
          'DROP TRIGGER test_fail ON public.mediciones; DROP FUNCTION kys_private.test_fail();'
        );
      }
    );
  } finally {
    await db.close();
  }
});
