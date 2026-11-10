# Barra Sepia — Diseño técnico

Versión del documento: fase 1 (MVP).

## 1. Resumen

Barra Sepia es un juego web cognitivo. El jugador opera una máquina de café vintage: lee comandas en un riel, las recuerda, configura la máquina, sostiene la presión durante la extracción y entrega la bebida a la comanda correcta.

Entrena cuatro funciones:

| Función | Dónde aparece en el juego |
|---|---|
| Atención sostenida | Manómetro durante la extracción; vigilar el riel mientras se prepara |
| Memoria de trabajo | Comandas que se voltean tras unos segundos; hasta 3 comandas a la vez |
| Control inhibitorio | Comandas trampa: icono que contradice el texto, comandas casi iguales |
| Cambio de tareas | Alternar entre configurar, sostener presión y entregar |

El juego entrena tareas concretas. No promete mejoras en la vida diaria, y la interfaz lo dice en la pantalla de inicio y en el Cuaderno.

## 2. Restricciones que guían el diseño

1. **Dos destinos con el mismo código fuente.**
   - Carpeta estática para Netlify (arrastrar y soltar), con PWA.
   - Un solo archivo HTML para el visor de Claude, con todo el JavaScript inline.
2. **Sin compilación para el usuario final.** El código fuente son módulos ES en JavaScript con tipos JSDoc. El navegador los carga tal cual.
3. **Sin IA externa ni red durante el juego.** Solo Phaser (CDN) y, opcionalmente, dos fuentes de Google Fonts con respaldo local.
4. **Determinismo.** Toda la aleatoriedad del juego sale de un PRNG con semilla. Una sesión se puede reproducir con su semilla y la lista de acciones.

## 3. Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Motor | Phaser 3.90.0, build UMD (`phaser.min.js`) como global `Phaser` | Última versión de Phaser 3, publicada en mayo de 2025; el UMD funciona en ambos destinos sin bundler |
| CDN | Principal `cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js`; respaldos unpkg y cdnjs | jsDelivr refleja npm, así que la ruta existe con certeza; los tres están permitidos en el visor |
| Lenguaje | JavaScript ES2020 con JSDoc | Cero compilación; los tipos documentan los contratos |
| Lógica de juego | Módulos puros en `src/core/`, sin Phaser ni DOM | Se prueban en Node y la vista se puede reconstruir desde el estado |
| Vista de juego | Una escena de Phaser con componentes dibujados por código (Graphics, Text, tweens) | Sin imágenes en la fase 1: el archivo único queda autocontenido |
| Menús y Cuaderno | HTML y CSS sobre el canvas | Texto accesible, tamaño configurable, lectores de pantalla |
| Audio | Web Audio API, sonidos y música generados por código | Sin archivos de audio; arranca tras el primer toque |
| Persistencia | IndexedDB para sesiones; localStorage para ajustes; respaldo en memoria si fallan | El visor puede bloquear el almacenamiento; el juego nunca debe romperse por eso |
| Pruebas unitarias | `node --test` (sin dependencias) | Suficiente para lógica pura |
| Pruebas E2E | Playwright ya instalado en el entorno, cargado con `createRequire` | No se agrega dependencia; Phaser se sirve desde `node_modules` interceptando la URL del CDN |
| Build | `scripts/build.mjs` en Node puro: genera `netlify/` y `dist/barra-sepia.html` | Sin dependencias nuevas |

### Por qué no Vite ni TypeScript compilado

El requisito de "arrastrar una carpeta a Netlify" y "pegar un archivo en el visor" pide que el código servido sea el mismo que se escribe. JSDoc da tipos sin compilación; si más adelante se quiere chequeo estricto, `tsc --checkJs --noEmit` funciona sobre los mismos archivos sin cambiar la salida.

## 4. Capas

```
┌─────────────────────────────────────────────────────────────┐
│  index.html / dist/barra-sepia.html                         │
│  Carga Phaser (CDN) → src/main.js (módulo o inline)          │
└──────────────┬──────────────────────────────────────────────┘
               │ arranque: datos, ajustes, almacenamiento
┌──────────────▼──────────────┐   ┌──────────────────────────┐
│  ui/overlay.js (DOM)        │   │  audio/audio.js          │
│  inicio, pausa, ajustes,    │   │  Web Audio: música swing │
│  resumen, Cuaderno          │   │  y efectos               │
└──────────────┬──────────────┘   └───────────▲──────────────┘
               │ iniciar / pausar / terminar   │ eventos
┌──────────────▼───────────────────────────────┴──────────────┐
│  scenes/BarScene.js (Phaser)                                │
│  - llama session.tick(dt) cada frame                         │
│  - traduce toques y teclas a acciones de sesión              │
│  - dibuja el estado y anima según los eventos                │
│  Componentes: ui/machine.js, ui/rail.js, ui/controls.js,     │
│  ui/hud.js, ui/effects.js (grano y viñeta)                   │
└──────────────┬──────────────────────────────────────────────┘
               │ acciones          ▲ estado + eventos
┌──────────────▼───────────────────┴──────────────────────────┐
│  core/ (lógica pura, sin Phaser ni DOM)                      │
│  prng.js · catalog.js · orders.js · machine.js ·             │
│  difficulty.js · session.js · stats.js                       │
└──────────────┬──────────────────────────────────────────────┘
               │ eventos de telemetría
┌──────────────▼──────────────────────────────────────────────┐
│  telemetry/store.js — IndexedDB (o memoria)                  │
│  platform/settings.js — localStorage (o memoria)             │
└─────────────────────────────────────────────────────────────┘
```

Regla: `core/` no importa nada fuera de `core/`. La escena no decide reglas de juego; solo envía acciones y dibuja.

## 5. Contratos entre módulos

### 5.1 `core/prng.js`

```js
createRng(seed: number) → Rng
Rng.next(): number            // [0, 1)
Rng.int(min, max): number     // entero en [min, max]
Rng.chance(p): boolean
Rng.pick(array): T
Rng.weighted(items, weightOf): T
Rng.shuffle(array): T[]       // copia barajada
Rng.getState(): number        // para guardar y reanudar
seedFromString(text): number  // hash FNV-1a de 32 bits
```

Algoritmo: mulberry32. Misma semilla, misma secuencia, en Node y en el navegador.

### 5.2 `core/catalog.js`

```js
loadCatalog(json) → Catalog            // valida y normaliza; lanza CatalogError con ruta del campo
stepsFor(catalog, drinkId, modifiers) → Step[]   // receta final con modificadores aplicados
allowedModifiers(catalog, drinkId) → string[]
```

`Catalog` contiene `drinks`, `modifiers`, `steps`, `levels` (como `Map` por id) y el orden canónico de modificadores.

### 5.3 `core/orders.js`

```js
createOrderFactory({ catalog, rng, levelId }) → OrderFactory
OrderFactory.next(params: DifficultyParams, pending: Order[]) → Order
compareOrder(expected: OrderSpec, produced: OrderSpec) → OrderDiff
```

```js
/** Order */
{
  id: 7,                       // número visible "#7"
  drinkId: "cortado",
  modifiers: ["azucar"],      // orden canónico
  iconDrinkId: "cortado",     // distinto de drinkId en trampa "icono"
  trap: null | "icono" | "parecida"
}

/** OrderDiff */
{ ok: false, drinkOk: true, expectedDrinkId: "cortado", producedDrinkId: "cortado",
  missing: ["azucar"], extra: [] }
```

### 5.4 `core/machine.js`

Máquina de estados de la preparación:

```
idle ──pullLever (con bebida elegida)──▶ brewing ──último paso──▶ ready ──take()──▶ idle
  ▲                                         │
  └───────────── reset() ◀──────────────────┘ (solo pruebas / fin de sesión)
```

```js
const m = new BrewMachine({ catalog, rng, gauge: GaugeParams })
m.selectDrink(id)   m.toggleModifier(id)   m.setPressure(held)
m.pullLever() → boolean      // false si no hay bebida o no está en idle
m.tick(dtMs) → MachineEvent[]  // step_start, step_end, gauge_result, brew_done
m.take() → ProducedDrink | null
m.snapshot() → MachineState
```

El manómetro vive en `core/gauge.js`: valor en [0, 1], sube mientras se sostiene la presión, baja al soltar, y una deriva aleatoria (del PRNG) lo empuja. Calidad = tiempo en zona / tiempo de extracción tras un margen de gracia. Calidad ≥ 0.6 es extracción buena.

### 5.5 `core/difficulty.js` (función pura)

```js
initialDifficulty(level = 1) → DifficultyState
updateDifficulty(state, outcome: "success" | "fail" | "neutral", rules?) → { state, changed, from, to }
paramsFor(level, { calm }) → DifficultyParams
```

Escalera con histéresis:

- Sube un nivel tras `upAfter = 3` éxitos seguidos.
- Baja un nivel tras `downAfter = 2` fallos seguidos.
- Al cambiar de nivel, ambos contadores vuelven a cero.
- Un resultado neutral corta la racha de éxitos pero no suma fallos.
- Límites: nivel 1 a 8.

La asimetría (3 para subir, 2 para bajar) y el reinicio de contadores evitan que el nivel oscile en cada comanda. Con esta regla la precisión tiende a estabilizarse entre 70 % y 80 %, una zona de reto razonable.

Tabla de parámetros:

| Nivel | Exposición (ms) | Simultáneas | Zona verde | Trampas | Modif. máx. | Pausa entre llegadas (ms) | Paciencia (ms) | Deriva |
|---|---|---|---|---|---|---|---|---|
| 1 | siempre visible | 1 | 0.40 | 0.00 | 0 | 1500 | 60000 | 0.30 |
| 2 | siempre visible | 1 | 0.36 | 0.05 | 1 | 1500 | 55000 | 0.40 |
| 3 | siempre visible | 2 | 0.33 | 0.10 | 1 | 3000 | 50000 | 0.50 |
| 4 | 9000 | 2 | 0.30 | 0.15 | 2 | 3000 | 46000 | 0.60 |
| 5 | 7000 | 2 | 0.27 | 0.20 | 2 | 2800 | 43000 | 0.70 |
| 6 | 6000 | 3 | 0.24 | 0.25 | 2 | 2600 | 40000 | 0.80 |
| 7 | 5000 | 3 | 0.21 | 0.30 | 3 | 2400 | 38000 | 0.90 |
| 8 | 4000 | 3 | 0.18 | 0.35 | 3 | 2200 | 35000 | 1.00 |

Modo Calma: sin paciencia (no hay comandas perdidas), máximo 2 simultáneas, pausa entre llegadas ×1.5, deriva ×0.7.

### 5.6 `core/session.js`

Orquesta una sesión completa con reloj propio (suma de `dt`), así que es determinista:

```js
const s = createSession({ catalog, seed, levelId, mode: "normal" | "calma",
                          durationMs, startLevel, sessionId })
s.tick(dtMs)
s.selectDrink(id) / s.toggleModifier(id) / s.setPressure(held) / s.pullLever()
s.deliver(orderId) → DeliveryResult | null
s.clean() → boolean        // pausa "Limpiar la máquina": congela llegadas y paciencia 3 s
s.end()                    // termina antes de tiempo
s.getState() → SessionState
s.drainEvents() → TelemetryEvent[]
```

Reglas de entrega:

- **Configuración correcta y manómetro bueno:** éxito. Propina +10 (+5 si la calidad ≥ 0.85).
- **Configuración correcta, manómetro malo:** se sirve; resultado neutral; aviso "vigila el manómetro".
- **Configuración incorrecta:** la máquina tose, la bebida se descarta, la comanda sigue en el riel, se muestra qué ajustar (bebida esperada, modificadores que faltan o sobran). La configuración se conserva para corregirla. Resultado fallo. Si después se entrega bien, cuenta como neutral (corregida), no como éxito.
- **Comanda que vence su paciencia:** se pierde (omisión). Resultado fallo.
- Al terminar el tiempo, las comandas pendientes no cuentan como omisiones.

### 5.7 `core/stats.js`

```js
summarize(events) → SessionSummary
trend(summaries, key, { lowerIsBetter }) → { values, last, previousMean, delta, direction }
```

Métricas del Cuaderno (fase 1):

1. **Precisión:** comandas servidas bien a la primera / comandas servidas.
2. **Tiempo de reacción:** media de `reactionMs` (ver 6.2).
3. **Control inhibitorio:** comandas trampa servidas bien a la primera / comandas trampa resueltas (servidas o perdidas).

Además se guardan omisiones, errores de configuración y errores de manómetro.

## 6. Formatos de datos

### 6.1 `data/recipes.json`

```json
{
  "version": 1,
  "steps": {
    "moler":   { "label": "Moler",   "durationMs": 900,  "visual": "grind", "fill": null },
    "extraer": { "label": "Extraer", "durationMs": 3500, "visual": "pour",  "gauge": true,
                 "fill": { "color": "#3b2416", "amount": 0.35 } }
  },
  "modifiers": {
    "azucar": { "label": "Azúcar", "short": "Azúcar", "icon": "cube", "key": "Q",
                "effects": [{ "type": "appendStep", "step": "azucar" }] },
    "avena":  { "label": "Leche de avena", "short": "Avena", "icon": "oat", "key": "E",
                "requiresAnyStep": ["leche", "espuma"],
                "effects": [{ "type": "replaceStep", "from": "leche", "to": "leche_avena" }] }
  },
  "drinks": {
    "cortado": { "label": "Cortado", "family": "leche",
                 "steps": ["moler", "extraer", "leche"],
                 "icon": { "vessel": "glass", "layers": ["espresso", "milk"], "topping": null } }
  },
  "levels": {
    "barrio": { "label": "Barrio", "startLevel": 1, "drinkWeights": { "espresso": 3 } }
  }
}
```

Tipos de efecto de modificador: `appendStep`, `replaceStep`, `scaleStep` (multiplica la duración). Un paso con un `visual` desconocido se anima con la animación genérica (lámpara y vapor), así que agregar una bebida o un paso nuevo no requiere código.

Pasos de fase 1: moler, moler_descaf, extraer, agua, leche, leche_avena, espuma, espuma_avena, cacao, canela, condensada, nata, hielo, decorar, azucar, tapa.

Bebidas de fase 1 (12): espresso, americano, cortado, macchiato, capuchino, latte, moka, descafeinado, bombón, vienés, café helado, café de olla.

Modificadores (4): azúcar, doble carga, leche de avena, para llevar.

### 6.2 Evento de telemetría

Todos los eventos comparten la forma:

```js
{ type: string, t: number /* ms de reloj de sesión */, ...payload }
```

| type | payload |
|---|---|
| `session_start` | `seed, levelId, mode, level, durationMs` |
| `order_arrived` | `orderId, drinkId, modifiers, trap, iconDrinkId` |
| `order_hidden` | `orderId` |
| `brew_start` | `drinkId, modifiers` |
| `gauge_result` | `quality, ok` |
| `order_served` | `orderId, firstAttempt, ok, gaugeOk, quality, trap, reactionMs, serviceMs, tip` |
| `order_mismatch` | `orderId, trap, diff` (error de configuración) |
| `order_missed` | `orderId, trap` (omisión) |
| `difficulty_change` | `from, to` |
| `clean` | — |
| `session_end` | `reason: "time" \| "quit", summary` |

`reactionMs` = momento de tirar la palanca − máx(llegada de la comanda, momento en que la máquina quedó libre). Mide cuánto tarda el jugador en configurar cuando la comanda y la máquina están disponibles.

`serviceMs` = entrega − llegada.

### 6.3 Registro guardado (IndexedDB, almacén `sessions`)

```js
{ id, startedAt /* ISO */, seed, levelId, mode, durationMs, endLevel, summary, events }
```

Ajustes y progreso (localStorage, clave `barra-sepia:v1`):

```js
{ settings: { musicVolume, sfxVolume, muted, reducedMotion, colorBlind, largeText,
              sessionMinutes, calm },
  progress: { lastLevel } }
```

## 7. Pantalla y responsividad

- Phaser en modo `Scale.FIT` con tamaño lógico adaptable (`src/platform/viewport.js`). El lado corto mide 720 unidades:
  - Teléfono vertical: ancho 720, alto = 720 ÷ proporción, hasta 1560.
  - Teléfono u ordenador horizontal: alto 720, ancho = 720 × proporción, hasta 1600.
  - Pantallas más cuadradas (tabletas): se fija el lado largo (1280 en vertical, 1200 en horizontal) y se ensancha el corto, para no dejar franjas vacías.
- Al girar o redimensionar, `scale.setGameSize()` y la escena recoloca sus componentes (`relayout()`); el estado no se pierde porque vive en `core/`.
- Regiones:
  - Vertical: HUD, riel, máquina y consola abajo (teclas 3×4). La consola ocupa como máximo el 58 % del alto disponible para que la máquina siga siendo protagonista.
  - Horizontal: máquina a toda altura en la columna izquierda; riel y consola (teclas 4×3) en la columna derecha.
- Comanda: 220×250 unidades de diseño, escalada al ancho de su hueco en el riel.
- En un teléfono de 390 px de ancho, las teclas de bebida miden unos 115×32 px CSS y los botones grandes unos 130×62 px.
- El reloj de la sesión usa el tiempo real entre cuadros (`game.loop.rawDelta`), no el delta suavizado de Phaser: con pocos cuadros por segundo el turno dura lo mismo.
- El fondo estático se dibuja una vez en una `RenderTexture`.

## 8. Accesibilidad

- Movimiento reducido: respeta `prefers-reduced-motion` y tiene interruptor propio. Desactiva grano animado, rebotes y sacudidas.
- Modo daltónico: la zona del manómetro lleva rayado y marcas; los aciertos y errores usan forma y texto además de color.
- Texto grande: aumenta el texto de comandas, teclas y menús.
- Teclado: 1-9, 0, `-`, `=` eligen bebida; Q, W, E, R alternan modificadores; Enter tira la palanca; Espacio sostiene la presión; flechas o A/S/D eligen comanda para entregar; Esc pausa.
- Región `aria-live` que anuncia comandas nuevas y la retroalimentación.

## 9. Entrega

```
index.html, manifest.webmanifest, icons/, src/, data/   ← fuente, servible tal cual
scripts/build.mjs        ← genera:
  netlify/               ← copia limpia + sw.js + _headers (arrastrar a Netlify)
  dist/barra-sepia.html  ← un archivo: CSS + datos + JS inline; Phaser por CDN
```

- El bundler de `scripts/lib/bundle.mjs` es mínimo y exige convenciones (ver 9.1). Si encuentra sintaxis no soportada, falla con un mensaje claro.
- El service worker solo se registra cuando la página no es el archivo único y se sirve por HTTPS.
- El archivo único sigue el contrato del visor de Claude: sin `<!doctype>` ni `<html>/<head>/<body>` propios, `<title>` al inicio, sin service worker, sin rutas relativas, almacenamiento opcional.

### 9.1 Convenciones de módulos (necesarias para el bundler)

- Solo `import { a, b as c } from "./ruta.js";` con rutas relativas. Sin `import x from`, sin `import *`, sin `import()` dinámico.
- Solo `export function`, `export async function`, `export class`, `export const` (un identificador) y `export { a, b as c };`. Sin `export default`.
- Sin dependencias circulares.
- `Phaser` es global; no se importa.

## 10. Plan de pruebas

| Área | Prueba |
|---|---|
| PRNG | Misma semilla → misma secuencia; distribución en rango; `int`, `pick`, `weighted` respetan límites |
| Catálogo | El JSON real valida; errores claros ante pasos o bebidas inexistentes; `stepsFor` aplica cada tipo de efecto |
| Comandas | Determinismo por semilla; respeta modificadores permitidos y máximo; tasa de trampas aproximada; `compareOrder` |
| Dificultad | Sube tras 3 éxitos; baja tras 2 fallos; neutral corta racha; reinicio de contadores; límites 1 y 8; parámetros de Calma |
| Máquina | Secuencia válida idle→brewing→ready→idle; palanca sin bebida no hace nada; no se cambia configuración durante la preparación; manómetro: sostener bien da calidad alta, soltar todo da calidad baja |
| Sesión | Llegadas hasta el máximo simultáneo; ocultamiento por exposición; omisión por paciencia; entrega correcta e incorrecta; Calma sin omisiones; fin por tiempo; misma semilla y mismas acciones → mismos eventos |
| Estadísticas | Métricas sobre eventos sintéticos; tendencias con mejora y empeora |
| Bundler | El archivo único se analiza sin errores de sintaxis; rechaza `export default` |
| E2E | Netlify y archivo único en teléfono, tableta y escritorio: carga sin errores de consola, inicia sesión, prepara y entrega una bebida con toques reales |

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El CDN no responde | Tres CDN en cascada; mensaje claro en pantalla si ninguno carga |
| El visor bloquea IndexedDB o localStorage | Respaldo en memoria; el Cuaderno avisa que el historial no se guardará |
| Audio bloqueado hasta interacción | El contexto de audio se crea en el botón "Abrir la cafetería" |
| Botones pequeños en teléfonos | Tamaño lógico adaptable y distribución vertical propia |
| Fuentes de Google sin red | Espera máxima de 1.5 s y pila de respaldo (Georgia, Courier New) |
| El bundler mínimo no soporta sintaxis nueva | Convenciones documentadas, validación estricta y prueba automática del bundle |
| Dificultad mal calibrada | Tabla en un solo lugar, pruebas del controlador, y la telemetría permite recalibrar con datos reales |

## 12. Práctica guiada y señales del manómetro (fase 1.1)

- **Práctica guiada** (`src/core/tutorial.js`, `src/ui/coach.js`): dos comandas con guion (Cortado; Capuchino con azúcar), sin reloj de paciencia y con la extracción 1,8 veces más larga. No se guarda en el historial.
  - Qué indicar se calcula en cada cuadro a partir del estado de la sesión (`practiceStep`), no como una secuencia fija: si el jugador elige otra bebida o activa un extra de más, la guía lo corrige.
  - Una tarjeta en el riel da la instrucción y manos de guante blanco señalan el control (tecla, interruptor, palanca, manómetro y botón PRESIÓN, comanda).
  - La primera vez, la pantalla de inicio propone la práctica como acción principal. Al completarla se guarda `progress.practiced` y aparece un resumen de los controles.
- **Señales del manómetro** durante la extracción, en tres sitios con el mismo código:
  - Manómetro: borde, halo y aguja turquesa en la zona; ladrillo fuera. En el centro, "EN ZONA", "PULSA ▲" o "SUELTA ▼".
  - Botón PRESIÓN: mismo color y el texto "¡En zona!", "Pulsa: sube" o "Suelta: baja".
  - Línea de estado de la consola con la instrucción completa.
  - El texto da la misma información que el color, así que sirve también en modo daltónico.

## 13. Fuera de la fase 1

- Niveles Centro y Estación de tren (el formato de `levels` ya los admite).
- Batería de evaluación previa y posterior.
- Jornadas con objetivos (hoy solo se cuentan sesiones del día).
- Arte con imágenes o Spine; por ahora todo es vectorial por código.
- Sincronización entre dispositivos.

## 14. Decisiones tomadas fuera del prompt

- **Pasos visibles pero automáticos.** El jugador elige bebida y modificadores; la máquina ejecuta los pasos sola. Así la carga cognitiva está en recordar y configurar, no en memorizar recetas.
- **Regla de las trampas:** "el texto manda". El icono puede mentir; el texto de la comanda es la orden real. Se explica en la pantalla de inicio.
- **Entrega por toque en la comanda.** La bebida lista se entrega tocando la comanda destino; así la entrega también requiere memoria cuando las comandas están volteadas.
- **Propinas** como puntaje amable: solo suman, nunca restan.
- **Archivo único en tema fijo.** La estética sepia es un mundo visual único; no hay variante oscura.
- **La placa de la máquina** muestra la bebida elegida; mientras prepara, el paso en curso ("EXTRAER ×2…"), y "¡LISTO!" al terminar. Las lámparas de la franja indican el avance de la receta y cuatro lámparas pequeñas reflejan los extras elegidos.
- **Error de configuración:** la bebida se descarta, la comanda se queda en el riel y la tarjeta de la máquina dice qué ajustar. Esto revela la comanda aunque estuviera volteada: es una ayuda deliberada para aprender, y el fallo ya cuenta en la precisión y en la dificultad.
- **Sesiones sin comandas resueltas** (por ejemplo, terminar a los pocos segundos) no se guardan en el historial.
- **Inicio de turno:** se empieza un nivel por debajo del último nivel alcanzado, como calentamiento.
- **Pruebas sin red:** las pruebas E2E sirven Phaser desde `node_modules` interceptando la URL del CDN y responden vacías las fuentes de Google.
