# Experiencia de usuario · versión 1.2

Esta iteración recupera el globo guía de la propuesta visual de Palta y lo conecta con los controles y los datos reales del cliente Android. Se mantiene la paleta azul, las tarjetas claras y los colores de calidad de señal del proyecto.

## Qué cambia para el usuario

- **Guía interactiva:** señala precisión GPS, red y captura; recorre historial, filtros de comunidad, privacidad y modo técnico. Otro recorrido explica piso, tamaño y guardado cuando existe una captura real. Permite avanzar, retroceder, omitir y repetir desde Medir o Ajustes.
- **Navegación:** las pestañas se funden durante 240 ms y el formulario usa la transición nativa suave. El fondo conserva el color de la app durante el cambio.
- **Diálogos:** aparecen con opacidad, un desplazamiento de 10 puntos y una escala de 0,975 a 1. La salida dura 160 ms. El contenido anterior permanece visible mientras sale; la navegación posterior espera a que termine.
- **Lectura de sensores:** diferencia búsqueda de ubicación, mejora de precisión GPS, espera de señal, cambio de red, renovación y captura lista. No muestra porcentajes de progreso inventados. La precisión de 10 m todavía no habilita una captura: debe ser menor a 10 m.
- **Carga y botones:** indicadores con iconos del contexto y una órbita discreta, más una respuesta breve al presionar y soltar los botones.

## Comportamientos que se conservan

La guía nunca pulsa los controles, rellena el recinto, activa sensores ni cambia el consentimiento. Mientras está abierta se suspende la lectura. Al terminar vuelve a la pestaña original y restaura el desplazamiento de las pantallas visitadas; una sesión ya activada obtiene otra lectura al volver a Medir. La pausa manual sigue siendo explícita.

La guía automática espera a que la app esté en primer plano. En el formulario no interrumpe a quien ya empezó a interactuar; el botón Guía sigue disponible. El movimiento del globo y sus fundidos se ejecutan en el hilo de interfaz, mientras el resaltado mantiene sus propias medidas. Si un control desaparece durante una transición, el recorrido vuelve a buscarlo y ofrece reintentar u omitir si no lo encuentra en un plazo acotado.

Los botones de avance se habilitan cuando el globo termina de ubicarse y aparecer. Así se evitan toques perdidos sobre un control que todavía se desplaza. El recorte redondeado sigue el borde del elemento y la sombra permanece discreta. Cambiar el tamaño de fuente de Android actualiza el diseño sin reiniciar la actividad ni perder el recorrido o el formulario abierto.

La preferencia de haber visto cada recorrido se guarda solamente en `SharedPreferences`, en las claves `guide_overview_v1` y `guide_room_v1`. No modifica el esquema de Room ni el proyecto Supabase. Si no se pueden leer esas preferencias, la app sigue funcionando y permite abrir la guía manualmente.

Las animaciones se detienen en segundo plano y respetan la opción de reducir movimiento. Durante la guía, el lector de pantalla accede al globo y sus acciones; el contenido de fondo queda fuera del foco. El texto explicativo se puede desplazar en un globo que no quepa completo, y sus controles permanecen separados de ese desplazamiento. Los diálogos de privacidad y exportación bloquean el cierre mientras se completa una operación.

Las acciones de cada diálogo se habilitan al finalizar su entrada; el foco accesible se envía entonces al título. Una segunda pulsación rápida no puede confirmar una ventana que todavía está apareciendo.

Los permisos y el menú de compartir pertenecen a Android y conservan su presentación del sistema.

## Implementación y mantenimiento

Se usan `Animated`, las transiciones de React Navigation y los iconos SVG existentes. Esta iteración no añade dependencias nativas. `GuideContext` conserva el recorrido y las preferencias; `GuideTarget` mide controles reales y revela los que quedan fuera de pantalla; `GuideLayout` calcula el espacio disponible; `GuideOverlay` presenta el globo y el resaltado. `useAnimatedPresence` coordina entradas, salidas y reaperturas de los diálogos.

Los mensajes del GPS se calculan en `CapturePresentation` a partir del estado de la sesión y de la lectura. Una animación decorativa no cambia la validez de la muestra ni los límites del registro.

## Verificación

La suite JavaScript cubre posición del globo, límites de pantalla y texto grande, recorrido y repetición, fallos de preferencias, cierre de diálogos interrumpido, retención de evidencia durante la salida y estados GPS. También se mantiene la prueba de privacidad sin ninguna opción preseleccionada.

`GuideJourneyTest` recorre ambas guías en la instalación aislada `com.knowyoursignal.uitest`, comprueba repetición, omisión, giro y texto al 150 %, y verifica que no cambien capturas, consentimiento o modo técnico. Las demás fases preparan la preferencia de guía vista para comprobar sus propios flujos sin superponer dos recorridos.

La validación visual nativa y los resultados de API 29/35 deben consultarse en los artefactos de la ejecución correspondiente. Las pruebas con ubicaciones inyectadas no certifican GPS o radio de un teléfono físico. La aceptación en terreno sigue el [protocolo del equipo](pruebas-campo.md).
