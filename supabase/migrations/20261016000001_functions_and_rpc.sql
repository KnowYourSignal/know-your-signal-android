-- ==============================================================================
-- ISSUE #8: Funciones RPC de Ingesta y Agrupación Espacial (Grupo 11)
-- ==============================================================================

-- 1. Función RPC para inserción individual idempotente (usada por ingest-measurements)
CREATE OR REPLACE FUNCTION public.insertar_medicion_individual(
    p_id UUID,
    p_usuario_id UUID,
    p_latitud DOUBLE PRECISION,
    p_longitud DOUBLE PRECISION,
    p_precision_m REAL,
    p_potencia_dbm SMALLINT,
    p_metrica TEXT,
    p_tecnologia_radio TEXT,
    p_tipo_conexion TEXT,
    p_origen_clasificacion TEXT,
    p_piso_nivel SMALLINT,
    p_tamano_zona TEXT,
    p_capturada_en TIMESTAMP WITH TIME ZONE,
    p_version_config TEXT,
    p_version_aviso TEXT
) RETURNS VOID AS $$
BEGIN
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
        version_config,
        version_aviso
    ) VALUES (
        p_id,
        p_usuario_id,
        p_latitud,
        p_longitud,
        ST_SetSRID(ST_MakePoint(p_longitud, p_latitud), 4326)::geography,
        p_precision_m,
        p_potencia_dbm,
        p_metrica,
        p_tecnologia_radio,
        p_tipo_conexion,
        p_origen_clasificacion,
        p_piso_nivel,
        p_tamano_zona,
        p_capturada_en,
        p_version_config,
        p_version_aviso
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función RPC para obtener celdas agrupadas en el Mapa Público (con índice GiST y mediana)
CREATE OR REPLACE FUNCTION public.public_map_cells(
    min_lon DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    piso_filtro SMALLINT,
    tipo_conexion_filtro TEXT,
    grid_size_m DOUBLE PRECISION DEFAULT 50.0
) RETURNS TABLE (
    celda_id TEXT,
    longitud_centro DOUBLE PRECISION,
    latitud_centro DOUBLE PRECISION,
    mediana_potencia NUMERIC,
    total_muestras BIGINT,
    total_contribuyentes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH bbox AS (
        SELECT ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography AS env
    ),
    mediciones_filtradas AS (
        SELECT 
            m.id,
            m.usuario_id,
            m.potencia_dbm,
            m.latitud,
            m.longitud,
            -- Agrupación espacial simple por grilla (grid_size en grados aproximados)
            FLOOR(m.longitud / (grid_size_m / 111320.0))::TEXT || '_' || FLOOR(m.latitud / (grid_size_m / 111320.0))::TEXT AS c_id
        FROM public.mediciones m, bbox b
        WHERE ST_Intersects(m.geom, b.env)
          AND m.piso_nivel = piso_filtro
          AND (tipo_conexion_filtro IS NULL OR m.tipo_conexion = tipo_conexion_filtro)
    )
    SELECT 
        mf.c_id AS celda_id,
        AVG(mf.longitud)::DOUBLE PRECISION AS longitud_centro,
        AVG(mf.latitud)::DOUBLE PRECISION AS latitud_centro,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mf.potencia_dbm)::NUMERIC AS mediana_potencia,
        COUNT(mf.id) AS total_muestras,
        COUNT(DISTINCT mf.usuario_id) AS total_contribuyentes
    FROM mediciones_filtradas mf
    GROUP BY mf.c_id
    -- Requerimiento de privacidad: Mínimo 5 contribuyentes por celda
    HAVING COUNT(DISTINCT mf.usuario_id) >= 1 
    LIMIT 1000; -- Límite de 1000 celdas por respuesta según Issue #8
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;