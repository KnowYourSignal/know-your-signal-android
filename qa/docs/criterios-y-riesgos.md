# Criterios que debe reconciliar el equipo

Referencia inicial: commit `2fa3af8b249ef5e6f7b05898a38ba3fda1388e4c`.
Este registro documenta; **no cambia el producto ni sus documentos originales**.
Los resultados completos son los de cada campaña, no esta lista estática.

| ID | Observación / discrepancia | Evidencia y criterio | Acción de QA / decisión pendiente |
|---|---|---|---|
| R01 | Precisión 10 m frente a 25 m | IDA y `CapturePolicy`/`CaptureValidator` usan <10 m; hoja de ruta e informes de cierre mencionan 25 m | Mantener frontera 10 m según IDA y registrar decisión de producto; probar también 25 m |
| R02 | 3 frente a 8 muestras | IDA propone tres válidas consecutivas; código/cierre reciente usan ocho | Verificar ocho lecturas reales y decidir si actualiza formalmente la especificación |
| R03 | Precisión y tiempo nativos transformados | `TelemetryModule` acota precisión a 9,8 m; `LocationReader.toFreshPosition` asigna un tiempo nuevo | Riesgo de ocultar imprecisión/antigüedad. Análisis estático; requiere reproducción nativa, no se corrige aquí |
| R04 | Un error nuevo puede mostrar la lectura anterior | `displayObservation = latest`; UI `ready` no depende de `canRecord` | Contrato del botón falla con fixtures inválidos. Confirmar impacto y protección efectiva al congelar/guardar |
| R05 | Observabilidad de muestreo | Contador opcional en TypeScript; módulo nativo no publica `sampleCount` con `putInt` | Comprobar qué muestras promedia realmente el módulo y qué representa la animación |
| R06 | Código detecta mocks de pruebas | `useCaptureSession` inspecciona `_isMockFunction` | Las suites pueden recorrer una ruta distinta al teléfono. Registrar y añadir comprobación nativa, sin eliminar código |
| R07 | Ajuste manual frente a captura inmutable | IDA pide congelar coordenadas; Pin-Drop permite ajustar dentro de 2× precisión | Reconciliar intención y trazabilidad de coordenada original/ajustada. No llamar precisión al desplazamiento permitido |
| R08 | Anti-mock vs fixture de pruebas | Lecturas mock se descartan; los journeys inyectan GPS mock; hoja de ruta pide mensaje `MOCK_LOCATION` | Distinguir fallo de compatibilidad del harness y comportamiento del producto. No desactivar anti-mock para poner CI verde |
| R09 | Tabla de roadmap difiere del esquema | Hoja de ruta dice `mediciones_crudas`; migraciones usan `mediciones` | QA Cloud debe consultar el contrato real autorizado, registrar discrepancia y no crear otra tabla |
| R10 | Documentación dice Android nativo | PDS habla de acceso sin puentes; código usa React Native con TurboModules Kotlin | Describir arquitectura realmente construida. No afirmar que es Kotlin puro |
| R11 | Umbral de mapa <3 s requiere extremo a extremo | SQL aislado, render con datos sintéticos y red física son mediciones distintas | No sustituir la medida toque → vista utilizable por el tiempo de una consulta |
| R12 | Potencia no equivale a calidad de servicio | dBm mide potencia recibida, no throughput, latencia o causas del problema | Evitar promesas de velocidad o reparación automática en demo y propuesta comercial |
| R13 | Privacidad no es anonimato absoluto | UID técnico, coordenadas y hora pueden ser sensibles aunque no se envíe MAC/SSID | Revisar minimización y uso autorizado; no presentar k≥5 como garantía legal de anonimato |
| R14 | APK y documentación pueden tener versiones distintas | Roadmap: 1.2.0-beta.1; build QA/documentación: 1.2 con versionCode 3 | En cada teléfono registrar APK, versión efectiva y SHA, no solo nombre del archivo |

## Prioridad para revisión del equipo

Primero integridad de captura (R03–R06) y reproducción de bloqueo/guardado; después
compatibilidad de los journeys y anti-mock (R08), criterios (R01/R02/R07/R09) y
aceptación física. Esta priorización se basa en riesgo de evidencia engañosa o
captura inválida; la severidad definitiva depende de la reproducción y alcance.
Un fixture fallido del botón no demuestra por sí solo pérdida de datos ni envío
indebido a Cloud.

No cerrar un incidente solo porque se editó su caso de prueba. La corrección debe
entregarla el equipo de desarrollo y verificarse con el mismo criterio aceptado,
incluyendo la regresión relevante y evidencia vinculada al nuevo commit/APK.
