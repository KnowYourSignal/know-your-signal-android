# Verificación del cliente Android

La instalación `KnowYourSignal Tests` usa el identificador `com.knowyoursignal.uitest`, incluye JavaScript y mantiene sus datos separados de la aplicación y de QA. Las capturas de prueba y los agregados son sintéticos. Las pruebas visuales comprueban el identificador antes de crear o borrar sus fixtures.

## Compilar y ejecutar

Instala las dependencias con `npm ci`. Usa Node 24, JDK 17 y el SDK definido en `android/build.gradle`. Para las pruebas comunes:

```sh
npm run typecheck
npm test -- --runInBand
cd android
bash gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest
```

Para las pruebas de la interfaz, compila la variante independiente y su APK de instrumentación. Las dos APK deben tener la misma arquitectura que el emulador:

```sh
bash gradlew -PkysTestBuildType=uitest -PreactNativeArchitectures=x86_64 \
  :app:assembleUitest :app:assembleUitestAndroidTest
adb install -r app/build/outputs/apk/uitest/app-uitest.apk
adb install -r app/build/outputs/apk/androidTest/uitest/app-uitest-androidTest.apk
adb shell am instrument -w -e class com.knowyoursignal.ui.CaptureJourneyTest \
  com.knowyoursignal.uitest.test/androidx.test.runner.AndroidJUnitRunner
```

El recorrido elige uso personal sin preseleccionar el consentimiento, activa los sensores, inyecta ubicación de prueba mediante las API de Android, registra piso y tamaño, consulta Room, abre la evidencia y genera un PNG a través del menú nativo. Después vuelve a Medir sin reactivar los sensores y confirma expresamente el último recinto en otra captura. La prueba comprueba dimensiones y píxeles del PNG, incluida la señal dentro del plano. La suite de JavaScript comprueba que el formulario suspenda la lectura, que el regreso solicite una muestra nueva y que una pausa manual impida la reanudación automática.

El flujo automático también ejecuta `AccessibilityJourneyTest`, con texto al 150 %, giro y modo técnico; `CaptureQualityTest`, con precisión de 15 m que impide capturar y recuperación a 5 m; y `PermissionsJourneyTest`, con denegación real del permiso de ubicación y acceso al historial conservado. Esta última fase requiere revocar ambos permisos desde `adb`, después de detener la instalación de pruebas. `MapPermissionJourneyTest` concede solo ubicación aproximada y comprueba que el primer toque de «Mi zona» centre el mapa después del diálogo de Android. Los errores guardan capturas y la jerarquía de la pantalla para poder revisarlos.

La recuperación se comprueba en **otro proceso**, después de la captura:

```sh
adb shell am force-stop com.knowyoursignal.uitest
adb shell svc wifi disable
adb shell svc data disable
adb shell am instrument -w -e restorePhase true \
  -e class com.knowyoursignal.ui.HistoryRestoreTest \
  com.knowyoursignal.uitest.test/androidx.test.runner.AndroidJUnitRunner
adb shell am force-stop com.knowyoursignal.uitest
adb shell svc wifi enable
adb shell svc data enable
adb shell am instrument -w -e class com.knowyoursignal.ui.CommunityMapTest \
  com.knowyoursignal.uitest.test/androidx.test.runner.AndroidJUnitRunner
adb pull /sdcard/Android/data/com.knowyoursignal.uitest/files/verification ./ui-verification
```

## Servidor y datos de prueba

`CommunityMapTest` inicia un servidor HTTPS dentro del emulador, en `127.0.0.1:8443`. Devuelve 1.000 celdas sintéticas dentro del área visible inicial y exige que la pantalla confirme las 1.000. Comprueba cambio de tecnología, error 503, conservación de la última vista y reintento. Registra los tiempos hasta el resultado accesible y hasta la captura de pantalla, desde el toque en Comunidad. Esos tiempos describen ese emulador y ese servidor local; la aceptación de tres segundos necesita una medición adicional en un teléfono y con red representativa. El tiempo de espera de inactividad de UiAutomator es de 500 ms para que la animación de búsqueda no agregue una espera artificial de diez segundos a cada interacción.

La URL, la clave publicable de prueba y la confianza TLS están definidas exclusivamente en `src/uitest` y su tipo de compilación. El certificado y su clave privada son fixtures públicos para un servidor local sin datos reales; caducan en noviembre de 2036. La clave privada pertenece al APK de instrumentación. QA y release usan su configuración normal y no incluyen estos recursos. El flujo automático comprueba esa separación.

Las fases de permisos se ejecutan después de detener la app de pruebas y revocar únicamente sus permisos de ubicación. Primero se comprueba la concesión aproximada y después la denegación, para que las marcas de una denegación previa no contaminen la primera solicitud. Este orden funciona también en API 29, cuyo gestor de paquetes no admite `clear-permission-flags`. No se concede ubicación precisa a la fase aproximada. Los diagnósticos incluyen permisos concedidos, estado del proveedor, antigüedad de la posición y capturas antes y después del diálogo. Un fallo dentro del recorrido conserva también la pantalla y su jerarquía antes de finalizar la instrumentación.

La fase aproximada se ejecuta antes del recorrido de captura y prepara una decisión de uso personal únicamente dentro de la instalación aislada. El recorrido de captura vuelve a limpiar la base y comprueba la elección real en la interfaz, conservando las evidencias de la fase anterior. La lectura del PNG espera al menú nativo de compartir: ese menú se abre después de completar la copia del archivo, evitando que la prueba intente decodificar una imagen aún en escritura.

El artefacto `android-ui-verification-api29` o `android-ui-verification-api35` contiene PNG, metadatos JSON y registros de cada recorrido. El artefacto independiente `KnowYourSignal-QA-arm64` contiene la APK instalable configurada y su verificación. Los registros no certifican señal de radio real ni el tiempo total con una conexión móvil.

`SyncIntegrationTest` utiliza otro servidor HTTPS local, certificados temporales y Room en memoria. Cubre renovación de tokens después de un 401, respuestas 429 y 503, recibos parciales e incompletos y revocación durante el envío. `FieldMigrationTest` abre el esquema Room 1, conserva capturas, consentimiento y outbox, migra a 2 y comprueba el payload resultante. No requiere un proyecto Supabase de pago ni escribe en el proyecto alojado.

## Prueba de aceptación en teléfono

Usa la APK QA para comprobar señal Wi-Fi y móvil reales, permisos y ubicación, modo avión, cierre y reapertura, giro y texto ampliado, recorte del plano y PNG compartido. El aporte y la revocación completos deben probarse con un proyecto de pruebas y una red intermitente. Anota modelo, versión Android, red y tiempos de carga. Conserva el consentimiento explícito y no introduzcas identificadores de red o del dispositivo.

La FDR pide menos de tres acciones. Tras la primera activación explícita, las capturas consecutivas en el mismo recinto requieren registrar y confirmar. Volver a Medir reanuda una lectura nueva; no se lee durante el formulario. El primer registro sigue requiriendo declarar piso y tamaño, además de guardar. El equipo debe validar con la contraparte qué acciones cuenta ese criterio; esta implementación no demuestra su cumplimiento literal para el primer registro.
