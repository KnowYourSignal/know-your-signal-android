# Especificación del benchmark de QA

## Propósito y procedencia

El benchmark convierte campañas archivadas en cifras para el equipo y la
presentación. `qa/benchmark.py` no ejecuta ni corrige la app: verifica los hashes,
los informes por caso y la identidad de las campañas antes de derivar números.
La fecha de generación del benchmark es distinta de la fecha de las pruebas.
Un informe de noviembre de 2026 no acredita una versión posterior.

```sh
python3 qa/benchmark.py --evidence-root /ruta/KYS_Robot_QA_Evidencias \
  --output /ruta/benchmark-nuevo --verbose
```

Se necesita el paquete de evidencias completo y descomprimido. La salida debe
estar fuera del paquete original y vacía. Produce `benchmark.json`, una tabla
SQL `benchmark_sql.csv` y `benchmark.html`, que puede abrirse sin servidor.
`--verbose` imprime observado, objetivo, resultado y alcance. El código de
salida 0 significa que generó las métricas; el gate original del producto se
conserva por separado y puede seguir en `REJECT`.

## Diccionario de indicadores

| Indicador | Numerador y denominador | Regla de lectura |
|---|---|---|
| Aprobación automática del catálogo | Criterios únicos PASS / todos los criterios automáticos únicos | Incluye REVIEW, BLOCKED y ERROR en el denominador. No incluye suites adicionales ni revisiones humanas |
| Aprobación crítica | Críticos obligatorios PASS / todos los críticos obligatorios | Un fallo crítico rechaza la versión aunque la media general sea alta |
| Aceptación humana | Casos humanos con evidencia aceptada / total humano | Un caso pendiente conserva REVIEW, no PASS |
| Estabilidad de repetición | Casos con el mismo veredicto en todas sus repeticiones / casos con al menos dos intentos | Un fallo repetido también es estable. No representa exactitud GPS ni fiabilidad en producción |
| Ejecuciones | Suma de intentos de los criterios automáticos | Tres intentos del mismo criterio siguen siendo un caso único |
| Regresión | Casos PASS a FAIL con igual base de prueba | Cambios ERROR a PASS o ERROR a FAIL se separan como cambios de capacidad, no mejoras o regresiones funcionales |
| p95 SQL | Posición ceil(0,95 × n) de los tiempos ordenados | Con n=10 coincide con el máximo. El productor conserva agregados, no diez valores individuales |
| Tiempo concurrente | Duración de cada uno de ocho clientes SQL locales | Incluye subproceso y cliente. No es latencia HTTP, throughput máximo ni un ensayo de carga de Supabase alojado |
| Indicador Android | Tiempo desde el toque del driver hasta una etiqueta accesible | Incluye UiAutomator, una muestra por API. No acredita mapa utilizable en teléfono físico |

El campo histórico `summary.automatic_pass_rate` del informe portable tiene
otro denominador: solo PASS y FAIL, incluyendo cuatro controles adicionales.
Por eso 190/(190+10)=95 % puede coexistir con 186/199=93,47 % del catálogo.
La presentación usa esta última definición y muestra las revisiones pendientes.
No edita el resumen ni los veredictos de las campañas archivadas.

## Objetivos y bases de aceptación

La PDS, NEC05.03, exige menos de tres segundos desde la apertura de la pestaña
hasta consulta y renderizado. Es un requisito extremo a extremo. El escenario
SQL reutiliza un presupuesto configurable de 3000 ms para su capa aislada:
aprobar SQL no demuestra cumplir el requisito completo. El indicador Android
también contrasta 3000 ms, pero la aceptación física sigue pendiente.

La cifra de 0,5 segundos es un ejemplo de comunicación solicitado por el
equipo. No se incorpora como requisito aprobado ni se afirma que la app ya
cumpla ese tiempo. Se pueden mostrar observaciones reales, como SQL p95 de
0,020182 s o 0,168458 s, con sus condiciones.

Para captura, IDA y política usan precisión menor a 10 m. La hoja de ruta y
otros documentos mencionan 25 m. Debe acordarse el criterio antes del cierre.
En cualquiera de los dos contratos, transformar la incertidumbre observada
de 20 m a 9,8 m requiere tratamiento independiente: cambiar el umbral no
justifica presentar otra precisión.

## Método SQL y validez del ensayo

`tests/backend/native.py:benchmark` carga 1000, 10000 y 100000 filas sintéticas,
ejecuta viewport y wide_viewport diez veces por volumen, usa
EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) y conserva p50, p95 y máximo del tiempo
Execution Time. Comprueba también uso de GiST y límites del resultado.
Se ensayan PostGIS en public y extensions. Son 12 escenarios y 120 ejecuciones
SQL; esto no añade 120 casos al catálogo ni convierte las muestras en usuarios.

No existe una fase de calentamiento registrada, orden aleatorio ni diez tiempos
individuales exportados por escenario en el productor original. No se infieren
intervalos de confianza, p99 estable ni comportamiento de carga fría. La versión
de PostGIS en CI difiere de la del backend alojado. Para medir producción se
necesita otra campaña identificada y un entorno autorizado.

## Protocolo de carga física propuesto

Registrar dos teléfonos, modelo, Android, APK/SHA, estado térmico, conexión,
dataset y reloj. En cada teléfono medir 30 aperturas frías y 30 calientes del
mapa con 1000 celdas. Son 120 observaciones previstas, aún no ejecutadas.
Inicio: toque sobre la pestaña. Fin: mapa dibujado y controles utilizables,
no solo aparición de un texto ni desaparición del loader.

Conservar los tiempos individuales, errores, intentos bloqueados y vídeo o traza.
Reportar n, p50, p95, máximo y fracción de intentos bajo 3000 ms por teléfono y
condición. Mantener el requisito original al evaluar cada intento; no sustituirlo
por una media o un p95 sin acuerdo del responsable de producto. Reportar por
separado modo offline y errores de red, con su criterio propio.

## Fundamento documental

- PDS NEC05.03: objetivo temporal de consulta y renderizado.
- IDA y FDR NEC01: integridad de captura, guardias y trazabilidad.
- C5 Planificación QA, pp.2-13: alcance, tipos, entorno, riesgos y trazabilidad.
- Guía Robot QA, pp.6-11 y 14: entrada, precondición, oráculo, métricas y gate.
- Resumen aportado ISO/IEC/IEEE 29119-1, pp.2-4: base y oráculo de prueba,
  diferencia entre prueba estática/dinámica y entre regresión/reprueba.

La referencia al material docente explica decisiones del robot. No acredita
certificación normativa ni cumplimiento de métricas LLM: la app no integra un
modelo y no hay calibración humana real concluida.
