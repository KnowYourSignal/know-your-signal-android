-- Read-only deployment checks for issues #7/#8. No users or measurements created.
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','kys_private')
  AND c.relname IN ('mediciones','consentimientos','configuraciones','politica','limite_ingesta')
ORDER BY n.nspname,c.relname;

SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS security_definer,
  p.proconfig AS settings,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('insertar_medicion_individual','set_consent','ingest_measurements','public_map_cells')
ORDER BY p.proname;

SELECT format_type(a.atttypid,a.atttypmod) AS spatial_type
FROM pg_attribute a WHERE a.attrelid='public.mediciones'::regclass AND a.attname='geom';
SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS spatial_type,
  a.attgenerated AS generated,
  has_column_privilege('anon',a.attrelid,a.attnum,'SELECT') AS anon_select,
  has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT') AS authenticated_select
FROM pg_attribute a WHERE a.attrelid='public.mediciones'::regclass
  AND a.attname IN ('geom','geom_6933') AND NOT a.attisdropped;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='mediciones';
SELECT min_contribuyentes,celda_min_m,antiguedad_dias,solicitudes_minuto FROM kys_private.politica;
-- Compare original fields even when the private derived cache column is present.
SELECT count(*) AS measurements,
  md5(string_agg(md5((to_jsonb(m)-'geom_6933')::text),'' ORDER BY id)) AS original_fields_checksum
FROM public.mediciones m;
ROLLBACK;
