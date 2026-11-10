// Prueba de humo de extremo a extremo con Playwright (ya instalado en el entorno).
// Para cada destino (carpeta de Netlify y archivo único) y cada tamaño de pantalla:
// carga sin errores de consola, inicia un turno, prepara y entrega una bebida con
// toques reales sobre el lienzo.
//
// Phaser se sirve desde node_modules interceptando la URL del CDN, y las fuentes de
// Google se responden vacías: la prueba no depende de la red.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../scripts/serve.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PHASER = readFileSync(join(ROOT, "node_modules/phaser/dist/phaser.min.js"));

const VIEWPORTS = {
  telefono: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  tableta: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  escritorio: { viewport: { width: 1366, height: 768 } },
};
const TARGETS = { netlify: "netlify/index.html", "archivo único": "dist/barra-sepia.html" };

let server;
let browser;

before(async () => {
  const build = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs")], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  server = await startServer(ROOT);
  browser = await chromium.launch({ args: ["--no-proxy-server"] });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openGame(target, device) {
  const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
  await context.route(/phaser@3\.90\.0|phaser\/3\.90\.0/, (r) => r.fulfill({ body: PHASER, contentType: "text/javascript" }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${server.url}/${target}`);
  await page.waitForFunction(() => window.BarraSepia && window.BarraSepia.ready, null, { timeout: 30000 });
  return { context, page, errors };
}

async function tap(page, id) {
  const p = await page.evaluate((x) => window.BarraSepia.pointFor(x), id);
  assert.ok(p, `no se encontró el control ${id}`);
  await page.mouse.click(p.x, p.y);
}

/** Prepara la comanda indicada sosteniendo la presión como lo haría un jugador atento. */
async function brew(page, order) {
  await tap(page, `drink:${order.drinkId}`);
  for (const m of order.modifiers) await tap(page, `mod:${m}`);
  await tap(page, "lever");
  const pressure = await page.evaluate(() => window.BarraSepia.pointFor("pressure"));
  await page.mouse.move(pressure.x, pressure.y);
  let down = false;
  for (let i = 0; i < 600; i++) {
    const m = await page.evaluate(() => window.BarraSepia.getState().machine);
    if (m.phase === "ready") break;
    const step = m.steps[m.stepIndex];
    if (step && step.gauge && m.gauge) {
      const want = m.gauge.value < (m.gauge.zoneMin + m.gauge.zoneMax) / 2;
      if (want && !down) await page.mouse.down();
      if (!want && down) await page.mouse.up();
      down = want;
    }
    await page.waitForTimeout(40);
  }
  if (down) await page.mouse.up();
  const phase = await page.evaluate(() => window.BarraSepia.getState().machine.phase);
  assert.equal(phase, "ready", "la bebida debería quedar lista");
}

for (const [targetName, target] of Object.entries(TARGETS)) {
  for (const [deviceName, device] of Object.entries(VIEWPORTS)) {
    test(`${targetName} · ${deviceName}: carga, prepara y entrega una bebida`, { timeout: 180000 }, async () => {
      const { context, page, errors } = await openGame(target, device);
      try {
        assert.equal(await page.evaluate(() => window.BarraSepia.screen), "start");
        assert.equal(await page.evaluate(() => window.BarraSepia.single), target.startsWith("dist/"));

        // Sin desplazamiento horizontal y con lienzo visible.
        const layout = await page.evaluate(() => {
          const c = document.querySelector("#game canvas");
          const r = c.getBoundingClientRect();
          return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, w: r.width, h: r.height };
        });
        assert.ok(layout.scrollW <= layout.innerW, `desplazamiento horizontal: ${layout.scrollW} > ${layout.innerW}`);
        assert.ok(layout.w > 200 && layout.h > 200, `lienzo demasiado pequeño: ${layout.w}×${layout.h}`);

        await page.click("#btn-start");
        await page.waitForFunction(() => window.BarraSepia.getState()?.orders.length > 0, null, { timeout: 30000 });
        const order = await page.evaluate(() => window.BarraSepia.getState().orders[0]);
        await brew(page, order);
        await tap(page, `ticket:${order.id}`);
        await page.waitForFunction(
          (id) => window.BarraSepia.getLog().some((e) => e.type === "order_served" && e.orderId === id),
          order.id,
          { timeout: 10000 },
        );
        const served = await page.evaluate((id) => window.BarraSepia.getLog().find((e) => e.type === "order_served" && e.orderId === id), order.id);
        assert.equal(served.firstAttempt, true);

        // Pausa con el botón del HUD y fin del turno: aparece el resumen.
        await tap(page, "pause");
        await page.waitForFunction(() => window.BarraSepia.screen === "pause");
        await page.click("#btn-quit");
        await page.waitForFunction(() => window.BarraSepia.screen === "summary", null, { timeout: 10000 });
        assert.match(await page.textContent("#summary-body"), /Servidas: 1/);

        assert.deepEqual(errors, [], `errores de consola:\n${errors.join("\n")}`);
      } finally {
        await context.close();
      }
    });
  }
}

test("práctica guiada: se completa siguiendo las indicaciones (archivo único, teléfono)", { timeout: 180000 }, async () => {
  const { context, page, errors } = await openGame(TARGETS["archivo único"], VIEWPORTS.telefono);
  try {
    await page.click("#btn-practice");
    await page.waitForFunction(() => window.BarraSepia.getState()?.mode === "practica");
    for (let n = 1; n <= 2; n++) {
      await page.waitForFunction((id) => window.BarraSepia.getState().orders.some((o) => o.id === id), n, { timeout: 30000 });
      const order = await page.evaluate(() => window.BarraSepia.getState().orders[0]);
      // La guía señala la tecla de la bebida pedida.
      const step = await page.evaluate(() => window.BarraSepia.scene.practiceStepId);
      assert.equal(step, "drink");
      await brew(page, order);
      await tap(page, `ticket:${order.id}`);
    }
    await page.waitForFunction(() => window.BarraSepia.screen === "practice-done", null, { timeout: 15000 });
    // La práctica no se guarda en el historial.
    await page.click("#btn-practice-start");
    await page.waitForFunction(() => window.BarraSepia.getState()?.mode === "normal");
    assert.deepEqual(errors, [], `errores de consola:\n${errors.join("\n")}`);
  } finally {
    await context.close();
  }
});

test("archivo único: cumple el contrato del visor", () => {
  const html = readFileSync(join(ROOT, "dist/barra-sepia.html"), "utf8");
  assert.ok(html.slice(0, 8192).includes("<title>Barra Sepia</title>"));
  assert.ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html), "sin esqueleto propio");
  assert.ok(html.includes('data-target="viewer"'));
  assert.ok(!html.includes('type="module"'), "sin módulos externos");
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /^https:\/\/cdn\.jsdelivr\.net\/npm\/phaser@\d+\.\d+\.\d+\/dist\/phaser\.min\.js$/);
  const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of styles) assert.match(href, /^https:\/\/fonts\.googleapis\.com\//);
  assert.ok(!/(src|href)="(?!https:)[^"#]/.test(html), "sin rutas relativas");
  assert.ok(Buffer.byteLength(html) < 16 * 1024 * 1024);
});

test("carpeta de Netlify: autocontenida y con PWA", () => {
  const dir = join(ROOT, "netlify");
  for (const f of ["index.html", "sw.js", "_headers", "manifest.webmanifest", "data/recipes.json", "src/main.js", "icons/icon-512.png"]) {
    assert.ok(existsSync(join(dir, f)), `falta ${f}`);
  }
  const index = readFileSync(join(dir, "index.html"), "utf8");
  for (const [, ref] of index.matchAll(/(?:src|href)="(?!https?:)([^"]+)"/g)) {
    assert.ok(existsSync(join(dir, ref)), `index.html referencia ${ref}, que no existe`);
  }
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons) assert.ok(existsSync(join(dir, icon.src)), `falta el icono ${icon.src}`);
  const sw = readFileSync(join(dir, "sw.js"), "utf8");
  assert.ok(!sw.includes("__PRECACHE__") && !sw.includes("__VERSION__"));
  assert.match(sw, /"src\/main\.js"/);
});
