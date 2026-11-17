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

`cases/catalog.json` versiona 133 casos únicos: 117 automatizados y 16 de
aceptación humana. Las tres repeticiones son **351 ejecuciones**, no 351 casos.
El perfil `portable` añade cinco señales: tipos/lint, suite JavaScript existente,
tipos backend y suite de handler/base de datos en PostgreSQL WASM aislado.

| Adaptador | Evidencia | Límite |
|---|---|---|
| `contracts.probe.jsx` | Código real: captura, límites, pisos, potencia, Pin-Drop, mapa, PNG, globo y relaciones metamórficas con semilla fija | Contratos y geometría; no prueba sensores ni dibujado físico |
| `ui.probe.jsx` | Componente Wizard real, hook controlado y estado del botón | Fixture explícito; no certifica el GPS ni el flujo nativo |
| Análisis estático | Invariantes identificadas en archivos reales | Un patrón presente/ausente es un diagnóstico, no una prueba funcional completa |
| Suites existentes | 54 pruebas JS y suite backend del commit, con logs reales | Se reportan como suites; no se suman artificialmente al catálogo |
| `android.py` | Ocho recorridos UiAutomator originales, capturas y XML por fase | Emulador, GPS/servidor sintéticos; no teléfonos físicos ni Cloud real |
| Humano | Hoja de ruta, roles A/B/C/D y evidencia identificada | Pendiente hasta que una persona ejecute y firme |

Ocho evaluadores del catálogo: contrato exacto, frontera numérica, estadístico
de referencia, geometría acotada, relación metamórfica, regla de código fuente,
estado de interfaz y rúbrica humana. Consulte `docs/metodologia.md`.

## Comparar versiones, sin fusionarlas

El mismo robot puede apuntar a un checkout separado con sus dependencias:

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
recorrido de captura: si faltan, se marcan `BLOCKED`, no fallos adicionales.

```sh
python3 qa/android.py --serial emulator-5554 --output /tmp/kys-android-evidence
```

Requiere los APK `uitest`/instrumentation ya instalados, el entorno Android del
workflow y emulador verificado. El adaptador rechaza teléfonos físicos, seriales
ambiguos y paquetes distintos. Sus cambios de permisos/conectividad ocurren solo
en el emulador aislado. No use ese comando sobre el teléfono del evaluador.

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
una IA ficticia al producto. Tampoco se afirma certificación ISO.

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
