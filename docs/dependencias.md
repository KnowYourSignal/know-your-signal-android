# Revisión de dependencias del cliente

Revisión del 9 de noviembre de 2026, con Node 24 y el archivo de bloqueo del proyecto.

| Comprobación                                | Resultado                                             |
| ------------------------------------------- | ----------------------------------------------------- |
| Instalación limpia con npm ci               | Aprobada.                                             |
| TypeScript, ESLint y pruebas tras el ajuste | Aprobados; 27 pruebas del cliente.                    |
| npm audit completo antes                    | 9 avisos bajos y 6 moderados; ninguno alto o crítico. |
| npm audit completo después                  | 9 avisos bajos; ninguno moderado, alto o crítico.     |

## Ajuste aplicado

Se fija `minimatch` en **11.0.1** únicamente bajo `@typescript-eslint/typescript-estree`. Esa versión incorpora la corrección del [aviso de amplificación de patrones](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249); existe como [versión publicada por su mantenedor](https://github.com/isaacs/minimatch/releases/tag/v11.0.1). La versión anterior del árbol era 10.2.6. El cambio conserva React Native, React, navegación y los demás paquetes de la app. El nuevo auxiliar de coincidencia es una dependencia de desarrollo.

El override es temporal: retirarlo cuando la versión de typescript-eslint utilizada por React Native admita la versión corregida, y repetir instalación limpia, tipos, lint y pruebas. No reemplazar globalmente las versiones de minimatch usadas por otras herramientas.

## Seguimiento restante

Los nueve avisos bajos restantes corresponden a la cadena de `deepmerge` 4.3.1 en Jest y las herramientas CLI. El [aviso publicado](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) todavía no declara una versión corregida. El análisis del mapa de fuentes del bundle Android de producción incluyó 961 módulos y no incorporó deepmerge ni el CLI; el hallazgo corresponde al entorno de desarrollo de esta entrega. Ejecutar esas herramientas con configuración y código de confianza y revisar el parche del proveedor cuando esté disponible.

No se aplicó `npm audit fix --force`: las propuestas de bajar versiones mayores del CLI o de Jest necesitan una migración de compatibilidad separada. Los contadores de npm incluyen paquetes dependientes del mismo aviso, no nueve vulnerabilidades independientes.

Para repetir la revisión:

```sh
npm ci
npm audit
npm run typecheck
npx --no-install eslint --max-warnings 0 --ext .ts,.tsx App.tsx src __tests__ tests/domain
npm test -- --runInBand
```
