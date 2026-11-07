# Know Your Signal

App Android para medir cobertura interior, guardar un historial por piso y consultar la señal agregada de la comunidad.

## Ejecutar desde el código

Instala Node.js 24, JDK 17, Android SDK 37.0, Build Tools 37.0.0, NDK 27.1.12297006 y CMake 3.22.1. Con un teléfono o emulador conectado, ejecuta npm ci y npm start en la raíz. En otra terminal, ejecuta npm run android.

El historial y el plano personal funcionan desde la instalación. Para habilitar el aporte y el mapa comunitario, proporciona estas variables de entorno al compilar. También puedes colocarlas en el gradle.properties de tu usuario.

| Variable | Valor |
| --- | --- |
| KYS_SUPABASE_URL | URL HTTPS de la API del proyecto. |
| KYS_SUPABASE_PUBLISHABLE_KEY | Clave pública de cliente que empieza por sb_publishable_. |
| KYS_GOOGLE_MAPS_KEY | Opcional. Clave del SDK de Maps restringida a la aplicación Android y su firma. |

Comunidad usa el plano geográfico propio cuando no se configura una clave de Maps. El modo personal se elige al iniciar la app.

## Preparar una APK para el equipo

Después de npm ci, entra en android y compila la variante QA para teléfonos ARM64.

    bash gradlew :app:assembleQa -PreactNativeArchitectures=arm64-v8a

En Windows, usa gradlew.bat con los mismos argumentos. El resultado queda en android/app/build/outputs/apk/qa/app-qa.apk. Se instala como **Know Your Signal QA** con identificador com.knowyoursignal.qa y su propio historial. Incluye el código JavaScript y se abre directamente en el teléfono.

Puedes usar x86_64 para generar una variante equivalente para un emulador. Si configuras Google Maps en QA, aplica la restricción al identificador com.knowyoursignal.qa.

La variante QA usa la firma de desarrollo del proyecto y está destinada a las pruebas internas del equipo. Para distribuir una versión de producción, configura la firma del equipo.

## Verificación y entrega

- [Resumen para el equipo y recorrido de prueba](docs/entrega-equipo.md).
- [Diseño técnico y correspondencia con los issues](docs/architecture.md).
- [Backend de Supabase, migraciones y contrato](supabase/README.md).

Ejecuta npm run typecheck y npm test -- --runInBand para comprobar el cliente. El proyecto incluye una CI que compila Android y verifica Room en un emulador. Las pruebas del backend se preparan con npm ci --prefix tests/backend y se ejecutan con npm run check:backend y npm run test:backend.
