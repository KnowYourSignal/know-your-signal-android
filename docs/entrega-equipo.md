# Entrega de Know Your Signal al equipo

El [PR #11](https://github.com/KnowYourSignal/know-your-signal-android/pull/11) reúne el cliente Android que integra los issues #1 a #6 y #9 con el backend de los issues #7 y #8. La navegación, los colores y el recorrido guiado vienen de la base de QuilPalta. El trabajo del grupo 11 define qué datos se pueden enviar y qué resultados se publican en Comunidad.

## Qué está implementado

| Parte | Lo que se puede hacer |
| --- | --- |
| Medición y recinto · #1 y #5 | Leer señal y ubicación, esperar una muestra válida y guardarla con piso y tamaño. La app cancela la lectura al salir de Medir y vuelve a pedir una muestra si cambia la red. |
| Historial y sincronización · #2 y #3 | Guardar y consultar capturas sin internet. Las capturas autorizadas entran en una cola que se recupera tras reabrir la app. Android programa el envío cuando la cola recibe trabajo. |
| Privacidad · #4 | Elegir uso personal o aporte comunitario. Revocar retira los pendientes y conserva el historial. Una captura congelada con una decisión anterior se queda en el historial personal. |
| Evidencia · #6 | Revisar la tarjeta con plano, escala, piso, red y fechas antes de generar el PNG y abrir el menú de compartir. |
| Backend · #7 y #8 | Usar sesión anónima, consentimiento, ingesta por lotes y mapa agregado según el contrato de Supabase. |
| Mapas · #9 | Ver el plano personal sin teselas. Consultar celdas públicas por piso, tecnología y tipo de Wi-Fi. Los desplazamientos pequeños reutilizan el área consultada y cambiar de capa cancela la consulta anterior. |

La APK de prueba se instala como **Know Your Signal QA**. Su historial queda separado del de la app principal. El [README](../README.md) explica cómo compilarla y configurar el servicio.

## Prueba corta en un teléfono

1. Abre la APK y elige **Solo uso personal**. Activa los sensores desde Medir, toma una muestra válida y guárdala en el piso 0 con un tamaño de recinto.
2. Activa el modo avión, cierra la app y vuelve a abrirla. Comprueba que la muestra aparece en Mi historial con el mismo piso y valor.
3. Abre **Preparar evidencia PNG**, revisa el plano y comprueba que el menú de compartir entrega una imagen legible. Puedes guardarla localmente.
4. Repite la lectura con datos móviles para comprobar el tipo de red y la unidad. Usa Ajustes para revisar el estado de privacidad.
5. Con internet, abre Comunidad y prueba piso, tecnología y tipo de Wi-Fi. Mide el tiempo desde que abres una zona hasta que el mapa la muestra. Anota si la zona estaba en caché, el equipo y el tipo de conexión.

Para probar el aporte y la revocación de extremo a extremo, usa una instalación que apunte a un proyecto de pruebas. Revisa que las capturas privadas sigan locales y que el servidor confirme los aportes autorizados.

## Qué queda por validar

La revisión en teléfono debe cubrir la señal Wi-Fi y móvil real, el ciclo de aporte y revocación con red intermitente, y la carga de Comunidad con datos representativos. El objetivo del issue #9 es mostrar la zona en menos de tres segundos, contando red, consulta y dibujo. El [seguimiento de PostGIS](../supabase/POSTGIS_REVIEW.md) sigue como tarea de infraestructura.
