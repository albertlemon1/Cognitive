# Barra Sepia

Juego web cognitivo. Operas una máquina de café de los años 50: lees comandas en un riel, las recuerdas, configuras la máquina, sostienes la presión durante la extracción y entregas cada bebida a su comanda. Entrena atención sostenida, memoria de trabajo, control inhibitorio y cambio entre tareas.

El juego entrena tareas concretas dentro del juego; no es una herramienta médica ni garantiza mejoras en la vida diaria.

El diseño técnico completo está en [`docs/DISENO.md`](docs/DISENO.md).

## Jugar en local

No hace falta compilar. Sirve la carpeta del proyecto con cualquier servidor estático:

```sh
npm run serve        # http://127.0.0.1:8080
```

Phaser y las fuentes se cargan desde CDN, así que la primera carga necesita conexión.

## Generar los dos destinos

```sh
npm install          # solo instala Phaser, para las pruebas
npm run build
```

`scripts/build.mjs` valida `data/recipes.json`, empaqueta el código y genera:

| Salida | Para qué sirve |
|---|---|
| `netlify/` | Carpeta estática con PWA (service worker, manifiesto, iconos). |
| `dist/barra-sepia.html` | Un solo archivo con todo el JavaScript inline, para el visor de Claude. |

Las dos salidas se guardan en el repositorio, así que se pueden usar sin compilar. No las edites a mano: se regeneran con `npm run build`.

## Desplegar en Netlify

1. Abre [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta `netlify/`.

Netlify la sirve por HTTPS, el service worker se registra y el juego se puede instalar como app y jugar sin conexión después de la primera visita.

## Pruebas

```sh
npm test             # pruebas unitarias de la lógica (node --test)
npm run test:e2e     # build + Playwright en teléfono, tableta y escritorio, para ambos destinos
npm run check        # todo
```

Las pruebas E2E usan Playwright con Chromium instalado en el sistema (no es dependencia del proyecto). No necesitan red: sirven Phaser desde `node_modules` interceptando la URL del CDN.

## Agregar una bebida

Edita `data/recipes.json`: añade la bebida en `drinks` con sus pasos y su icono, y su peso en `levels.barrio.drinkWeights`. Si necesitas un paso nuevo, añádelo en `steps`; un `visual` desconocido usa la animación genérica. Luego `npm run build`. La validación del catálogo indica el campo exacto si algo no cuadra.

## Estructura

```
index.html, manifest.webmanifest, icons/   entrada web y PWA
data/recipes.json                           bebidas, pasos, extras y niveles
src/core/        lógica pura: PRNG, catálogo, comandas, máquina, dificultad, sesión, métricas
src/scenes/      escena de Phaser
src/ui/          máquina, riel, consola, HUD, efectos, pantallas HTML y Cuaderno
src/audio/       música swing y efectos con Web Audio
src/telemetry/   historial en IndexedDB (con respaldo en memoria)
src/platform/    ajustes, carga de Phaser, PWA, tamaño de pantalla
scripts/         build, bundler mínimo, servidor estático, iconos
tests/           unitarias (node --test) y E2E (Playwright)
```
