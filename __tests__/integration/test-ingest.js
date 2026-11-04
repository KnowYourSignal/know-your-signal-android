const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oefdpaqezvksxjgruufv.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_0W31t9KmyJpBoSckNfSnrw_OY4uPZ0W';
/**
 * Script de prueba de integración para el contrato de la API de Ingesta (Grupo 11 -> Grupo 10)
 */
async function testIngestApi() {
  try {
    // 1. Sesión anónima de prueba en Supabase Auth
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify({})
    });

    const authData = await authResponse.json();
    const accessToken = authData.access_token || ANON_KEY;

    // 2. Construcción del payload según esquema 1.0 (UUID dinámico por defecto)
    const payload = {
      esquema_version: "1.0",
      mediciones: [
        {
          id: crypto.randomUUID(),
          latitud: -33.456123,
          longitud: -70.654321,
          precision_m: 5.2,
          potencia_dbm: -72,
          metrica: "wifi_rssi",
          tecnologia_radio: "wifi",
          tipo_conexion: "wifi_privada",
          origen_clasificacion: "sistema",
          piso_nivel: 3,
          tamano_zona: "mediano",
          capturada_en: new Date().toISOString(),
          version_config: "mvp-1",
          version_aviso: "1.0"
        }
      ]
    };

    // 3. Envío hacia la Edge Function ingest-measurements
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ingest-measurements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log(`Status Code: ${response.status}`);
    console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error al probar la ingestión:', error);
  }
}

testIngestApi();