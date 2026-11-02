import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta token de autorizacion" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Obtener usuario autenticado/anonimo desde el JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuario no autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const mediciones = body.mediciones;

    if (!Array.isArray(mediciones) || mediciones.length === 0 || mediciones.length > 100) {
      return new Response(
        JSON.stringify({ error: "El lote debe contener entre 1 y 100 mediciones" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aceptadas: string[] = [];
    const duplicadas: string[] = [];
    const rechazadas: { id: string; motivo: string }[] = [];

    for (const m of mediciones) {
      // Validaciones basicas de coordenadas y campos requeridos
      if (
        typeof m.latitud !== "number" ||
        typeof m.longitud !== "number" ||
        Math.abs(m.latitud) > 90 ||
        Math.abs(m.longitud) > 180 ||
        !m.id ||
        !m.potencia_dbm ||
        !m.piso_nivel
      ) {
        rechazadas.push({ id: m.id || "desconocido", motivo: "INVALID_COORDINATES_OR_FIELDS" });
        continue;
      }

      // Insercion idempotente utilizando la columna geom calculada por ST_SetSRID
      const { error: insertError } = await supabase.rpc("insertar_medicion_individual", {
        p_id: m.id,
        p_usuario_id: user.id,
        p_latitud: m.latitud,
        p_longitud: m.longitud,
        p_precision_m: m.precision_m,
        p_potencia_dbm: m.potencia_dbm,
        p_metrica: m.metrica,
        p_tecnologia_radio: m.tecnologia_radio,
        p_tipo_conexion: m.tipo_conexion,
        p_origen_clasificacion: m.origen_clasificacion,
        p_piso_nivel: m.piso_nivel,
        p_tamano_zona: m.tamano_zona,
        p_capturada_en: m.capturada_en,
        p_version_config: m.version_config || "mvp-1",
        p_version_aviso: m.version_aviso || "1.0",
      });

      if (insertError) {
        if (insertError.code === "23505") { // Violacion de PK / Duplicado
          duplicadas.push(m.id);
        } else {
          rechazadas.push({ id: m.id, motivo: insertError.message });
        }
      } else {
        aceptadas.push(m.id);
      }
    }

    return new Response(
      JSON.stringify({ aceptadas, duplicadas, rechazadas }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});