# PostGIS: revisión del proyecto y siguiente acción

Comprobación de solo lectura del 4 de noviembre de 2026 en
`oefdpaqezvksxjgruufv` (Know Your Signal).

| Comprobación | Resultado |
| --- | --- |
| Extensión | PostGIS 3.3.7 en `public`, no relocatable |
| Propietario de la extensión y `spatial_ref_sys` | `supabase_admin` |
| Rol conectado | `postgres`, sin membresía en `supabase_admin` |
| Permisos para revocar grants existentes | Sin grant option sobre la tabla |
| RLS de `spatial_ref_sys` | Deshabilitado; roles API con permisos de escritura |
| Columnas de la aplicación dependientes | `geom`: `geography(Point,4326)`; `geom_6933`: `geometry(Point,6933)` generado |
| RPC de aplicación preparadas | Las cuatro tienen `extensions` en su search_path fijo |
| Cambios de la tabla de referencia registrados en estadísticas | 0 updates y 0 deletes desde el reinicio de estadísticas informado |
| Logs consultados, últimas 24 horas | 51 entradas de Data API; 0 solicitudes a `spatial_ref_sys` |
| Mediciones de la aplicación | 3; misma huella que antes de la revisión |

La optimización de rendimiento ya aplicada añade `geom_6933`, generada desde
`geom`, y un índice GiST. Incluir también esos objetos en la petición de traslado. El código con ambas columnas pasó los escenarios nativos con PostGIS
en `public` y en `extensions`; esto no mueve la extensión del proyecto.

Las estadísticas no identifican inserciones ajenas a la instalación y la ventana
de logs no demuestra ausencia de cambios fuera del periodo consultado.

## Corrección indicada por Supabase

La [guía oficial](https://supabase.com/kb/troubleshooting/security-advisor-flags-spatial_ref_sys-and-other-postgis-objects-in-the-public-schema)
indica mover PostGIS a `extensions`. Como ya hay columnas geográficas, corresponde
solicitar el traslado a Soporte preservando los objetos. Un `REVOKE` sin permisos
puede completar sin cambiar nada; habilitar RLS no es posible con este propietario.
Eliminar y recrear la extensión puede eliminar columnas, índices y funciones
dependientes, por lo que no se ejecutó en el proyecto.

`spatial_ref_sys` contiene definiciones de coordenadas, no mediciones. El permiso
de escritura permite dañar esas definiciones y afectar las consultas espaciales.
El aviso de `st_estimatedextent` no equivale a un endpoint REST operativo: esa
función tiene argumentos sin nombre. No se deben ocultar los avisos ni asumir que
los permisos quedaron corregidos solo porque un comando no produjo errores.

## Datos para solicitar el traslado

Proyecto `oefdpaqezvksxjgruufv`, Know Your Signal, PostgreSQL 17.11 / PostGIS 3.3.7.
Solicitar traslado de PostGIS de `public` a `extensions` sin eliminar ni recrear
las columnas, datos, índices o RPC de aplicación. Las columnas dependientes son
`public.mediciones.geom` y `public.mediciones.geom_6933`; deben conservarse sus
expresiones generadas, índices y los SRID 4326 y 6933. Las RPC ya
incluyen `extensions` en su search_path. Confirmar la ventana y el procedimiento
de reconexión de Data API antes de realizar el traslado.

No se envió ninguna solicitud ni se modificaron objetos del proveedor.

## Verificación después del traslado

1. Confirmar `pg_extension.extnamespace` en `extensions`.
2. Ejecutar `supabase/verify-backend.sql` y volver a consultar los advisors.
3. Comparar conteo y huella de mediciones con el estado anterior.
4. Comprobar ingesta autenticada, revocación y mapa agregado desde la API.
5. Confirmar que `extensions` no se exponga en Data API y que las conexiones se
   renueven según las indicaciones de Soporte.

Para instalaciones nuevas, habilitar PostGIS directamente en `extensions` antes
de aplicar las migraciones históricas. No editar migraciones ya aplicadas al
proyecto. La suite nativa comprueba el backend con PostGIS en ambos esquemas;
ese ensayo aislado no mueve la extensión de Cloud ni prueba permisos del proveedor.
