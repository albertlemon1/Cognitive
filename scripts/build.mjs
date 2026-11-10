// Genera los dos destinos a partir del mismo código fuente:
//   netlify/               carpeta estática lista para arrastrar a Netlify (con PWA)
//   dist/barra-sepia.html  un solo archivo para el visor de Claude
// Uso: node scripts/build.mjs

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { bundle } from "./lib/bundle.mjs";
import { loadCatalog } from "../src/core/catalog.js";
import { PHASER_URLS, PHASER_VERSION } from "../src/platform/phaser-loader.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

function between(text, name) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`index.html: faltan los marcadores ${start} / ${end}`);
  return text.slice(i + start.length, j).trim();
}

/** JSON seguro dentro de <script>. */
function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** JavaScript seguro dentro de <script>. */
function inlineScript(code) {
  return code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

// 1. Validaciones previas.
const recipes = JSON.parse(read("data/recipes.json"));
const catalog = loadCatalog(recipes);
const indexHtml = read("index.html");
if (!indexHtml.includes(PHASER_URLS[0])) {
  throw new Error(`index.html no carga Phaser ${PHASER_VERSION} desde ${PHASER_URLS[0]}. Actualiza la etiqueta <script>.`);
}

// 2. Bundle del código.
const { code, modules } = bundle(join(ROOT, "src/main.js"), ROOT);
new vm.Script(code, { filename: "barra-sepia.bundle.js" }); // Lanza si hay errores de sintaxis.

// 3. Archivo único para el visor de Claude.
const css = read("src/styles.css");
const markup = between(indexHtml, "markup").replace('data-target="web"', 'data-target="viewer"');
const fonts = between(indexHtml, "fonts");
const buildInfo = { single: true, version: pkg.version, data: recipes };
const single = `<title>Barra Sepia</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Juego de atención y memoria: atiende comandas con una máquina de café de los años 50.">
${fonts}
<style>
${css.trim()}
</style>
${markup}
<script src="${PHASER_URLS[0]}"></script>
<script>globalThis.BARRA_SEPIA_BUILD = ${inlineJson(buildInfo)};</script>
<script>
${inlineScript(code)}</script>
`;
mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist/barra-sepia.html"), single);

// 4. Carpeta para Netlify.
const OUT = join(ROOT, "netlify");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const entry of ["index.html", "manifest.webmanifest", "icons", "src", "data"]) {
  cpSync(join(ROOT, entry), join(OUT, entry), { recursive: true });
}
const localFiles = listFiles(OUT).map((f) => relative(OUT, f).split("\\").join("/")).sort();
const hash = createHash("sha256");
for (const f of localFiles) hash.update(f).update(readFileSync(join(OUT, f)));
const version = `${pkg.version}-${hash.digest("hex").slice(0, 10)}`;
const sw = read("scripts/templates/sw.js")
  .replace("__VERSION__", version)
  .replace("__PRECACHE__", JSON.stringify(["./", ...localFiles], null, 2))
  .replace("__CDN__", JSON.stringify([PHASER_URLS[0]]));
writeFileSync(join(OUT, "sw.js"), sw);
writeFileSync(
  join(OUT, "_headers"),
  `/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/manifest.webmanifest
  Content-Type: application/manifest+json
`,
);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Barra Sepia ${pkg.version} · Phaser ${PHASER_VERSION}`);
console.log(`  catálogo: ${catalog.drinkOrder.length} bebidas, ${catalog.modifierOrder.length} modificadores`);
console.log(`  bundle: ${modules.length} módulos`);
console.log(`  dist/barra-sepia.html  ${kb(Buffer.byteLength(single))}`);
console.log(`  netlify/               ${localFiles.length + 2} archivos (caché ${version})`);
