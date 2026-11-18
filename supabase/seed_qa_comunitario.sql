-- ==============================================================================
-- SEED DE PRUEBAS QA PARA MAPA COMUNITARIO (k-anonimato >= 5 contribuyentes)
-- Ejecutar en Supabase SQL Editor. Idempotente (ON CONFLICT DO NOTHING).
-- Incluye:
--   1) 5 usuarios anonimos sinteticos en auth.users + public.consentimientos
--   2) Zonas del equipo (Maipu, San Bernardo, Estacion Central)
--   3) Cenco Costanera (exclusivamente niveles del Mall: pisos -1 a 5, sin torre de oficinas)
-- ==============================================================================

BEGIN;

-- 1. Crear 5 usuarios anonimos sinteticos para superar el umbral k >= 5
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  is_anonymous,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
SELECT
  ('a0000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  NULL,
  '',
  NULL,
  true,
  now(),
  now(),
  '{"provider":"anonymous","providers":["anonymous"]}'::jsonb,
  '{}'::jsonb
FROM generate_series(1, 5) AS n
ON CONFLICT (id) DO NOTHING;

-- 2. Registrar consentimiento opt-in habilitado para los 5 usuarios
INSERT INTO public.consentimientos (usuario_id, habilitado, version_aviso, actualizado_en)
SELECT
  ('a0000000-0000-4000-8000-00000000000' || n)::uuid,
  true,
  '1.0',
  now()
FROM generate_series(1, 5) AS n
ON CONFLICT (usuario_id) DO UPDATE
SET habilitado = true, actualizado_en = now();

-- 3. Insertar mediciones en zonas del equipo + Mall Cenco Costanera (pisos -1 a 5)
WITH puntos_base (zona, lat, lon, piso, metrica, tecnologia, conexion, tamano, dbm_base) AS (
  VALUES
    -- Zona Equipo 1: Maipu (Pje. Holanda / Arica)
    ('maipu', -33.48881, -70.74432, 0, 'wifi_rssi',  'wifi', 'wifi_privada',  'pequeno', -56),
    ('maipu', -33.48881, -70.74432, 1, 'wifi_rssi',  'wifi', 'wifi_privada',  'grande',  -61),
    ('maipu', -33.48881, -70.74432, 2, 'wifi_rssi',  'wifi', 'wifi_privada',  'pequeno', -67),
    ('maipu', -33.48881, -70.74432, 1, 'lte_rsrp',   'lte',  'datos_moviles', 'grande',  -98),
    ('maipu', -33.48881, -70.74432, 2, 'lte_rsrp',   'lte',  'datos_moviles', 'pequeno', -105),

    -- Zona Equipo 2: San Bernardo (entorno Mallplaza Sur)
    ('san_bernardo', -33.63775, -70.67805, 0, 'wifi_rssi', 'wifi', 'wifi_privada',  'mediano', -63),
    ('san_bernardo', -33.63775, -70.67805, 1, 'wifi_rssi', 'wifi', 'wifi_privada',  'pequeno', -66),
    ('san_bernardo', -33.63775, -70.67805, 0, 'lte_rsrp',  'lte',  'datos_moviles', 'mediano', -92),

    -- Zona Equipo 3: Estacion Central
    ('estacion_central', -33.45582, -70.70983, 1, 'wifi_rssi', 'wifi', 'wifi_privada',  'pequeno', -59),
    ('estacion_central', -33.45582, -70.70983, 2, 'wifi_rssi', 'wifi', 'wifi_privada',  'pequeno', -54),
    ('estacion_central', -33.45582, -70.70983, 1, 'lte_rsrp',  'lte',  'datos_moviles', 'mediano', -95),

    -- Cenco Costanera (SOLO Mall Costanera Center, pisos -1 a 5, sin torre de oficinas)
    -- Subterraneo -1 (Supermercado / Estacionamiento): senal celular debil, Wi-Fi intermedia
    ('costanera_mall', -33.41772, -70.60632, -1, 'lte_rsrp',   'lte',  'datos_moviles', 'muy_grande', -112),
    ('costanera_mall', -33.41772, -70.60632, -1, 'wifi_rssi',  'wifi', 'wifi_publica',  'muy_grande', -73),
    -- Piso 0 (Acceso / Nivel Calle): buena cobertura
    ('costanera_mall', -33.41772, -70.60632,  0, 'lte_rsrp',   'lte',  'datos_moviles', 'muy_grande', -86),
    ('costanera_mall', -33.41772, -70.60632,  0, 'nr_ss_rsrp', 'nr',   'datos_moviles', 'muy_grande', -88),
    ('costanera_mall', -33.41772, -70.60632,  0, 'wifi_rssi',  'wifi', 'wifi_publica',  'muy_grande', -62),
    -- Piso 1 (Tiendas Nivel 1)
    ('costanera_mall', -33.41768, -70.60628,  1, 'lte_rsrp',   'lte',  'datos_moviles', 'grande',     -91),
    ('costanera_mall', -33.41768, -70.60628,  1, 'wifi_rssi',  'wifi', 'wifi_publica',  'grande',     -64),
    -- Piso 2 (Tiendas Nivel 2)
    ('costanera_mall', -33.41776, -70.60635,  2, 'lte_rsrp',   'lte',  'datos_moviles', 'grande',     -94),
    ('costanera_mall', -33.41776, -70.60635,  2, 'wifi_rssi',  'wifi', 'wifi_publica',  'grande',     -68),
    -- Piso 3 (Tiendas Nivel 3)
    ('costanera_mall', -33.41770, -70.60640,  3, 'lte_rsrp',   'lte',  'datos_moviles', 'grande',     -97),
    ('costanera_mall', -33.41770, -70.60640,  3, 'wifi_rssi',  'wifi', 'wifi_publica',  'grande',     -70),
    -- Piso 4 (Patio de Comidas - alta densidad)
    ('costanera_mall', -33.41774, -70.60626,  4, 'lte_rsrp',   'lte',  'datos_moviles', 'muy_grande', -101),
    ('costanera_mall', -33.41774, -70.60626,  4, 'nr_ss_rsrp', 'nr',   'datos_moviles', 'muy_grande', -96),
    ('costanera_mall', -33.41774, -70.60626,  4, 'wifi_rssi',  'wifi', 'wifi_publica',  'muy_grande', -65),
    -- Piso 5 (Cine / Terraza Mall)
    ('costanera_mall', -33.41771, -70.60633,  5, 'lte_rsrp',   'lte',  'datos_moviles', 'muy_grande', -89),
    ('costanera_mall', -33.41771, -70.60633,  5, 'wifi_rssi',  'wifi', 'wifi_publica',  'muy_grande', -61)
),
expandido AS (
  SELECT
    pb.*,
    u.n,
    ('a0000000-0000-4000-8000-00000000000' || u.n)::uuid AS uid,
    -- Pequeño jitter <= 6 metros dentro de la misma celda de ~55m
    pb.lat + ((u.n - 3) * 0.000025) AS lat_j,
    pb.lon + (((u.n % 3) - 1) * 0.000025) AS lon_j,
    -- Variacion realista de +-3 dBm por usuario
    (pb.dbm_base + ((u.n - 3) * 2))::smallint AS dbm_j,
    -- UUID deterministico para idempotencia
    md5(pb.zona || ':' || pb.piso || ':' || pb.metrica || ':' || u.n)::uuid AS row_id
  FROM puntos_base pb
  CROSS JOIN generate_series(1, 5) AS u(n)
)
INSERT INTO public.mediciones (
  id,
  usuario_id,
  latitud,
  longitud,
  geom,
  precision_m,
  potencia_dbm,
  metrica,
  tecnologia_radio,
  tipo_conexion,
  origen_clasificacion,
  piso_nivel,
  tamano_zona,
  capturada_en,
  recibida_en,
  version_config,
  version_aviso
)
SELECT
  row_id,
  uid,
  lat_j,
  lon_j,
  ST_SetSRID(ST_MakePoint(lon_j, lat_j), 4326)::geography,
  (3.5 + (n * 0.7))::real,
  dbm_j,
  metrica,
  tecnologia,
  conexion,
  'sistema',
  piso,
  tamano,
  now() - ((n * 15) || ' minutes')::interval,
  now(),
  'mvp-1',
  '1.0'
FROM expandido
ON CONFLICT (id) DO NOTHING;

COMMIT;
