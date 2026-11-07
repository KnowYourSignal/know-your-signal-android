# Cliente Android de Know Your Signal

La navegación y la identidad visual siguen la entrega de QuilPalta. El cliente conserva el recorrido de inicio, el asistente de medición, el selector de recinto, el modo técnico y las pestañas de historial, comunidad y ajustes. Las vistas utilizan lecturas y estados reales. El backend de los issues #7 y #8 sigue definiendo el contrato público.

| Issue | Implementación |
| --- | --- |
| #1 · Telemetría | TurboModule con Codegen. Lee ubicación y señal de la red activa. Valida precisión menor a 10 m, antigüedad monotónica de hasta 5 s y desfase de hasta 2 s. Clasifica Wi-Fi según la seguridad disponible y usa RSRP para LTE/NR. |
| #2 · Room | Historial y outbox se insertan en una transacción. Una captura conserva su UUID al repetir el guardado. Las consultas locales indexan piso, métrica y fecha. |
| #3 · WorkManager | Solo envía capturas en cola para la revisión de consentimiento vigente. Serializa el acceso a la sesión anónima y conserva los tokens cifrados con Android Keystore. Aplica reintentos exponenciales y confirma cada ID según el recibo del servidor. |
| #4 · Privacidad | El inicio exige elegir uso personal o aporte comunitario. Ajustes permite cambiar la decisión, ver la cola y revocar. La decisión se guarda localmente antes de intentar confirmarla en el servidor. |
| #5 · Captura | El asistente muestra ubicación y señal, bloquea muestras inválidas y congela una lectura. El formulario requiere piso entero de −10 a 150 y tamaño seleccionado. El piso 0 es válido. |
| #6 · Evidencia | La vista previa compone un plano, leyenda, piso, tipo de red y rango de fechas. Captura únicamente esa tarjeta en PNG y abre el menú de compartir con FileProvider. |
| #7 · Seguridad | El cliente usa las RPC con permisos existentes y la sesión del usuario para el consentimiento. El historial local permanece separado de las tablas remotas. |
| #8 · Ingesta y agregados | Los lotes siguen el esquema 1.0, con hasta 100 mediciones y campos explícitos. El mapa usa la RPC agregada con métrica y piso obligatorios. |
| #9 · Mapas | El historial usa el plano local sin teselas. Comunidad puede mostrar un mapa base con Google Maps o el mismo plano geográfico. Cada capa normaliza su métrica por separado. Las consultas se aplazan 300 ms durante cambios de vista y se guardan en caché cinco minutos. |

## Privacidad y sincronización

La primera decisión no preselecciona el aporte. El modo personal guarda la captura en Room sin encolarla. Con aporte activo, Room guarda el historial y el outbox juntos. La cola se procesa con red disponible y después de confirmar el consentimiento con Supabase. Los datos antiguos quedan en el historial local cuando el usuario empieza a aportar.

Una revocación actualiza Room y retira los pendientes en la misma transacción. Los trabajos de red consultan la revisión de consentimiento antes de iniciar la solicitud. Si un envío ya alcanzó el servidor antes de la revocación, su procesamiento puede completarse. Las respuestas de una revisión anterior no reactivan elementos de la cola. El servidor recibe la revocación cuando vuelve la conexión. Los aportes aceptados se conservan según el contrato del backend.

El cliente de ingesta usa una clave publicable y un JWT de usuario. El mapa comunitario solicita solo agregados con la clave publicable y aplica piso y métrica antes de consultar. «Mi zona» requiere una acción explícita y redondea el centro antes de consultar el viewport. La imagen de evidencia muestra una coordenada aproximada de referencia que se puede revisar antes de compartirla.

## Verificación

- npm run typecheck comprueba los tipos de las pantallas y los contratos nativos.
- npm test -- --runInBand cubre el inicio sin una selección de privacidad, el umbral de captura, el piso 0 y el contrato y caducidad de la caché del mapa.
- En android, bash gradlew :app:testDebugUnitTest comprueba la guarda temporal y de precisión.
- bash gradlew :app:connectedDebugAndroidTest comprueba Room, la reversión si falla la inserción en el outbox, la revocación, el contrato del lote y los recibos en Android.
- npm run test:backend ejecuta las pruebas del backend del grupo 11.

La revisión en teléfono debe incluir una captura Wi-Fi y otra móvil, reinicio en modo avión, reconexión con aportes en cola y exportación de un PNG desde el historial. La meta de tres segundos del mapa incluye la red, la RPC y el dibujo en Android. Las mediciones aisladas de SQL, la caché y las pruebas de contrato no sustituyen esa medición con un conjunto representativo. El traslado de PostGIS sigue el [seguimiento de infraestructura](../supabase/POSTGIS_REVIEW.md).
