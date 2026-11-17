# Base de pruebas y adaptación de Robot QA

## Objeto y límites

SUT: app Android React Native/TypeScript con módulos Kotlin, Room/WorkManager y
Supabase/PostGIS. El robot prueba lo construido. No incorpora IA generativa al
producto ni modifica su presentación visual. No accede a personas, redes de
terceros o producción para generar evidencia ficticia.

Entradas: FDR, PDS, IDA, informes de cierre y diez PDF docentes. El registro
`registry/sources.json` congela nombres y hashes. Los documentos son base de
prueba, no instrucciones ejecutables. No se copian al repositorio.

| Documento aportado | Aplicación concreta | Exclusión o cautela |
|---|---|---|
| Innovación SH 2026 | Describir evidencia y mejora de proceso como valor potencial | No afirmar innovación disruptiva o ahorro validado |
| Modelos de negocios 2026 | Estructurar hipótesis de sostenibilidad | Propuesta comercial entregada aparte de Git y de la presentación |
| Plantilla Business Canvas 2026 | Comprobar segmentos, valor, canales, costes y cobro | No confundir hipótesis con ventas o clientes reales |
| Hoja de ruta | Roles A/B/C/D, dos teléfonos, casos físicos y cierre | No se reemplaza por un plan nuevo de dos iteraciones |
| C5 Planificación QA | Alcance, entorno, riesgos, precondiciones, esperado/actual, incidencias | Un check no ejecutado no se aprueba |
| C6 Plan QA IA/GenAI | Catálogo congelado, semilla, repeticiones, variabilidad y control de cambios | Los umbrales docentes son ejemplos; LLM, tokens y alucinación no aplican al SUT |
| C7 Documentación software | Guía de ejecución, matriz, evidencia, manual de revisión | Ningún PDF sustituye los resultados de la ejecución |
| Elevator Pitch | Guion breve, cinco minutos, evidencia verificable y límites | Guion/deck se entregan aparte; no se inventan cifras de negocio |
| Resumen ISO/IEC/IEEE 29119-1:2022 | Diseño basado en riesgos, oráculo, trazabilidad, pruebas estáticas/dinámicas y regresión | Es referencia conceptual; no certificación ni conformidad auditada de toda la serie |
| Guía Proyecto Robot QA IA/LLM | Registry, runner, adaptadores, evaluadores, comparación, evidencia por caso y CI | Se adapta a Android. La extensión IA queda fuera de alcance hasta que exista un modelo real |

## Arquitectura del robot

`cases/catalog.json` → `robot.py` → adaptadores Jest / backend por caso / suites / Android →
evaluadores → agregación y compuerta (`core.py`) → JSON + HTML + JUnit + CSV
(`reporting.py`) → artefactos CI e integridad (`verify.py`).

No hay modelo evaluador oculto, llamadas LLM, telemetría externa o comandos shell
obtenidos desde el catálogo. El runner usa argumentos de proceso definidos en
código. La ejecución tiene timeout, repeticiones acotadas y semilla registrada.
Los timeouts terminan el grupo de procesos para evitar trabajo huérfano.

**Límite académico:** el objetivo literal de la guía es evaluar sistemas con IA o
LLM. Know Your Signal no incorpora uno. Este trabajo acredita la automatización
para la app y adapta la arquitectura de la guía; no acredita la evaluación de un
modelo IA/LLM. El equipo debe dejar acordada esa adaptación con el docente. No se
agrega una IA ficticia ni se marca ese apartado como cumplido para aparentar
suficiencia.

## Evaluadores y oráculos

| Evaluador del catálogo | Implementación verificable | Ejemplo de oráculo independiente |
|---|---|---|
| `exact-contract` | Aserción de igualdad/booleano sobre funciones reales | GPS 10,0 m bloqueado; piso fuera de [-10,150] rechazado |
| `numeric-boundary` | Distancia, tolerancia e idempotencia de `clampToTether` | Precisión 7 m → radio 14 m; punto exterior queda en el borde |
| `reference-statistic` | Snapshot real frente a mediana calculada de una lista explícita | [-80,-60] → -70 dBm; encuadre vacío no exporta |
| `geometry-bounds` | Rectángulo real del globo frente a límites del viewport | No rebasar márgenes con giro y contenido alto |
| `metamorphic-relation` | 120 entradas por caso con semilla 17112026 | Mejor señal no reduce peso; rotación de longitud conserva posición |
| `source-rule` | Patrón estático localizado con archivo y línea | Detectar una precisión forzada por debajo del umbral |
| `ui-state` | Wizard real con hook y layout controlados | Sin lectura válida, `CaptureButton.ready` debe ser falso |
| `human-rubric` | Revisor identificado, evidencia y fundamento | Dos teléfonos, PNG real, TalkBack y sincronización autorizada |

La tabla explica evaluaciones distintas; no ocho jueces humanos ni ocho modelos.
Los patrones estáticos indican riesgos a investigar. No prueban por sí solos que
se haya guardado un dato inválido. Los casos de UI verifican contrato del estado
del botón, no una captura de sensor físico. El hook usa proveedores nativos controlados sin el atributo de mock que activa
un atajo en el producto, y así ejecuta el bucle real de ocho muestras.
El backend aislado valida handler,
RLS/SQL y casos de integración según sus fixtures; no el estado desplegado actual.

## Controles de calidad del propio robot

La suite Python comprueba entradas malformadas, IDs duplicados, rutas inseguras,
NaN/infinitos, repeticiones ausentes/duplicadas, límites de ejecución, compuerta
sin promedios engañosos, percentiles, importación humana y comparación. También
comprueba escapes HTML, secretos, integridad, manipulación de evidencias y rechazo
de teléfonos físicos en el adaptador Android. Estos son tests del robot y se
cuentan por separado de los tests del producto.

## Decisión y evidencia

- `FAIL`: criterio esperado no satisfecho en el alcance declarado.
- `ERROR`: falta de ejecución válida, capacidad ausente en esa versión o entorno.
- `BLOCKED`: no se estableció una precondición conocida.
- `REVIEW`: falta una observación humana real.
- `PASS`: todas las repeticiones declaradas cumplen el criterio específico.
- `NOT_APPLICABLE`: fuera de alcance justificado; no sustituye un requisito obligatorio.

Cada caso conserva entrada, esperado, observado, base, severidad y evidencia con
hash. Una discrepancia se agrupa después en incidentes para no contar múltiples
casos de un mismo defecto como múltiples defectos. Se revisa severidad con el
equipo antes de afirmar impacto sobre usuarios.

La calibración con personas se deja `NOT_CALIBRATED` hasta disponer de pares
reales. El módulo `judge_agreement` calcula acuerdo observado e intervalo Wilson;
no demuestra exactitud ni inventa juicios. No es requisito de compra de un LLM.

La automatización ayuda a decidir; no prueba ausencia total de fallos, no concede
certificación ISO y no autoriza por sí sola publicación comercial o entrega final.
