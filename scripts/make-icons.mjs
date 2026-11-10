// Genera los iconos PNG de la PWA a partir de icons/favicon.svg.
// Requiere Playwright (no es dependencia del proyecto; solo se usa al regenerar iconos).
// Uso: node scripts/make-icons.mjs

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const svg = readFileSync(join(ROOT, "icons/favicon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [file, size, padding] of [
  ["icons/icon-192.png", 192, 0],
  ["icons/icon-512.png", 512, 0],
  // Zona segura de iconos "maskable": el dibujo ocupa el 80 % central.
  ["icons/icon-maskable-512.png", 512, 0.1],
]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - padding * 2));
  await page.setContent(`<html><body style="margin:0;background:#2a1d15;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: join(ROOT, file), omitBackground: false });
  console.log(`  ${file}`);
}
await browser.close();
