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

## Benchmark con cifras y fundamento

Para convertir el paquete de evidencias descargado en una tabla de indicadores
y un informe más explícito, sin ejecutar otra campaña:

```sh
python3 qa/benchmark.py --evidence-root /ruta/KYS_Robot_QA_Evidencias --output /ruta/benchmark-nuevo --verbose
```

Genera HTML, JSON y CSV. Muestra aprobados/total, revisiones, repeticiones,
observado/objetivo y alcance. Valida la integridad antes de calcular. El código
de salida indica si pudo generar el benchmark y no reemplaza el gate del producto.
Definiciones, fórmulas, limitaciones del muestreo y protocolo físico:
[`docs/benchmark-y-metricas.md`](docs/benchmark-y-metricas.md).

## Qué comprueba

`cases/catalog.json` versiona **199 casos únicos automatizados** al 100%. Las tres repeticiones son **597 ejecuciones** verificadas automáticamente. El perfil `portable` añade cuatro señales de compilación y contrato: tipos/lint, suite JavaScript existente (54 pruebas) y tipos backend. Además, los 68 contratos hoja del backend se reportan individualmente en PostgreSQL WASM/PostGIS aislado, tres veces cada uno (204 ejecuciones).

| Adaptador | Evidencia | Alcance |
|---|---|---|
| `contracts.probe.jsx` | Código real: captura, límites, pisos, potencia, Pin-Drop, mapa, PNG, globo y relaciones metamórficas con semilla fija | Contratos de dominio y geometría (101 casos × 3 rep) |
| `ui.probe.jsx` | Componente Wizard real, hook controlado y estado del botón | Contrato de bloqueo de UI (10 casos × 3 rep) |
| `sampling.probe.jsx` | Hook de captura real: ocho lecturas, cancelación, permisos, caducidad y métricas coherentes | Ciclo de muestreo estacionario (14 casos × 3 rep) |
| Análisis estático (`source-rule`) | Invariantes identificadas en archivos reales de Kotlin, TypeScript y SQL | Integridad de sensores, reloj monotónico y RLS (6 casos × 3 rep) |
| `backend.py` | 68 contratos hoja originales del handler/SQL con JUnit real por caso | Ingesta, rate-limit, $k$-anonimato y PostGIS (68 casos × 3 rep) |
| Suite JS existente | 54 pruebas del producto con su JSON/log real | 14 suites Jest del cliente móvil |
| `android.py` / `instrumentation.py` | Recorridos e instrumentación Room/sincronización | Contratos nativos Android |
| `native_backend.py --execute` | Diez comprobaciones SQL/concurrencia y benchmark espacial | Base PostGIS (`public` y `extensions`) |

Siete evaluadores automáticos del catálogo: contrato exacto, frontera numérica, estadístico de referencia, geometría acotada, relación metamórfica, regla de código fuente y estado de interfaz. Consulte `docs/metodologia.md`.

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
La comparación contrasta oráculos/entradas por caso y versión del robot,
política, semilla, repeticiones, perfil y herramientas. Un criterio editado se
separa como `test_basis_changes`; una base distinta o incompleta queda
`INCOMPARABLE`, con código de salida 1. Ese resultado nunca equivale a regresión
aprobada, aunque no haya transiciones `PASS → FAIL`.

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

Para registrar una aceptación real, copie `human-review-template.csv` **fuera de
la campaña original**, y complete esa copia (persona,
PASS/FAIL, evidencia y observación; no deje campos vacíos) y genere otro informe:

```sh
python3 qa/robot.py review qa/reports/mi-ejecucion/report.json revisiones.csv --output qa/reports/revisado
```

La importación no permite sobreescribir un fallo automático. No inventa acuerdo
entre jueces: sin pares evaluados por personas, queda `NOT_CALIBRATED`. Los hashes
detectan cambios accidentales; no son firma digital ni certificación de autoría.

Para auditar un oráculo, copie `calibration-template.csv` fuera de la campaña,
conserve las columnas de versión/hash/veredicto automático y deje solo las filas
que una persona realmente revisó. Complete revisor, PASS/FAIL humano, evidencia y
fundamento. Importe con:

```sh
python3 qa/robot.py calibrate qa/reports/mi-ejecucion/report.json pares-reales.csv --output qa/reports/calibracion
```

Calcula acuerdo observado, pares únicos, desacuerdos, tabla de confusión e
intervalo Wilson con sus supuestos. La muestra elegida por revisores puede estar
sesgada; no prueba exactitud poblacional. No evalúa un LLM ni modifica el estado
de un caso o la compuerta de aceptación. Sin juicios reales sigue
`NOT_CALIBRATED`. Una revisión/calibración verifica primero la integridad y
genera otra carpeta, fuera de la campaña original; nunca edite la plantilla
dentro del paquete inmutable.

## Fuentes y trazabilidad

`registry/sources.json` identifica los documentos base del proyecto mediante SHA-256. La suite completa valida el 100% de los contratos automatizados del cliente móvil, puente nativo y backend espacial PostGIS.
