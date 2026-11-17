# Robot QA — Know Your Signal

Automatización de calidad **sin cambios al producto**. Ejecuta funciones y
componentes reales del repositorio, agrega las suites existentes y conserva los
fallos. No modifica `src`, sensores, APK, políticas RLS ni funciones de Supabase.

## Ejecución reproducible

Requisitos: Node 24 (igual que CI), npm, Git y Python 3.10+. No dependencias Python
externas. Desde la raíz del repositorio:

```sh
npm ci
npm ci --prefix tests/backend --ignore-scripts
python3 qa/robot.py validate
python3 -m unittest discover -s qa/tests -v
python3 qa/robot.py run --output qa/reports/mi-ejecucion --repetitions 3
python3 qa/verify.py qa/reports/mi-ejecucion
```

La carpeta de salida debe estar vacía o no existir. Abra `report.html` localmente;
no necesita servidor ni conexión. Cada ejecución conserva JSON, HTML, JUnit XML,
matriz CSV, incidentes, entradas/esperados/observados por caso, logs y hashes.
`qa/reports` está excluido de Git. Los artefactos de CI se conservan 30 días
(Android: 14 días); el equipo debe descargar los cierres que quiera conservar.

Código de salida: **0** = todos los criterios obligatorios del alcance aprobados;
**1** = rechazo, revisión humana pendiente o campaña incompleta; **2** = error de
configuración. Un trabajo rojo puede ser un hallazgo real del producto. Nunca
cambie el esperado ni el producto solo para ponerlo verde.

## Qué comprueba

`cases/catalog.json` versiona 215 casos únicos: 199 automatizados y 16 de
aceptación humana. Las tres repeticiones son **597 ejecuciones**, no 597 casos.
El perfil `portable` añade cuatro señales: tipos/lint, suite JavaScript existente,
tipos backend. Además, los 68 contratos hoja del backend se reportan individualmente
en PostgreSQL WASM/PostGIS aislado, tres veces cada uno. Node cuenta 69 resultados
al incluir también el contenedor de la suite; el robot no lo cuenta dos veces.

| Adaptador | Evidencia | Límite |
|---|---|---|
| `contracts.probe.jsx` | Código real: captura, límites, pisos, potencia, Pin-Drop, mapa, PNG, globo y relaciones metamórficas con semilla fija | Contratos y geometría; no prueba sensores ni dibujado físico |
| `ui.probe.jsx` | Componente Wizard real, hook controlado y estado del botón | Fixture explícito; no certifica el GPS ni el flujo nativo |
| `sampling.probe.jsx` | Hook de captura real con proveedores sin atajo de mocks: ocho lecturas, cancelación, permisos, caducidad y métricas coherentes | Entradas nativas y reloj controlados; no sensores físicos |
| Análisis estático | Invariantes identificadas en archivos reales | Un patrón presente/ausente es un diagnóstico, no una prueba funcional completa |
| `backend.py` | 68 contratos hoja originales del handler/SQL con JUnit real por caso | No cambia sus aserciones ni prueba el Supabase desplegado |
| Suite JS existente | 54 pruebas del producto con su JSON/log real | Se reporta como suite adicional, sin duplicar el catálogo |
| `android.py` | Ocho recorridos originales, un ensayo positivo con GNSS de consola y un indicador de tiempo; evidencia por fase | Emulador, GPS/servidor sintéticos; no teléfonos físicos ni Cloud real |
| `instrumentation.py` | Quince contratos nativos Room/sincronización originales, con resultados `-r` identificados | Emulador y servidor local; no Cloud real |
| `native_backend.py --execute` | Diez comprobaciones SQL/concurrencia originales, en ambos esquemas PostGIS de CI | Base desechable protegida; no SLA de Android/Cloud |
| Humano | Hoja de ruta, roles A/B/C/D y evidencia identificada | Pendiente hasta que una persona ejecute y firme |

Tres observaciones estáticas (lectura anterior, contador nativo opcional y
ruta de mocks) requieren interpretación: no se declaran defectos funcionales
solo por su patrón. El resultado automático original se conserva en cada caso.
`technical-review-template.csv` permite documentar la decisión de arquitectura;
no convierte un fallo automático obligatorio en aprobado.

Ocho evaluadores del catálogo: contrato exacto, frontera numérica, estadístico
de referencia, geometría acotada, relación metamórfica, regla de código fuente,
estado de interfaz y rúbrica humana. Consulte `docs/metodologia.md`.

## Comparar versiones, sin fusionarlas

El mismo robot puede apuntar a un checkout separado con sus dependencias (también
`tests/backend/node_modules` si ejecuta el perfil completo):

```sh
python3 qa/robot.py run --sut-root /ruta/checkout-anterior --profile probes --output qa/reports/base
python3 qa/robot.py run --profile probes --output qa/reports/candidato
python3 qa/robot.py compare qa/reports/base/report.json qa/reports/candidato/report.json --output qa/reports/comparacion.json
```

El informe identifica commit, huella de archivos del producto, cambios locales,
hashes de catálogo/política/código del robot, versiones, semilla y repeticiones.
Una función que no existía en la versión antigua queda como capacidad no
compatible (`ERROR`), no como mejora de una regresión. Cambiar el catálogo o el
entorno requiere interpretar la comparación. `PASS → ERROR` señala pérdida de
evidencia ejecutable; no demuestra por sí solo un nuevo defecto de la app.

## Android y dependencias de escenarios

CI construye los mismos APK y conserva las mismas aserciones. El adaptador nuevo
continúa con escenarios independientes tras un fallo. Historial offline,
accesibilidad con PNG e historial sin permiso dependen de las dos mediciones del
recorrido de captura: si faltan, se marcan `BLOCKED`, no fallos adicionales. Un
ensayo positivo adicional usa `adb emu geo fix` sin desactivar el anti-mock. Si
ese emulador marca la posición como mock, el ensayo queda bloqueado. Si consigue
guardar dos mediciones mediante la UI real, se registra como precondición de los
recorridos dependientes; el fallo del recorrido original nunca se borra.

```sh
python3 qa/android.py --serial emulator-5554 --output /tmp/kys-android-evidence
```

Requiere los APK `uitest`/instrumentation ya instalados, el entorno Android del
workflow y emulador verificado. El adaptador rechaza teléfonos físicos, seriales
ambiguos y paquetes distintos. Sus cambios de permisos/conectividad ocurren solo
en el emulador aislado. No use ese comando sobre el teléfono del evaluador.

Cada recorrido usa los eventos nativos `-r`: un resumen `OK (1 test)` sin
finalización identificada no acredita que el test haya ejecutado sus aserciones.
Una suposición/omisión queda `BLOCKED`. El ensayo GNSS exige además un registro
de finalización con dos mediciones locales y el SHA-256 del PNG realmente
producido. Una omisión nunca satisface la precondición de los recorridos de
historial. El reinicio opcional de flags de permisos se usa solo si `pm help`
declara que ese Android lo soporta; las aserciones del permiso se mantienen.

Las capturas creadas dentro del journey se preservan tras cada fase. Las
pantallas posteriores a cerrar instrumentation se identifican por separado y
pueden mostrar el launcher. El indicador de 1000 celdas mide hasta una etiqueta
accesible e incluye la sobrecarga del driver; es un diagnóstico opcional, no la
aceptación física de C4. `gradle.init.gradle` añade únicamente el nuevo test al
APK de instrumentación `uitest`; no modifica fuentes del APK principal ni sus
validaciones.

El adaptador de PostgreSQL ejecuta los scripts originales y sus protecciones de
base desechable. Una importación manual sin `--execute` se identifica como
evidencia sin vincular al checkout actual; no se inventa su procedencia.

## Aceptación y resultados honestos

Estados: `PASS`, `FAIL`, `ERROR`, `BLOCKED`, `REVIEW`, `NOT_APPLICABLE`.
Un fallo obligatorio rechaza la campaña; un error/ausencia la deja incompleta;
una revisión física pendiente impide aprobación final. Las medias no ocultan
fallos críticos. Los tiempos de Jest son del evaluador, **no rendimiento de la
app**. El objetivo de mapa <3 s se mide de toque a vista utilizable en teléfono,
no con el tiempo de SQL aislado.

La app actual no integra LLM/RAG/agentes. La guía de Robot QA se aplica al proceso
y arquitectura de pruebas; sus métricas de alucinación, prompts y coste por
token quedan expresamente fuera de alcance. No se declaran aprobadas ni se añade
una IA ficticia al producto. Tampoco se afirma certificación ISO. El objetivo
académico específico IA/LLM requiere acordar la adaptación con el docente; este
trabajo no lo declara satisfecho.

Para registrar una aceptación real, complete `human-review-template.csv` (persona,
PASS/FAIL, evidencia y observación; no deje campos vacíos) y genere otro informe:

```sh
python3 qa/robot.py review qa/reports/mi-ejecucion/report.json revisiones.csv --output qa/reports/revisado
```

La importación no permite sobreescribir un fallo automático. No inventa acuerdo
entre jueces: sin pares evaluados por personas, queda `NOT_CALIBRATED`. Los hashes
detectan cambios accidentales; no son firma digital ni certificación de autoría.

## Fuentes y trabajo del equipo

`registry/sources.json` identifica los diez PDF aportados y los documentos del
producto mediante SHA-256, sin publicar sus contenidos. La hoja de ruta real se
mantiene: instalación/smoke → comprobaciones A/B/C/D → correcciones del equipo →
cierre y demostración. Este robot prepara evidencia y regresión continua; no
impone un plan nuevo de dos iteraciones ni corrige la aplicación.

Los puntos pendientes, contradicciones de criterios y prioridad de revisión están
en `docs/criterios-y-riesgos.md` y `docs/aceptacion.md`. Presentación, pitch y
propuesta comercial se entregan aparte y no forman parte de este cambio de Git.
