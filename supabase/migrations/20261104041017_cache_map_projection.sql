-- Cache the server-derived projection once per write, not once per map read.
-- Existing measurement fields and the public RPC contract remain unchanged.
BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.mediciones ADD COLUMN geom_6933 geometry(Point,6933)
  GENERATED ALWAYS AS (ST_Transform(geom::geometry,6933)) STORED;
COMMENT ON COLUMN public.mediciones.geom_6933 IS
  'Private server-maintained EPSG:6933 projection cache; never a public coordinate field.';

CREATE OR REPLACE FUNCTION public.public_map_cells(min_lon double precision,min_lat double precision,
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
  WITH candidatas AS (
    SELECT m.usuario_id,m.potencia_dbm,m.metrica,m.tecnologia_radio,
      m.tipo_conexion,m.geom_6933 AS proyectada
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
COMMIT;
