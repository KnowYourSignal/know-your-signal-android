-- ==============================================================================
-- ISSUE #7: [Backend] Modelo de Datos y Seguridad RLS en Supabase (Grupo 11)
-- ==============================================================================

-- 1. Habilitar extensión PostGIS para datos espaciales (SRID 4326)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Crear tabla de configuraciones (Catálogo versionado de parámetros)
CREATE TABLE IF NOT EXISTS public.configuraciones (
    version TEXT PRIMARY KEY,
    umbral_precision_m REAL NOT NULL,
    edad_max_ms INTEGER NOT NULL,
    desfase_max_ms INTEGER NOT NULL,
    pisos_min SMALLINT NOT NULL,
    pisos_max SMALLINT NOT NULL,
    esquema_version TEXT NOT NULL,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insertar configuración inicial del MVP (mvp-1)
INSERT INTO public.configuraciones (version, umbral_precision_m, edad_max_ms, desfase_max_ms, pisos_min, pisos_max, esquema_version)
VALUES ('mvp-1', 10.0, 5000, 2000, -10, 150, '1.0');

-- 3. Crear tabla de consentimientos (Opt-in)
CREATE TABLE IF NOT EXISTS public.consentimientos (
    usuario_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    habilitado BOOLEAN NOT NULL DEFAULT false,
    version_aviso TEXT NOT NULL,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Crear tabla de mediciones (Evidencia cruda)
CREATE TABLE IF NOT EXISTS public.mediciones (
    id UUID PRIMARY KEY, -- Generado localmente en el móvil para idempotencia
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    latitud DOUBLE PRECISION NOT NULL CHECK (latitud BETWEEN -90 AND 90),
    longitud DOUBLE PRECISION NOT NULL CHECK (longitud BETWEEN -180 AND 180),
    geom GEOGRAPHY(Point, 4326) NOT NULL, -- Calculado por servidor
    precision_m REAL NOT NULL CHECK (precision_m > 0),
    potencia_dbm SMALLINT NOT NULL,
    metrica TEXT NOT NULL,
    tecnologia_radio TEXT NOT NULL,
    tipo_conexion TEXT NOT NULL,
    origen_clasificacion TEXT NOT NULL,
    piso_nivel SMALLINT NOT NULL,
    tamano_zona TEXT NOT NULL,
    capturada_en TIMESTAMP WITH TIME ZONE NOT NULL,
    recibida_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version_config TEXT NOT NULL REFERENCES public.configuraciones(version),
    version_aviso TEXT NOT NULL
);

-- 5. Crear índice espacial GiST para optimizar búsquedas geográficas del mapa público
CREATE INDEX IF NOT EXISTS idx_mediciones_geom_gist 
ON public.mediciones USING GIST (geom);

-- 6. Habilitar Row Level Security (RLS) en las tablas
ALTER TABLE public.configuraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consentimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mediciones ENABLE ROW LEVEL SECURITY;

-- 7. Políticas de Seguridad (RLS)

-- Configuraciones: Solo lectura pública (necesario para que la app sepa qué reglas aplicar)
CREATE POLICY "Permitir lectura publica de configuraciones" 
ON public.configuraciones FOR SELECT USING (true);

-- Consentimientos: El usuario solo puede ver/modificar su propio consentimiento
CREATE POLICY "Permitir gestionar propio consentimiento" 
ON public.consentimientos FOR ALL USING (auth.uid() = usuario_id);

-- Mediciones: Bloquear lectura masiva directa. Solo inserción autorizada mediante Edge Functions.
CREATE POLICY "Bloquear lectura publica directa de mediciones crudas" 
ON public.mediciones FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "Permitir insercion de mediciones propias" 
ON public.mediciones FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);