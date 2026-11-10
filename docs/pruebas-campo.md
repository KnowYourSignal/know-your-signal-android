# Registro de aceptación en teléfono

Completar con la APK **Know Your Signal QA 1.1** del [PR #11](https://github.com/KnowYourSignal/know-your-signal-android/pull/11). Esta hoja empieza sin resultados: las pruebas del emulador no cuentan como una ejecución en teléfono.

| Datos de la sesión              | Valor     |
| ------------------------------- | --------- |
| Fecha y responsable             | Pendiente |
| Modelo y versión de Android     | Pendiente |
| Versión de APK y SHA-256        | Pendiente |
| Proyecto de prueba para aportes | Pendiente |
| Redes y tecnologías disponibles | Pendiente |

Usar capturas propias con consentimiento y una instalación de pruebas. Registrar solo los datos necesarios para evaluar el resultado; no anotar SSID, MAC, IMEI ni tokens.

| Caso                     | Recorrido y resultado esperado                                                                                                                                                             | Resultado / evidencia |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Uso personal · #4        | Elegir uso personal. Capturar no incrementa los aportes remotos.                                                                                                                           | Pendiente             |
| Wi-Fi · #1/#5            | Conectarse a Wi-Fi, esperar precisión menor a 10 m y capturar. Revisar red, potencia y piso. Si Android no clasifica la Wi-Fi, confirmar que la declaración manual se identifica como tal. | Pendiente             |
| Datos móviles · #1       | Desconectar Wi-Fi. Comprobar LTE o NR cuando estén disponibles y su métrica; una tecnología no disponible se registra como no aplicable.                                                   | Pendiente             |
| Calidad · #1/#5          | Con ubicación imprecisa o lectura antigua, Capturar permanece bloqueado y explica el motivo. Una muestra válida vuelve a habilitarlo.                                                      | Pendiente             |
| Cambio de red · #1       | Cambiar de Wi-Fi a datos durante la lectura. La captura debe corresponder a la nueva red o pedir otra lectura.                                                                             | Pendiente             |
| Permisos · #1/#9         | Denegar ubicación y conservar acceso al historial. En Comunidad, conceder solo ubicación aproximada desde «Mi zona» y comprobar el primer centrado.                                        | Pendiente             |
| Piso y recinto · #5      | Guardar piso 0; comprobar valores fuera del rango −10…150 y tamaño obligatorio. En el siguiente registro, confirmar expresamente el último recinto.                                        | Pendiente             |
| Persistencia · #2        | Activar modo avión, cerrar y reabrir. Comprobar piso, señal, fecha y estado conservados.                                                                                                   | Pendiente             |
| Actualización · #2       | Instalar la actualización sobre la QA anterior, sin desinstalar ni borrar datos. Confirmar conservación del historial, privacidad y cola.                                                  | Pendiente             |
| Aporte · #3/#4/#8        | En el proyecto de pruebas, activar aporte, capturar, verificar consentimiento y recibo del servidor. Los contadores deben cambiar sin abrir Ajustes.                                       | Pendiente             |
| Red intermitente · #3/#8 | Interrumpir un envío y recuperar la conexión. La cola reintenta con el mismo ID y no crea duplicados.                                                                                      | Pendiente             |
| Revocación · #3/#4/#7    | Con elementos pendientes, revocar sin red. El historial se conserva y la cola se retira. Reconectar y comprobar la revocación remota y el bloqueo de nuevos aportes.                       | Pendiente             |
| Evidencia · #6           | Recortar el plano, abrir la vista previa, girar y compartir el PNG. Comparar encuadre, señales, piso, fechas, leyenda y clasificación manual si corresponde.                               | Pendiente             |
| Accesibilidad · todos    | Usar texto al 150 %, giro, TalkBack y movimiento reducido. Comprobar lectura, navegación y acceso a acciones sin solapamientos.                                                            | Pendiente             |
| Mapa · #9                | Cambiar piso, tecnología y tipo de Wi-Fi; tocar celdas y espacio vacío. Comprobar leyenda, selección, error sin perder la última vista y reintento.                                        | Pendiente             |

## Tiempo completo del mapa

Preparar datos representativos en un entorno de pruebas, con al menos cinco cuentas técnicas por celda publicada. Medir desde la acción que solicita la zona hasta que se ven las celdas y el mapa responde. Separar consultas nuevas y zonas ya consultadas; registrar fallos, no solo los intentos rápidos. El objetivo es **menos de 3 segundos** e incluye red, consulta y dibujo.

| Equipo / red | Datos disponibles / celdas visibles | Nueva o en caché | Tiempo total | Resultado / observación |
| ------------ | ----------------------------------- | ---------------- | ------------ | ----------------------- |
| Pendiente    | Pendiente                           | Pendiente        | Pendiente    | Pendiente               |

## Acuerdos de aceptación

| Criterio                                                     | Decisión y responsable                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Qué cuenta como acción en «menos de tres acciones» de la FDR | Pendiente de acuerdo con la contraparte. Registrar por separado primera captura y captura repetida. |
| Dispositivos y redes que forman parte de la aceptación       | Pendiente                                                                                           |
| Resultado final y observaciones por resolver                 | Pendiente                                                                                           |
