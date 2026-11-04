-- Issues #7/#8. Additive migration: preserve the original migrations and existing data.
BEGIN;
CREATE SCHEMA IF NOT EXISTS kys_private;
REVOKE ALL ON SCHEMA kys_private FROM PUBLIC, anon, authenticated;
-- SECURITY DEFINER lookup paths may contain only trusted schemas (PostGIS can
-- already be installed in either public or extensions). pg_temp is explicitly last.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
CREATE SCHEMA IF NOT EXISTS extensions;
REVOKE CREATE ON SCHEMA extensions FROM PUBLIC, anon, authenticated;

CREATE TABLE kys_private.politica (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  min_contribuyentes integer NOT NULL DEFAULT 5 CHECK (min_contribuyentes >= 2),
  celda_min_m double precision NOT NULL DEFAULT 50 CHECK (celda_min_m >= 50 AND celda_min_m <= 50000),
  antiguedad_dias integer NOT NULL DEFAULT 90 CHECK (antiguedad_dias BETWEEN 1 AND 365),
  solicitudes_minuto integer NOT NULL DEFAULT 60 CHECK (solicitudes_minuto BETWEEN 1 AND 600)
);
INSERT INTO kys_private.politica DEFAULT VALUES;
COMMENT ON TABLE kys_private.politica IS
  'Defaults proposed in IDA, pending team approval before production. Private administrative policy.';
CREATE TABLE kys_private.limite_ingesta (
  usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ventana timestamptz NOT NULL,
  cantidad integer NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA kys_private FROM PUBLIC, anon, authenticated;
ALTER TABLE kys_private.politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE kys_private.limite_ingesta ENABLE ROW LEVEL SECURITY;

-- Prevent bypassing the HTTP validator through direct table writes.
DROP POLICY IF EXISTS "Permitir insercion de mediciones propias" ON public.mediciones;
REVOKE ALL ON public.mediciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.configuraciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.configuraciones TO anon, authenticated;
REVOKE ALL ON public.consentimientos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consentimientos TO authenticated;
DROP POLICY IF EXISTS "Permitir gestionar propio consentimiento" ON public.consentimientos;
CREATE POLICY consentimiento_propio ON public.consentimientos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

-- Disable the legacy RPC which trusted a caller-supplied owner.
REVOKE ALL ON FUNCTION public.insertar_medicion_individual(uuid,uuid,double precision,double precision,real,smallint,text,text,text,text,smallint,text,timestamptz,text,text)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.insertar_medicion_individual(uuid,uuid,double precision,double precision,real,smallint,text,text,text,text,smallint,text,timestamptz,text,text)
  SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE FUNCTION kys_private.configuracion_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Create a new configuration version instead of changing history'; END $$;
REVOKE ALL ON FUNCTION kys_private.configuracion_inmutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER configuracion_inmutable BEFORE UPDATE OR DELETE ON public.configuraciones
  FOR EACH ROW EXECUTE FUNCTION kys_private.configuracion_inmutable();

CREATE FUNCTION public.set_consent(p_habilitado boolean, p_version_aviso text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.consentimientos;
BEGIN
  IF v_uid IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE = 'UNAUTHORIZED'; END IF;
  IF p_habilitado IS NULL OR p_version_aviso IS NULL OR p_version_aviso !~ '^[A-Za-z0-9._-]{1,64}$' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_NOTICE';
  END IF;
  INSERT INTO public.consentimientos(usuario_id, habilitado, version_aviso, actualizado_en)
  VALUES (v_uid, p_habilitado, p_version_aviso, now())
  ON CONFLICT (usuario_id) DO UPDATE SET habilitado = excluded.habilitado,
    version_aviso = excluded.version_aviso, actualizado_en = excluded.actualizado_en
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('habilitado', v_row.habilitado, 'version_aviso', v_row.version_aviso, 'actualizado_en', v_row.actualizado_en);
END $$;
REVOKE ALL ON FUNCTION public.set_consent(boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_consent(boolean,text) TO authenticated;

-- Same checks for HTTP and direct RPC callers; null means a valid measurement.
CREATE FUNCTION kys_private.validar_medicion(m jsonb, ahora timestamptz)
RETURNS text LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE k text; c public.configuraciones; fecha timestamptz; v numeric;
  campos text[] := ARRAY['id','latitud','longitud','precision_m','potencia_dbm','metrica',
    'tecnologia_radio','tipo_conexion','origen_clasificacion','piso_nivel','tamano_zona',
    'capturada_en','version_config','version_aviso'];
BEGIN
  IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RETURN 'INVALID_MEASUREMENT'; END IF;
  IF EXISTS (SELECT FROM jsonb_object_keys(m) AS x(key) WHERE NOT (x.key = ANY(campos))) THEN RETURN 'UNKNOWN_FIELDS'; END IF;
  IF jsonb_typeof(m->'id') IS DISTINCT FROM 'string' OR m->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'INVALID_ID'; END IF;
  FOREACH k IN ARRAY campos LOOP
    IF NOT (m ? k) OR m->k = 'null'::jsonb THEN RETURN 'MISSING_FIELDS'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['latitud','longitud','precision_m','potencia_dbm','piso_nivel'] LOOP
    IF jsonb_typeof(m->k) <> 'number' THEN RETURN CASE WHEN k IN ('latitud','longitud') THEN 'INVALID_COORDINATES'
      WHEN k = 'precision_m' THEN 'INVALID_ACCURACY' WHEN k = 'piso_nivel' THEN 'INVALID_FLOOR' ELSE 'INVALID_METRIC' END; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['metrica','tecnologia_radio','tipo_conexion','origen_clasificacion','tamano_zona','capturada_en','version_config','version_aviso'] LOOP
    IF jsonb_typeof(m->k) <> 'string' THEN RETURN 'INVALID_FIELDS'; END IF;
  END LOOP;
  IF (m->>'latitud')::numeric NOT BETWEEN -90 AND 90 OR (m->>'longitud')::numeric NOT BETWEEN -180 AND 180 THEN RETURN 'INVALID_COORDINATES'; END IF;
  IF m->>'version_config' !~ '^[A-Za-z0-9._-]{1,64}$' THEN RETURN 'UNKNOWN_CONFIG'; END IF;
  SELECT * INTO c FROM public.configuraciones WHERE version = m->>'version_config';
  IF NOT FOUND OR c.esquema_version <> '1.0' THEN RETURN 'UNKNOWN_CONFIG'; END IF;
  IF NOT ((m->>'precision_m')::numeric > 0 AND (m->>'precision_m')::numeric < c.umbral_precision_m) THEN RETURN 'INVALID_ACCURACY'; END IF;
  -- Validate the stored real value too: rounding must not reach the threshold.
  IF NOT ((m->>'precision_m')::real > 0 AND (m->>'precision_m')::real < c.umbral_precision_m) THEN RETURN 'INVALID_ACCURACY'; END IF;
  v := (m->>'piso_nivel')::numeric;
  IF v <> trunc(v) OR v NOT BETWEEN c.pisos_min AND c.pisos_max THEN RETURN 'INVALID_FLOOR'; END IF;
  IF m->>'tamano_zona' NOT IN ('pequeno','mediano','grande','muy_grande') THEN RETURN 'INVALID_ZONE_SIZE'; END IF;
  IF m->>'origen_clasificacion' NOT IN ('sistema','manual','desconocido') THEN RETURN 'INVALID_CLASSIFICATION'; END IF;
  IF NOT ((m->>'metrica' = 'wifi_rssi' AND m->>'tecnologia_radio' = 'wifi') OR
    (m->>'metrica' = 'lte_rsrp' AND m->>'tecnologia_radio' = 'lte') OR
    (m->>'metrica' = 'nr_ss_rsrp' AND m->>'tecnologia_radio' = 'nr') OR
    (m->>'metrica' = 'celular_dbm' AND m->>'tecnologia_radio' = 'otra')) THEN RETURN 'INVALID_METRIC'; END IF;
  v := (m->>'potencia_dbm')::numeric;
  IF v <> trunc(v) OR v > -1 OR v < (CASE WHEN m->>'metrica' = 'wifi_rssi' THEN -127 ELSE -160 END) THEN RETURN 'INVALID_METRIC'; END IF;
  IF (m->>'metrica' = 'wifi_rssi' AND m->>'tipo_conexion' NOT IN ('wifi_publica','wifi_privada','wifi_desconocida'))
    OR (m->>'metrica' <> 'wifi_rssi' AND m->>'tipo_conexion' <> 'datos_moviles') THEN RETURN 'INVALID_CONNECTION'; END IF;
  IF m->>'version_aviso' !~ '^[A-Za-z0-9._-]{1,64}$' THEN RETURN 'INVALID_NOTICE'; END IF;
  IF m->>'capturada_en' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' THEN RETURN 'INVALID_TIMESTAMP'; END IF;
  BEGIN fecha := (m->>'capturada_en')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN 'INVALID_TIMESTAMP'; END;
  IF fecha > ahora + interval '5 minutes' THEN RETURN 'FUTURE_TIMESTAMP'; END IF;
  IF fecha < ahora - make_interval(days => (SELECT antiguedad_dias FROM kys_private.politica)) THEN RETURN 'STALE_MEASUREMENT'; END IF;
  RETURN NULL;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN 'INVALID_FIELDS';
END $$;
REVOKE ALL ON FUNCTION kys_private.validar_medicion(jsonb,timestamptz) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ingest_measurements(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); m jsonb; codigo text; consentimiento public.consentimientos;
  previo public.mediciones; n integer; peticiones integer; ahora timestamptz := now();
  aceptadas jsonb := '[]'; duplicadas jsonb := '[]'; rechazadas jsonb := '[]';
BEGIN
  IF v_uid IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE = 'UNAUTHORIZED'; END IF;
  IF octet_length(p_payload::text) > 262144 THEN RAISE SQLSTATE 'PT413' USING MESSAGE = 'PAYLOAD_TOO_LARGE'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_ENVELOPE';
  END IF;
  IF EXISTS (SELECT FROM jsonb_object_keys(p_payload) x(key) WHERE x.key NOT IN ('esquema_version','mediciones')) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_ENVELOPE';
  END IF;
  IF p_payload->>'esquema_version' IS DISTINCT FROM '1.0' THEN RAISE SQLSTATE 'PT400' USING MESSAGE = 'UNSUPPORTED_SCHEMA'; END IF;
  IF jsonb_typeof(p_payload->'mediciones') IS DISTINCT FROM 'array' THEN RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_BATCH'; END IF;
  IF jsonb_array_length(p_payload->'mediciones') NOT BETWEEN 1 AND 100 OR
    EXISTS (SELECT FROM jsonb_array_elements(p_payload->'mediciones') x WHERE jsonb_typeof(x) <> 'object') THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_BATCH';
  END IF;
  -- The row lock serializes this transaction with consent revocation.
  SELECT * INTO consentimiento FROM public.consentimientos WHERE usuario_id = v_uid FOR SHARE;
  IF NOT FOUND OR NOT consentimiento.habilitado THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'CONSENT_REQUIRED'; END IF;
  INSERT INTO kys_private.limite_ingesta AS l(usuario_id,ventana,cantidad)
    VALUES(v_uid,date_trunc('minute',ahora),1)
    ON CONFLICT(usuario_id) DO UPDATE SET ventana=excluded.ventana,
      cantidad=CASE WHEN l.ventana=excluded.ventana THEN l.cantidad+1 ELSE 1 END
    RETURNING cantidad INTO peticiones;
  IF peticiones > (SELECT solicitudes_minuto FROM kys_private.politica) THEN RAISE SQLSTATE 'PT429' USING MESSAGE = 'RATE_LIMITED'; END IF;

  FOR m IN SELECT value FROM jsonb_array_elements(p_payload->'mediciones') LOOP
    codigo := kys_private.validar_medicion(m,ahora);
    IF codigo IS NULL AND m->>'version_aviso' <> consentimiento.version_aviso THEN codigo := 'CONSENT_REQUIRED'; END IF;
    IF codigo IS NULL THEN
      INSERT INTO public.mediciones(id,usuario_id,latitud,longitud,geom,precision_m,potencia_dbm,
        metrica,tecnologia_radio,tipo_conexion,origen_clasificacion,piso_nivel,tamano_zona,
        capturada_en,version_config,version_aviso)
      VALUES((m->>'id')::uuid,v_uid,(m->>'latitud')::double precision,(m->>'longitud')::double precision,
        ST_SetSRID(ST_MakePoint((m->>'longitud')::double precision,(m->>'latitud')::double precision),4326)::geography,
        (m->>'precision_m')::real,(m->>'potencia_dbm')::smallint,m->>'metrica',m->>'tecnologia_radio',
        m->>'tipo_conexion',m->>'origen_clasificacion',(m->>'piso_nivel')::smallint,m->>'tamano_zona',
        (m->>'capturada_en')::timestamptz,m->>'version_config',m->>'version_aviso')
      ON CONFLICT(id) DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 1 THEN aceptadas := aceptadas || jsonb_build_array(m->>'id');
      ELSE
        SELECT * INTO previo FROM public.mediciones WHERE id=(m->>'id')::uuid;
        IF ROW(previo.usuario_id,previo.latitud,previo.longitud,previo.precision_m,previo.potencia_dbm,
          previo.metrica,previo.tecnologia_radio,previo.tipo_conexion,previo.origen_clasificacion,
          previo.piso_nivel,previo.tamano_zona,previo.capturada_en,previo.version_config,previo.version_aviso)
          IS NOT DISTINCT FROM ROW(v_uid,(m->>'latitud')::double precision,(m->>'longitud')::double precision,
          (m->>'precision_m')::real,(m->>'potencia_dbm')::smallint,m->>'metrica',m->>'tecnologia_radio',
          m->>'tipo_conexion',m->>'origen_clasificacion',(m->>'piso_nivel')::smallint,m->>'tamano_zona',
          (m->>'capturada_en')::timestamptz,m->>'version_config',m->>'version_aviso') THEN
          duplicadas := duplicadas || jsonb_build_array(m->>'id');
        ELSE codigo := 'ID_CONFLICT'; END IF;
      END IF;
    END IF;
    IF codigo IS NOT NULL THEN rechazadas := rechazadas || jsonb_build_array(jsonb_build_object(
      'id',m->>'id','codigo_error',codigo,'mensaje',codigo,'reintentable',false)); END IF;
  END LOOP;
  -- Unexpected database errors abort the transaction: do not acknowledge partial writes.
  RETURN jsonb_build_object('aceptadas',aceptadas,'duplicadas',duplicadas,'rechazadas',rechazadas);
END $$;
REVOKE ALL ON FUNCTION public.ingest_measurements(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_measurements(jsonb) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_mediciones_filtros ON public.mediciones(piso_nivel,metrica,capturada_en);
CREATE INDEX IF NOT EXISTS idx_mediciones_usuario ON public.mediciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_version_config ON public.mediciones(version_config);

-- New optional filters extend the existing RPC name; metric selection is mandatory.
DROP FUNCTION public.public_map_cells(double precision,double precision,double precision,double precision,smallint,text,double precision);
CREATE FUNCTION public.public_map_cells(min_lon double precision,min_lat double precision,
  max_lon double precision,max_lat double precision,piso_filtro smallint,tipo_conexion_filtro text,
  grid_size_m double precision DEFAULT 50,metrica_filtro text DEFAULT NULL,
  desde timestamptz DEFAULT NULL,hasta timestamptz DEFAULT NULL)
RETURNS TABLE(celda_id text,longitud_centro double precision,latitud_centro double precision,
  mediana_potencia numeric,total_muestras bigint,total_contribuyentes bigint,
  metrica text,tecnologia_radio text,tipo_conexion text,resolucion_m double precision)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE resolucion double precision; caja geometry; ampliada geography;
  x0 double precision; x1 double precision; y0 double precision; y1 double precision;
  ix0 bigint; ix1 bigint; iy0 bigint; iy1 bigint;
  politica kys_private.politica; inicio timestamptz; fin timestamptz;
BEGIN
  SELECT * INTO politica FROM kys_private.politica;
  IF min_lon IS NULL OR max_lon IS NULL OR min_lat IS NULL OR max_lat IS NULL OR
    NOT (min_lon BETWEEN -180 AND 180 AND max_lon BETWEEN -180 AND 180 AND min_lon < max_lon
      AND min_lat BETWEEN -85 AND 85 AND max_lat BETWEEN -85 AND 85 AND min_lat < max_lat)
    THEN RAISE SQLSTATE 'PT400' USING MESSAGE='INVALID_VIEWPORT'; END IF;
  IF max_lon-min_lon > 2 OR max_lat-min_lat > 2 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='ZOOM_REQUIRED'; END IF;
  IF piso_filtro IS NULL OR NOT EXISTS (SELECT FROM public.configuraciones c WHERE piso_filtro BETWEEN c.pisos_min AND c.pisos_max) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='INVALID_FLOOR'; END IF;
  IF metrica_filtro IS NULL OR metrica_filtro NOT IN ('wifi_rssi','lte_rsrp','nr_ss_rsrp','celular_dbm') THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='METRIC_REQUIRED'; END IF;
  IF tipo_conexion_filtro IS NOT NULL AND tipo_conexion_filtro NOT IN ('wifi_publica','wifi_privada','wifi_desconocida','datos_moviles') THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='INVALID_CONNECTION'; END IF;
  IF grid_size_m IS NULL OR NOT (grid_size_m >= politica.celda_min_m AND grid_size_m <= 50000) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='INVALID_GRID_SIZE'; END IF;
  -- Fixed UTC day boundaries prevent arbitrarily narrow temporal probes.
  inicio := COALESCE(desde,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - make_interval(days=>politica.antiguedad_dias));
  fin := COALESCE(hasta,(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day');
  IF inicio <> (date_trunc('day',inicio AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') OR
    fin <> (date_trunc('day',fin AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') OR fin<=inicio OR
    fin-inicio > make_interval(days=>politica.antiguedad_dias+1) OR fin>now()+interval '1 day' OR
    inicio < now()-make_interval(days=>politica.antiguedad_dias+1) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='INVALID_TIME_WINDOW'; END IF;
  -- EPSG:6933 is a fixed equal-area metric grid. Its projected metre dimensions
  -- are not a guarantee of ground-distance or indoor positioning accuracy.
  caja := ST_Transform(ST_MakeEnvelope(min_lon,min_lat,max_lon,max_lat,4326),6933);
  x0:=ST_XMin(caja); x1:=ST_XMax(caja); y0:=ST_YMin(caja); y1:=ST_YMax(caja);
  resolucion := politica.celda_min_m * power(2,ceil(ln(grid_size_m/politica.celda_min_m)/ln(2.0)));
  LOOP
    ix0:=floor(x0/resolucion); ix1:=floor(x1/resolucion);
    iy0:=floor(y0/resolucion); iy1:=floor(y1/resolucion);
    -- At most three Wi-Fi connection categories per spatial cell: <=999 rows.
    EXIT WHEN (ix1-ix0+1)::numeric*(iy1-iy0+1)::numeric<=333;
    resolucion:=resolucion*2;
    IF resolucion>1000000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='ZOOM_REQUIRED'; END IF;
  END LOOP;
  -- Clamp the last cells to the projection's world extent near +/-180 degrees.
  ampliada := ST_Transform(ST_MakeEnvelope(
    greatest(ix0*resolucion,ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(-180,0),4326),6933))),
    greatest(iy0*resolucion,ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(0,-86),4326),6933))),
    least((ix1+1)*resolucion,ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(180,0),4326),6933))),
    least((iy1+1)*resolucion,ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(0,86),4326),6933))),6933),4326)::geography;
  RETURN QUERY
  WITH candidatas AS MATERIALIZED (
    SELECT m.*, ST_Transform(m.geom::geometry,6933) AS proyectada
    FROM public.mediciones m JOIN public.configuraciones c ON c.version=m.version_config
    WHERE ST_Intersects(m.geom,ampliada) AND m.piso_nivel=piso_filtro
      AND m.metrica=metrica_filtro AND m.capturada_en>=inicio AND m.capturada_en<fin
      AND (tipo_conexion_filtro IS NULL OR m.tipo_conexion=tipo_conexion_filtro)
      -- Legacy data is retained, but invalid legacy rows cannot reach the map.
      AND m.precision_m>0 AND m.precision_m<c.umbral_precision_m
      AND m.piso_nivel BETWEEN c.pisos_min AND c.pisos_max
      AND m.potencia_dbm BETWEEN CASE WHEN m.metrica='wifi_rssi' THEN -127 ELSE -160 END AND -1
      AND ((m.metrica='wifi_rssi' AND m.tecnologia_radio='wifi' AND m.tipo_conexion IN ('wifi_publica','wifi_privada','wifi_desconocida'))
        OR (m.metrica='lte_rsrp' AND m.tecnologia_radio='lte' AND m.tipo_conexion='datos_moviles')
        OR (m.metrica='nr_ss_rsrp' AND m.tecnologia_radio='nr' AND m.tipo_conexion='datos_moviles')
        OR (m.metrica='celular_dbm' AND m.tecnologia_radio='otra' AND m.tipo_conexion='datos_moviles'))
  ), celdas AS (
    SELECT floor(ST_X(m.proyectada)/resolucion)::bigint AS cx,
      floor(ST_Y(m.proyectada)/resolucion)::bigint AS cy,m.* FROM candidatas m
  ), agregados AS (
    SELECT c.cx,c.cy,c.metrica,c.tecnologia_radio,c.tipo_conexion,
      percentile_cont(0.5) WITHIN GROUP(ORDER BY c.potencia_dbm)::numeric AS potencia,
      count(*) AS muestras,count(DISTINCT c.usuario_id) AS contribuyentes
    FROM celdas c WHERE c.cx BETWEEN ix0 AND ix1 AND c.cy BETWEEN iy0 AND iy1
    GROUP BY c.cx,c.cy,c.metrica,c.tecnologia_radio,c.tipo_conexion
    HAVING count(DISTINCT c.usuario_id)>=politica.min_contribuyentes
  )
  SELECT concat(resolucion,':',a.cx,':',a.cy,':',a.metrica,':',a.tipo_conexion),
    ST_X(centro.g),ST_Y(centro.g),a.potencia,a.muestras,a.contribuyentes,
    a.metrica,a.tecnologia_radio,a.tipo_conexion,resolucion
  FROM agregados a CROSS JOIN LATERAL (
    SELECT ST_Transform(ST_SetSRID(ST_MakePoint((a.cx+0.5)*resolucion,(a.cy+0.5)*resolucion),6933),4326) AS g
  ) centro ORDER BY a.cx,a.cy,a.metrica,a.tipo_conexion;
END $$;
REVOKE ALL ON FUNCTION public.public_map_cells(double precision,double precision,double precision,double precision,smallint,text,double precision,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_cells(double precision,double precision,double precision,double precision,smallint,text,double precision,text,timestamptz,timestamptz) TO anon,authenticated;
COMMIT;
