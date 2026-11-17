# Aceptación de campo — hoja de ruta del 17 al 25 de noviembre

El robot prepara y ejecuta la parte reproducible. Los dieciséis casos humanos del
catálogo siguen pendientes hasta tener evidencia real. No se crean personas,
teléfonos, resultados o capturas para simular cumplimiento.

## Entorno y evidencia mínima

Dos teléfonos Android físicos distintos. Por cada uno: modelo, Android, versión
efectiva del APK, SHA-256, fecha, caso, estado, pasos y resultado observado. Usar
cuentas/redes/ubicaciones de prueba autorizadas. No publicar claves, identificadores
de red ni ubicaciones personales en capturas. No ejecutar pruebas de carga o
escrituras en producción como parte de este checklist.

| Rol de la hoja de ruta | Qué ejecutar en los teléfonos / staging | Evidencia requerida |
|---|---|---|
| A · captura | Instalación, permisos, ocho lecturas estacionarias, haptic/sonido y estabilidad; GPS impreciso/vencido; Pin-Drop cardinal y límite 2×; mock explícito; Wi-Fi/datos; sesión y pisos | Dos fichas de dispositivo, observaciones por caso, pantallas reales y valores mostrados |
| B · mapas/UX/PNG | Filtros piso/red/sesión, anillos/orden, modo técnico; modo avión y reapertura; PNG compartido; guía/giro/texto 150%/TalkBack/movimiento reducido | PNG original, cinco pantallas de cierre, grabación de estados/transiciones si procede |
| C · Cloud/seguridad | En staging autorizado: consentimiento, tres pendientes, envío en segundo plano, revocación, error 500/reintento sin confirmación falsa, grupos con ≥5 UID y tiempo extremo a extremo | IDs técnicos sintéticos correlacionados, logs saneados, consulta de verificación y cronometraje con método |
| D · cierre/documentación | Unir evidencias, criterios resueltos, defectos priorizados, versión y guion de presentación | Matriz y defectos vinculados a commit/APK; no afirmar cierre con pendientes ocultos |

No mezclar los roles: A no necesita modificar SQL; B no diagnostica Cloud; C no
rediseña UI. Las correcciones pertenecen a desarrollo, fuera del alcance de este
trabajo de QA.

## Mantener las fases originales

1. **17 noviembre:** instalación y smoke, lectura guiada y autenticación técnica.
2. **18–19:** comprobaciones específicas A/B/C/D de la tabla y catálogo.
3. **20–22:** desarrollo trata los defectos priorizados; QA verifica las versiones
   que efectivamente entregue el equipo y ejecuta regresión asociada.
4. **23–25:** cierre de evidencias y demostración de una versión identificada.

No se da por realizada una fase futura. Ninguna fecha autoriza a ocultar defectos,
aprobar un despliegue o fusionar una rama por defecto.

## Cómo registrar un caso

Ejemplo de ficha **vacía para completar**: caso KYS-HUM-002; teléfono/modelo ___;
APK/SHA ___; fecha ___; revisor ___; precondición ___; pasos ___; esperado ___;
observado ___; PASS/FAIL ___; archivo de evidencia y SHA ___; defecto asociado ___.

Para una revocación offline: conservar historial, cancelar futuros pendientes,
reconectar y verificar el estado remoto; observar tanto UI como datos autorizados.
La suite aislada no reemplaza esta comprobación desplegada.

Para rendimiento del mapa: definir inicio (toque) y fin (zona y controles
utilizables), carga fría/caliente, red, dispositivo, volumen real y repeticiones.
Conservar valores individuales y percentiles. No mezclar tiempo de SQL con tiempo
de pantalla ni presentar una muestra pequeña como SLA de producción.

## Criterio de cierre

Criterios acordados, comprobaciones obligatorias completas, ningún fallo crítico
abierto, evidencia íntegra y aceptación humana real. Si algo falta, el informe lo
identifica como pendiente/bloqueado; nunca se inventa un aprobado. La decisión de
entrega la toma el equipo con esa información.
