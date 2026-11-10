# Entrega de Know Your Signal al equipo

El [PR #11](https://github.com/KnowYourSignal/know-your-signal-android/pull/11) integra **todos los issues #1 a #9**. Mantiene la navegación, la identidad visual y el asistente de QuilPalta, y conecta esa base con el backend del grupo 11. El código está disponible en la rama del PR; la aceptación en teléfono sigue pendiente.

## Qué quedó hecho

| Issues                 | Resultado                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 · Señal y ubicación | Lecturas nativas de Wi-Fi o señal móvil y ubicación. Se comprueban precisión, antigüedad y cambios de red. Los sensores se detienen al salir de Medir, durante el formulario y en segundo plano. La Wi-Fi que Android no reconoce admite una declaración manual identificada como tal. |
| #2 · Historial local   | Capturas disponibles sin internet. Historial y cola se guardan juntos; repetir un guardado no duplica la medición. La actualización de la base conserva capturas, consentimiento y pendientes.                                                                                         |
| #3 · Sincronización    | Cola recuperable al reabrir, reintentos, renovación de sesión y confirmación por captura. Un recibo incompleto conserva los pendientes. Los contadores se actualizan aunque Ajustes esté cerrado.                                                                                      |
| #4 · Privacidad        | Elección explícita de uso personal o aporte. Revocar retira los pendientes y conserva el historial. Activar el aporte no publica capturas privadas anteriores.                                                                                                                         |
| #5 · Captura guiada    | Piso y tamaño obligatorios, piso 0 válido y precisión menor a 10 m. Volver a Medir retoma la sesión activada con una lectura nueva. Repetir un recinto permite registrar y confirmar; pausar manualmente desactiva esa reanudación.                                                    |
| #6 · Evidencia PNG     | Vista previa del encuadre elegido, conservado al girar. La imagen incluye escala, leyenda, piso, red, fechas, mediana, rango y aviso de clasificación manual. Se espera al dibujo real antes de abrir Compartir.                                                                       |
| #7 y #8 · Backend      | El cliente usa el consentimiento, la ingesta y los agregados del backend ya desplegado. Se comprobaron recibos, duplicados y revocación en pruebas aisladas. Esta revisión no cambió datos del proyecto alojado.                                                                       |
| #9 · Mapas             | Plano personal offline y Comunidad por piso, tecnología y tipo de Wi-Fi. Colores estables según intensidad, leyenda con cantidades, selección, caché y reintento conservando la última vista. «Mi zona» acepta ubicación aproximada y ofrece ayuda útil ante errores.                  |

La interfaz conserva la identidad azul. Incorpora estados de carga, vacío y error, transiciones breves, respuesta visual de botones y una pulsación suave durante la búsqueda. Respeta movimiento reducido y adapta pestañas y controles al texto ampliado.

## Qué se verificó

| Comprobación                            | Resultado                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint y cliente JavaScript | Sin errores; 27 pruebas aprobadas.                                                                                                                |
| Backend                                 | 69 pruebas funcionales y diez escenarios nativos por cada configuración PostGIS. Incluyen concurrencia, privacidad y 100.000 muestras.            |
| Android 10 y 15, API 29 y 35            | Cuatro pruebas JVM y 15 instrumentadas aprobadas en ambas versiones. La repetición del recorrido aproximado y la matriz completa sigue pendiente. |
| APK QA ARM64 1.1                        | Compilada; firma, integridad, configuración y alineación de 16 KiB verificadas.                                                                   |
| Dependencias                            | Corregido el aviso moderado de las herramientas de análisis. El aviso bajo pendiente del proveedor está en [mantenimiento](dependencias.md).      |

Los recorridos de interfaz comprueban PNG real, recuperación en otro proceso sin red, texto al 150 %, giro, precisión insuficiente, permisos y 1.000 celdas dentro del viewport. Usan datos sintéticos y HTTPS local; no certifican señal física ni el tiempo total con red móvil.

Última ejecución diagnosticada: [Android](https://github.com/KnowYourSignal/know-your-signal-android/actions/runs/42743599156) · [Backend](https://github.com/KnowYourSignal/know-your-signal-android/actions/runs/42743599135).

La última corrección de las pruebas se puede seguir en [Android client](https://github.com/KnowYourSignal/know-your-signal-android/actions/workflows/android.yml). El código de la APK disponible no cambió con esos ajustes de automatización.

## Cómo probarlo

La APK se instala como **Know Your Signal QA 1.1**, con historial separado, JavaScript incluido y firma de desarrollo para pruebas internas. Usa el proyecto Supabase actual y el plano propio. Google Maps es opcional y requiere su clave. El [README](../README.md) explica cómo compilar o descargar la APK del flujo automático.

1. Elige uso personal, activa sensores y registra una muestra con piso y tamaño.
2. Activa modo avión, cierra y reabre: la muestra debe conservarse.
3. Ajusta el plano y comparte el PNG; revisa encuadre, texto y leyenda.
4. Repite con Wi-Fi y datos móviles, permisos denegados, giro y texto ampliado.
5. Prueba Comunidad con diferentes filtros y registra el tiempo de una zona nueva y otra en caché.

## Qué falta para aceptar la entrega

- **Verificación automática:** completar la nueva ejecución del recorrido aproximado. Android 15 centró el mapa, pero el caso esperaba un diálogo; Android 10 no recibió la posición del proveedor simulado. Se ajustaron esas condiciones de prueba y todavía no se declara aprobada la matriz final.
- **Teléfonos reales:** comprobar GPS, Wi-Fi y LTE/NR disponibles, cambios de red y permisos.
- **Aporte completo:** enviar, interrumpir la conexión y revocar en un proyecto de pruebas, comprobando servidor e historial local.
- **Rendimiento:** medir red, consulta y dibujo juntos para acreditar menos de tres segundos.
- **Primera captura:** acordar con la contraparte qué acciones cuenta la FDR; todavía requiere declarar piso y tamaño.
- **PostGIS:** continuar la solicitud ya recibida por Soporte. El [seguimiento](../supabase/POSTGIS_REVIEW.md) conserva el estado y las comprobaciones necesarias.

La [hoja de pruebas de campo](pruebas-campo.md) permite registrar resultados y responsables. El PR permanece en borrador para revisión y aceptación; el cierre de un issue no sustituye esas pruebas.
