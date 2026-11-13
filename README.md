# Know Your Signal

App Android para medir cobertura interior, guardar un historial por piso y consultar la señal agregada de la comunidad.

## Ejecutar desde el código

Instala Node.js 24, JDK 17, Android SDK 37.0, Build Tools 37.0.0, NDK 27.1.12297006 y CMake 3.22.1. Con un teléfono o emulador conectado, ejecuta npm ci y npm start en la raíz. En otra terminal, ejecuta npm run android.

El historial y el plano personal funcionan desde la instalación. Para habilitar el aporte y el mapa comunitario, proporciona estas variables de entorno al compilar. También puedes colocarlas en el gradle.properties de tu usuario.

| Variable                     | Valor                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| KYS_SUPABASE_URL             | URL HTTPS de la API del proyecto.                                               |
| KYS_SUPABASE_PUBLISHABLE_KEY | Clave pública de cliente que empieza por sb*publishable*.                       |
| KYS_GOOGLE_MAPS_KEY          | Opcional. Clave del SDK de Maps restringida a la aplicación Android y su firma. |

Comunidad usa el plano geográfico propio cuando no se configura una clave de Maps. El modo personal se elige al iniciar la app.

## Preparar una APK para el equipo

Después de npm ci, entra en android y compila la variante QA para teléfonos ARM64.

    bash gradlew :app:assembleQa -PreactNativeArchitectures=arm64-v8a

En Windows, usa gradlew.bat con los mismos argumentos. El resultado queda en android/app/build/outputs/apk/qa/app-qa.apk. Se instala como **Know Your Signal QA** con identificador com.knowyoursignal.qa y su propio historial. Incluye el código JavaScript y se abre directamente en el teléfono.

Puedes usar x86_64 para generar una variante equivalente para un emulador. Si configuras Google Maps en QA, aplica la restricción al identificador com.knowyoursignal.qa.

La variante QA usa la firma de desarrollo del proyecto y está destinada a las pruebas internas del equipo. Para distribuir una versión de producción, configura la firma del equipo.

La versión actual es **1.2 (código 3)**. El flujo [Android client](https://github.com/KnowYourSignal/know-your-signal-android/actions/workflows/android.yml) también construye la APK ARM64 y deja el artefacto `KnowYourSignal-QA-arm64`, con comprobación de firma, alineación de 16 KiB y SHA-256. Descarga el artefacto de una ejecución aprobada y descomprime el ZIP antes de instalar la APK. Las APK `uitest` corresponden exclusivamente a los recorridos automáticos con datos sintéticos.

## Descarga de la Aplicación (Versión Beta para Pruebas)

La versión instalable para dispositivos Android (**v1.2.0-beta.1 · ARM64**) se encuentra disponible directamente en la sección [**Releases**](https://github.com/KnowYourSignal/know-your-signal-android/releases) de este repositorio:

- **Archivo APK autónomo:** `KnowYourSignal-v1.2.0-beta.1-arm64.apk` (incluye el bundle JavaScript compilado con Hermes, integración con Supabase/PostGIS y soporte de mapas Google Maps + plano geométrico offline; no requiere servidor de desarrollo Metro).

## Documentación del Proyecto y Entregables Oficiales (`docs/`)

Todos los documentos formales del proyecto y los informes de cierre por equipo se encuentran en la carpeta [`docs/`](docs/):

- **Informes de Cierre y Validación Técnica (Entrega Actual):**
  - [Informe de Cierre y Validación Técnica - Grupo 10 (Capa Móvil y Experiencia de Usuario)](<docs/Informe_de_Cierre_y_Validacion_Tecnica_G10.docx>)
  - [Informe de Cierre y Validación Técnica - Grupo 11 (Arquitectura Cloud y Modelado Espacial)](<docs/Informe_de_Cierre_y_Validacion_Tecnica_G11.docx>)
- **Documentos Base de Ingeniería y Diseño:**
  - [Formulario de Requerimientos (FDR - GTD)](<docs/Formulario de Requerimientos FDR GTD.docx>)
  - [Propuesta de Solución (PDS)](<docs/Propuesta de Solución PDS.docx>)
  - [Informe de Diseño y Arquitectura (IDA - G10 y G11)](<docs/Informe_de_Diseno_y_Arquitectura_CobPerfecta_G10_11.docx>)
- **Documentación Técnica del Backend:**
  - [Backend de Supabase, migraciones PostGIS y contratos RPC](supabase/README.md)

## Verificación Automatizada

Ejecuta `npm run typecheck`, `npm run lint` y `npm test -- --runInBand` para comprobar el cliente móvil. Las pruebas estáticas de contrato del backend se ejecutan con `npm run check:backend` y la suite de integración PostGIS con `npm run test:backend`.
