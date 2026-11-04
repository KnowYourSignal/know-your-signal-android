"""Native multi-session PostgreSQL/PostGIS checks; disposable loopback DB only.

Uses psql and Python's standard library. Never connects to Supabase Cloud.
"""
import concurrent.futures
import datetime
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import threading
import time
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[2]
DSN = os.environ.get('KYS_TEST_DATABASE_URL', '')
TARGET = urllib.parse.urlsplit(DSN)
if not __debug__:
    raise SystemExit('Run the assertions without Python optimization flags')
if TARGET.scheme not in ('postgresql','postgres') or TARGET.hostname not in ('127.0.0.1', 'localhost', '::1') or TARGET.path != '/kys_test_backend':
    raise SystemExit('KYS_TEST_DATABASE_URL must name a disposable loopback database kys_test_backend')
if TARGET.query or TARGET.fragment:
    raise SystemExit('Connection overrides in URL query/fragment are not allowed')
REPORT = {'checks': [], 'benchmarks': [], 'scope': 'isolated native PostgreSQL; not Cloud/Android SLA'}
POSTGIS_SCHEMA = os.environ.get('KYS_POSTGIS_SCHEMA', 'public')
if POSTGIS_SCHEMA not in ('public', 'extensions'):
    raise SystemExit('KYS_POSTGIS_SCHEMA must be public or extensions')


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


class SqlError(RuntimeError):
    pass


def command(app='kys_native'):
    # Inherited PGHOSTADDR/PGSERVICE must never redirect the loopback connection.
    env = {key:value for key,value in os.environ.items() if not key.startswith('PG')}
    env.update(PGAPPNAME=app, PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=10000 -c search_path=pg_catalog,public,extensions')
    return subprocess.Popen(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', DSN],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, env=env)


def finish(process, sql=None):
    try:
        stdout, stderr = process.communicate(sql, timeout=25)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise SqlError('isolated test session timed out')
    if process.returncode:
        raise SqlError(stderr.strip()[:1600])
    return stdout.strip()


def execute(sql, app='kys_native'):
    return finish(command(app), sql)


def result(expression, prefix='', suffix='', app='kys_native'):
    out = execute(prefix + "SELECT 'KYS_RESULT:' || (" + expression + ')::text;' + suffix, app)
    return json.loads(next(line[len('KYS_RESULT:'):] for line in out.splitlines() if line.startswith('KYS_RESULT:')))


def check(name, action):
    start = time.perf_counter()
    action()
    record = {'name': name, 'passed': True, 'elapsed_ms': round((time.perf_counter()-start)*1000, 2)}
    REPORT['checks'].append(record)
    print(json.dumps(record), flush=True)


def user_sql(uid):
    return 'BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub"=' + quote(uid) + ';'


def new_user():
    uid = str(uuid.uuid4())
    execute('INSERT INTO auth.users(id) VALUES (' + quote(uid) + '::uuid);')
    result('public.set_consent(true,\'1.0\')', user_sql(uid), 'COMMIT;')
    return uid


def measurement(**changes):
    item = dict(id=str(uuid.uuid4()), latitud=-33.456, longitud=-70.654, precision_m=5,
                potencia_dbm=-72, metrica='wifi_rssi', tecnologia_radio='wifi',
                tipo_conexion='wifi_privada', origen_clasificacion='sistema', piso_nivel=0,
                tamano_zona='mediano', capturada_en=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),
                version_config='mvp-1', version_aviso='1.0')
    item.update(changes)
    return item


def ingest_expr(items):
    return 'public.ingest_measurements(' + quote(json.dumps({'esquema_version':'1.0','mediciones':items})) + '::jsonb)'


def ingest(uid, items, app='kys_native_ingest'):
    return result(ingest_expr(items), user_sql(uid), 'COMMIT;', app)


def parallel(actions):
    barrier = threading.Barrier(len(actions))
    def call(action):
        barrier.wait(timeout=10)
        return action()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(actions)) as pool:
        return list(pool.map(call, actions))


def count(where='true'):
    return result('(SELECT count(*) FROM public.mediciones WHERE '+where+')')


def wait_activity(app, event):
    deadline = time.monotonic()+5
    while time.monotonic() < deadline:
        if result("EXISTS (SELECT FROM pg_stat_activity WHERE application_name="+quote(app)+" AND wait_event="+quote(event)+")"):
            return
        time.sleep(0.025)
    raise AssertionError('expected native session '+app+' waiting on '+event)


def wait_lock(app):
    deadline = time.monotonic()+2
    while time.monotonic() < deadline:
        if result("EXISTS (SELECT FROM pg_stat_activity WHERE application_name="+quote(app)+" AND wait_event_type='Lock')"):
            return
        time.sleep(0.025)
    raise AssertionError('expected native lock wait for '+app)


def held_session(uid, expression, app):
    process = command(app)
    process.stdin.write(user_sql(uid)+"SELECT 'KYS_RESULT:'||("+expression+")::text;SELECT pg_sleep(3);COMMIT;\n")
    process.stdin.flush()
    try:
        wait_activity(app, 'PgSleep')
    except Exception:
        process.kill()
        process.communicate()
        raise
    return process


def same_uuid_retries():
    uid, item = new_user(), measurement()
    rows = parallel([lambda: ingest(uid, [item]) for _ in range(8)])
    assert sum(len(r['aceptadas']) for r in rows) == 1
    assert sum(len(r['duplicadas']) for r in rows) == 7
    assert not any(r['rechazadas'] for r in rows)
    assert count('id='+quote(item['id'])+'::uuid') == 1


def owner_conflict():
    users, item = [new_user(), new_user()], measurement()
    rows = parallel([lambda uid=uid: ingest(uid, [item]) for uid in users])
    assert sum(len(r['aceptadas']) for r in rows) == 1
    assert [e['codigo_error'] for r in rows for e in r['rechazadas']] == ['ID_CONFLICT']
    assert count('id='+quote(item['id'])+'::uuid') == 1


def content_conflict():
    uid, item = new_user(), measurement()
    other = dict(item, potencia_dbm=-73)
    rows = parallel([lambda: ingest(uid, [item]), lambda: ingest(uid, [other])])
    assert sum(len(r['aceptadas']) for r in rows) == 1
    assert [e['codigo_error'] for r in rows for e in r['rechazadas']] == ['ID_CONFLICT']


def simultaneous_full_batches():
    users = [new_user() for _ in range(8)]
    batches = [[measurement() for _ in range(100)] for _ in users]
    rows = parallel([lambda uid=uid, items=items:ingest(uid,items) for uid,items in zip(users,batches)])
    assert all(len(row['aceptadas'])==100 and not row['rechazadas'] for row in rows)
    assert all(count('usuario_id='+quote(uid)+'::uuid')==100 for uid in users)


def atomic_quota():
    uid = new_user()
    execute('UPDATE kys_private.politica SET solicitudes_minuto=8;')
    def call():
        try:
            return ingest(uid, [measurement()])
        except SqlError as error:
            if 'PT429' in str(error) and 'RATE_LIMITED' in str(error):
                return {'rate_limited':True}
            raise
    try:
        rows = parallel([call for _ in range(16)])
        accepted = sum(bool(r.get('aceptadas')) for r in rows)
        assert 8 <= accepted <= 16
        assert sum(bool(r.get('rate_limited')) for r in rows) == 16-accepted
        assert count('usuario_id='+quote(uid)+'::uuid') == accepted
        # A wall-clock minute can change during scheduling: enforce each real window.
        maximum = result('(SELECT max(n) FROM (SELECT count(*) AS n FROM public.mediciones WHERE usuario_id='+quote(uid)+"::uuid GROUP BY date_trunc('minute',recibida_en)) windows)")
        assert maximum <= 8
    finally:
        execute('UPDATE kys_private.politica SET solicitudes_minuto=60;')


def consent_race(ingest_first):
    uid, item = new_user(), measurement()
    first_expr = ingest_expr([item]) if ingest_first else "public.set_consent(false,'1.0')"
    second_expr = "public.set_consent(false,'1.0')" if ingest_first else ingest_expr([item])
    first = held_session(uid, first_expr, 'kys_native_first')
    second = command('kys_native_second')
    second.stdin.write(user_sql(uid)+"SELECT 'KYS_RESULT:'||("+second_expr+")::text;COMMIT;\n")
    second.stdin.flush()
    try:
        wait_lock('kys_native_second')
        finish(first)
        if ingest_first:
            finish(second)
            assert count('id='+quote(item['id'])+'::uuid') == 1
        else:
            try:
                finish(second)
                raise AssertionError('upload after revocation should fail')
            except SqlError as error:
                assert 'PT403' in str(error) and 'CONSENT_REQUIRED' in str(error)
            assert count('id='+quote(item['id'])+'::uuid') == 0
        try:
            ingest(uid, [measurement()])
            raise AssertionError('revoked consent accepted a new measurement')
        except SqlError as error:
            assert 'PT403' in str(error)
    finally:
        for process in (first, second):
            if process.poll() is None:
                process.kill()
                process.communicate()


def seed(size):
    execute('TRUNCATE public.mediciones;')
    execute("""INSERT INTO public.mediciones(id,usuario_id,latitud,longitud,geom,precision_m,
      potencia_dbm,metrica,tecnologia_radio,tipo_conexion,origen_clasificacion,piso_nivel,
      tamano_zona,capturada_en,version_config,version_aviso)
    WITH origin AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(-70.654,-33.456),4326),6933) AS g),
    projected AS (SELECT i,ST_Transform(ST_SetSRID(ST_MakePoint(
      floor(ST_X(g)/50)*50+((i/8)%40)*50+25,
      floor(ST_Y(g)/50)*50+(((i/8)/40)%40)*50+25),6933),4326) AS g
      FROM generate_series(0,"""+str(size-1)+""") i CROSS JOIN origin)
    SELECT md5('bench-'||i)::uuid,md5('bench-user-'||(i%8))::uuid,
      ST_Y(g),ST_X(g),g::geography,5,-65-(i%30),'wifi_rssi','wifi','wifi_privada',
      'sistema',0,'mediano',now(),'mvp-1','1.0' FROM projected;
    ANALYZE public.mediciones;""")


MAP = "public.public_map_cells(-70.655::float8,-33.457::float8,-70.653::float8,-33.455::float8,0::smallint,NULL::text,50::float8,'wifi_rssi')"
WIDE_MAP = "public.public_map_cells(-71::float8,-34::float8,-70::float8,-33::float8,0::smallint,NULL::text,50::float8,'wifi_rssi')"


def global_cells():
    users=[new_user() for _ in range(5)]
    for lat,lon in ((84,179.8),(-84,-179.8),(0,0),(45,-70)):
        for i,uid in enumerate(users):
            ingest(uid,[measurement(latitud=lat,longitud=lon,potencia_dbm=-65-5*i)])
        expression='public.public_map_cells('+','.join([
            str(lon-0.000001)+'::float8',str(lat-0.000001)+'::float8',
            str(lon+0.000001)+'::float8',str(lat+0.000001)+'::float8',
            "0::smallint","NULL::text","50::float8","'wifi_rssi'"])+')'
        rows=result('(SELECT jsonb_agg(to_jsonb(c)) FROM '+expression+' c)', 'BEGIN;SET LOCAL ROLE anon;', 'ROLLBACK;')
        assert rows and len(rows)==1 and rows[0]['total_contribuyentes']==5
        assert rows[0]['mediana_potencia']==-75


def benchmark():
    execute("INSERT INTO auth.users(id) SELECT md5('bench-user-'||i)::uuid FROM generate_series(0,7) i;")
    budget = float(os.environ.get('KYS_SQL_BUDGET_MS','3000'))
    for size in (1000,10000,100000):
        seed(size)
        for label, expression in [('viewport',MAP),('wide_viewport',WIDE_MAP)]:
            rows = result('(SELECT jsonb_build_object(\'cells\',count(*),\'minimum_contributors\',min(total_contribuyentes)) FROM '+expression+')', 'BEGIN;SET LOCAL ROLE anon;', 'ROLLBACK;')
            assert 0 < rows['cells'] <= 1000 and rows['minimum_contributors'] >= 5
            samples=[]
            for _ in range(10):
                plan=json.loads(execute('BEGIN;SET LOCAL ROLE anon;EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM '+expression+';ROLLBACK;'))[0]
                samples.append(plan['Execution Time'])
            p95=sorted(samples)[math.ceil(len(samples)*0.95)-1]
            record={'rows':size,'query':label,'returned_cells':rows['cells'],'p50_ms':round(statistics.median(samples),3),'p95_ms':round(p95,3),'max_ms':round(max(samples),3),'sql_budget_ms':budget}
            REPORT['benchmarks'].append(record)
            print(json.dumps(record),flush=True)
            assert p95<budget, 'isolated SQL budget exceeded'
    index_plan=json.loads(execute("EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM public.mediciones WHERE ST_Intersects(geom,ST_MakeEnvelope(-70.655,-33.457,-70.653,-33.455,4326)::geography);"))
    assert 'idx_mediciones_geom_gist' in json.dumps(index_plan), 'selective spatial predicate did not use GiST'
    REPORT['spatial_index_plan']=index_plan
    projected_plan=json.loads(execute("EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM public.mediciones WHERE geom_6933 && ST_Transform(ST_MakeEnvelope(-70.655,-33.457,-70.653,-33.455,4326),6933);"))
    assert 'idx_mediciones_geom_6933_gist' in json.dumps(projected_plan), 'projected viewport predicate did not use GiST'
    REPORT['projected_index_plan']=projected_plan


def simultaneous_map_reads():
    def read():
        start = time.perf_counter()
        rows = result('(SELECT jsonb_agg(to_jsonb(c) ORDER BY celda_id) FROM '+WIDE_MAP+' c)', 'BEGIN;SET LOCAL ROLE anon;', 'ROLLBACK;')
        return rows, round((time.perf_counter()-start)*1000,3)
    reads = parallel([read for _ in range(8)])
    assert reads[0][0] and len(reads[0][0])<=1000
    assert all(rows==reads[0][0] for rows,_ in reads)
    REPORT['concurrent_map_client_ms']=[elapsed for _,elapsed in reads]
    timings=sorted(REPORT['concurrent_map_client_ms'])
    print(json.dumps({'concurrent_map':{'clients':8,'rows':100000,'client_p50_ms':round(statistics.median(timings),3),'client_max_ms':max(timings),'scope':'isolated clients, including connection setup; not Cloud SLA'}}),flush=True)


def main():
    # Ignore extension-owned reference objects, but protect any application table,
    # sequence, view or function, even when it has an unrelated name/schema.
    fresh = """to_regnamespace('auth') IS NULL AND NOT EXISTS (
      SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
        AND c.relkind IN ('r','p','v','m','S','f')
        AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass
          AND d.objid=c.oid AND d.deptype='e')
    ) AND NOT EXISTS (
      SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_temp_%'
        AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass
          AND d.objid=p.oid AND d.deptype='e')
    )"""
    if not result(fresh):
        raise RuntimeError('requires a fresh disposable database; existing schemas were not modified')
    if POSTGIS_SCHEMA == 'extensions':
        # Safe only after the disposable/fresh database checks above. No app data exists.
        execute('DROP EXTENSION IF EXISTS postgis CASCADE; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION postgis WITH SCHEMA extensions;')
    execute("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;""")
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        execute(path.read_text())
    REPORT['environment']=result("jsonb_build_object('postgres',version(),'postgis',postgis_full_version(),'time_utc',now())")
    REPORT['postgis_schema']=result("(SELECT to_jsonb(n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis')")
    assert REPORT['postgis_schema'] == POSTGIS_SCHEMA
    print(json.dumps({'environment':REPORT['environment'],'postgis_schema':REPORT['postgis_schema']}),flush=True)
    check('eight simultaneous exact retries produce one row',same_uuid_retries)
    check('simultaneous owners cannot claim the same UUID',owner_conflict)
    check('simultaneous conflicting contents are detected',content_conflict)
    check('eight simultaneous batches of one hundred are accepted',simultaneous_full_batches)
    check('sixteen concurrent requests enforce atomic quota',atomic_quota)
    check('ingestion holds consent until commit; revocation then blocks',lambda:consent_race(True))
    check('revocation holds consent; waiting ingestion is denied',lambda:consent_race(False))
    check('global cell selection works at high latitudes, dateline and origin',global_cells)
    check('map performance and selective GiST plan',benchmark)
    check('eight concurrent map reads preserve identical aggregates',simultaneous_map_reads)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        REPORT['error']=str(error)
        raise
    finally:
        path=Path(os.environ.get('KYS_NATIVE_REPORT',str(Path(__file__).with_name('native-backend-report.json'))))
        path.write_text(json.dumps(REPORT,indent=2)+'\n')
