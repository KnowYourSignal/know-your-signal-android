# Backend del grupo 11 — issues #7 y #8

Implementación contrastada con la PDS y las secciones 4.5, 4.5.1 y 4.7 del IDA.
El reparto operativo sigue los issues de QuilPalta: backend #7/#8; el worker #3 y
las pantallas del mapa #9 siguen perteneciendo al grupo 10. El plan de la PDS
distribuye esas dos últimas responsabilidades de otra manera: el equipo debe
dejar acordada esa diferencia.

## Instalación y verificación local

Las migraciones antiguas se conservan. `20261104000000_harden_backend.sql` añade
los controles sin borrar mediciones existentes. No se debe editar una migración ya
aplicada ni ejecutar `db reset` sobre un proyecto remoto.

Pruebas aisladas, sin cuenta de Supabase, Docker ni datos remotos (Node >=24.3):

```sh
npm ci --prefix tests/backend
npm run check:backend
npm run test:backend
```

Las pruebas SQL usan PostgreSQL WASM/PGlite con PostGIS real y un esquema Auth
mínimo que reproduce roles/JWT de Supabase. Comprueban migraciones, permisos,
consentimiento, reintentos, conflictos, privacidad y rollback. No sustituyen las
pruebas de concurrencia ni la validación del gateway/Auth en Supabase Cloud.
La migración también se prueba con una medición anterior ya guardada: conserva
sus datos y no inventa un consentimiento para autorizar envíos nuevos.

`supabase/verify-backend.sql` permite comprobar tablas, permisos, geometría,
índices y parámetros tras el despliegue mediante consultas de solo lectura.
Resultados esperados: sin lectura ni inserción directa de mediciones para roles
API; RPC antigua sin EXECUTE; ingesta/consentimiento solo para authenticated;
mapa agregado disponible para anon y authenticated; todas las RPC nuevas con
search_path fijo. No ejecutar el script de integración local contra Cloud.

Para probar el stack Supabase completo en un entorno local desechable:

```sh
supabase start
supabase db reset
supabase functions serve ingest-measurements
# En otra terminal, define SUPABASE_ANON_KEY con la clave del stack local.
npm run test:backend:integration
```

`config.toml` habilita Auth anónimo en local y conserva `verify_jwt = true`.
La configuración de Auth Cloud se habilita aparte en el Dashboard; este repositorio
no puede probar que el proyecto remoto tenga el mismo estado. La función usa
`SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`, siempre con el
JWT del usuario; no necesita `service_role`. Una clave publicable no reemplaza al JWT.

## Consentimiento

Después de `signInAnonymously`, el cliente llama como `authenticated`:

```json
{"p_habilitado": true, "p_version_aviso": "1.0"}
```

Endpoint RPC: `/rest/v1/rpc/set_consent`. El servidor deriva el propietario desde
`auth.uid()`. Para revocar se envía `false`. La ingesta bloquea el registro de
consentimiento durante su transacción: revocación y envío quedan serializados.
Revocar bloquea envíos siguientes, conserva el historial local y no elimina los
aportes ya aceptados. Borrado remoto es una operación diferente, fuera de esta entrega.
Sin conexión el grupo 10 debe cancelar pendientes localmente y propagar la revocación
al servidor al recuperar conectividad. No se promete revocación remota instantánea offline.

La versión del aviso de cada medición debe coincidir con el consentimiento vigente.
No se publica automáticamente historial antiguo al activar el permiso.

## Ingesta

`POST /functions/v1/ingest-measurements`, `Content-Type: application/json`,
`Authorization: Bearer <JWT de usuario>`, `apikey: <clave publicable>`.
Contrato `esquema_version: "1.0"`; 1–100 objetos y como máximo 256 KiB.

```json
{
  "esquema_version": "1.0",
  "mediciones": [{
    "id": "b3adfc30-07da-45d0-b8dc-80396822609a",
    "latitud": -33.456, "longitud": -70.654,
    "precision_m": 5, "potencia_dbm": -72,
    "metrica": "wifi_rssi", "tecnologia_radio": "wifi",
    "tipo_conexion": "wifi_privada", "origen_clasificacion": "sistema",
    "piso_nivel": 0, "tamano_zona": "mediano",
    "capturada_en": "2026-11-04T00:00:00Z",
    "version_config": "mvp-1", "version_aviso": "1.0"
  }]
}
```

Sustituye fecha e ID al crear una captura nueva; en reintentos conserva exactamente
ID y valores. Se rechazan propiedades inesperadas, incluidas `usuario_id`, MAC,
SSID, BSSID, IMEI, tokens o campos de sensor completos. La geometría y el propietario
se asignan en servidor. Cada lote válido usa una única transacción/RPC.

| Regla | Contrato |
| --- | --- |
| Coordenadas | Números finitos; latitud −90..90, longitud −180..180. |
| Precisión | Mayor que cero y estrictamente menor que la configuración elegida. |
| Piso | Entero dentro de `pisos_min`/`pisos_max`; **0 es válido**. |
| Tamaño | `pequeno`, `mediano`, `grande`, `muy_grande`. |
| Métrica/tecnología | `wifi_rssi/wifi`, `lte_rsrp/lte`, `nr_ss_rsrp/nr`, `celular_dbm/otra`. |
| Potencia | Entero; Wi-Fi −127..−1, celular −160..−1 dBm (plausibilidad propuesta, no escala de calidad). |
| Conexión | Wi-Fi: `wifi_publica`, `wifi_privada`, `wifi_desconocida`; celular: `datos_moviles`. |
| Origen | `sistema`, `manual`, `desconocido`. |
| Fecha | ISO 8601 UTC con Z; tolerancia futura de cinco minutos; historial offline hasta 90 días por defecto. |
| Versiones | Obligatorias; configuración existente y aviso concordante con el permiso. |

Respuesta 200, con resultado independiente para cada medición:

```json
{"aceptadas": [], "duplicadas": [], "rechazadas": [
  {"id": "b3adfc30-07da-45d0-b8dc-80396822609a", "codigo_error": "INVALID_ACCURACY", "mensaje": "INVALID_ACCURACY", "reintentable": false}
]}
```

La misma medición del mismo propietario devuelve `duplicadas`; mismo ID con otro
contenido o propietario devuelve `ID_CONFLICT`, sin sobrescribir evidencia ni
revelar el propietario anterior. El worker confirma aceptadas y duplicadas,
no el lote entero. Un fallo SQL inesperado revierte el lote completo y devuelve
503 reintentable; el teléfono conserva el mismo payload para el siguiente intento.

400: estructura/versión inválida; 401: sesión inválida; 403: consentimiento ausente
o revocado; 413: tamaño; 415: contenido; 429: cuota (Retry-After: 60); 503:
servicio transitorio. Errores de dominio usan `codigo_error` estable y no exponen
mensajes SQL. Un array con elementos null no escribe parcialmente.

## Mapa público

RPC `/rest/v1/rpc/public_map_cells`, accesible con clave publicable; solo devuelve
agregados. Conserva los nombres de argumentos originales y añade:

```json
{
  "min_lon": -70.655, "min_lat": -33.457,
  "max_lon": -70.653, "max_lat": -33.455,
  "piso_filtro": 0, "tipo_conexion_filtro": null,
  "grid_size_m": 50, "metrica_filtro": "wifi_rssi"
}
```

**Cambio de contrato para el grupo 10:** `metrica_filtro` es obligatorio en la
práctica; omitirlo produce `METRIC_REQUIRED`. Opcionalmente `desde` y `hasta` son
límites UTC a medianoche, intervalo [desde,hasta); por defecto últimos 90 días
calendario hasta mañana UTC. No se permiten intervalos subdiarios arbitrarios.

La grilla EPSG:6933 tiene origen fijo y unidades proyectadas métricas; no confunde
grados con metros. Sus metros no equivalen exactamente a distancia sobre el terreno.
Se publica el centro geométrico de la celda, nunca el promedio de posiciones.
La selección se amplía a celdas completas para no revelar posiciones cambiando
ligeramente el viewport. Las resoluciones son potencias de dos de la mínima.

Los grupos mantienen separados piso, métrica, tecnología y tipo de conexión.
Se requieren cinco cuentas distintas por defecto; muchas muestras de una sola cuenta
no aumentan contribuyentes. Se devuelven como máximo 999 filas (cota conservadora
de 333 celdas espaciales por tres categorías Wi-Fi); si hace falta se aumenta la
resolución y se indica `resolucion_m`. No se recortan celdas arbitrariamente.
Área máxima 2° por eje, latitudes −85..85; para el antimeridiano se hacen dos consultas.
Un área mayor responde `ZOOM_REQUIRED`. Filas antiguas con valores inválidos no
se muestran. La existencia de un índice no garantiza el SLA: medir consulta +
renderizado <3 s con el frontend y datos representativos sigue siendo obligatorio.

## Seguridad y parámetros propuestos

Las tablas no permiten escritura directa desde `anon`/`authenticated`; mediciones
crudas tampoco permiten lectura. El endpoint de consentimiento y la RPC de ingesta
derivan su usuario del JWT, comprueban autorización y fijan `search_path`.
Se revoca la antigua RPC que recibía un propietario libre. Los esquemas del camino
de búsqueda no permiten CREATE a roles API. No se registran tokens ni payloads.
La precisión se valida también después de convertirla a `real`, para que un valor
como 9.99999999 no termine guardado como 10 si el umbral es 10. Los índices de las
claves foráneas de usuario y configuración evitan los avisos de claves sin índice.

`kys_private.politica` solo es administrable desde SQL privilegiado: mínimo 5
contribuyentes, celda mínima 50 m proyectados, antigüedad 90 días y 60 solicitudes
de ingesta por cuenta/minuto. Los tres primeros son propuestas del IDA; el límite
de frecuencia es una defensa operativa configurable. Deben revisarse antes de
producción; no se presentan como cifras aprobadas por la PDS.

La identidad técnica anónima es seudónima y las cuentas no equivalen a personas
verificadas. Crear varias cuentas puede eludir el conteo: usar límites de Auth y
protección contra abuso del proveedor. La agregación reduce exposición, no prueba
anonimato absoluto. No se implementan borrados automáticos ni retención destructiva.

Antes de desplegar, verificar Auth Cloud, permisos reales, migraciones desde una
base vacía y desde datos existentes, integración del grupo 10, concurrencia y
rendimiento. Este cambio no ejecuta despliegues ni modifica la instancia remota.

Si las tablas ya existen pero no hay historial de migraciones, no ejecutar
`db push` a ciegas: intentaría volver a crear las tablas iniciales. Primero comparar
el esquema con las dos migraciones iniciales y reconciliar su historial; aplicar
solo la migración nueva a esa base existente. La verificación debe comparar el
conteo y una huella de las mediciones antes y después, sin exportar datos crudos.

Las alertas de objetos de la extensión PostGIS instalada en `public` se revisan
aparte: `spatial_ref_sys` y `st_estimatedextent` pueden pertenecer a
`supabase_admin`. No cambiar su propietario ni mover la extensión sin seguir un
procedimiento compatible del proveedor; el rol `postgres` del proyecto puede
carecer de permisos para corregir esos objetos. Las RPC de la aplicación y sus
tablas se verifican de forma independiente.

Orden de publicación para evitar acuses incorrectos del código anterior: primero
publicar la nueva Edge Function en certificación (responderá 503 reintentable
mientras falte la nueva RPC), después aplicar la migración y verificar el flujo
completo. La función anterior convertía errores SQL en rechazos definitivos: no
mantenerla activa durante el cambio de permisos. Coordinar el cambio del cliente
de consentimiento y filtros antes de habilitar aportes en producción.
