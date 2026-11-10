import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeState, defaultSettings, createSettingsStore } from "../../src/platform/settings.js";
import { openStore, telemetryEvents } from "../../src/telemetry/store.js";
import { logicalSize } from "../../src/platform/viewport.js";
import { PHASER_URLS, PHASER_VERSION } from "../../src/platform/phaser-loader.js";
import { describeDiff } from "../../src/scenes/BarScene.js";
import { realCatalog } from "./helpers.js";

test("normalizeState corrige valores inválidos y conserva los válidos", () => {
  const state = normalizeState({
    settings: { musicVolume: 3, sfxVolume: -1, muted: "sí", sessionMinutes: 20, largeText: true, calm: true },
    progress: { lastLevel: 0 },
  });
  assert.equal(state.settings.musicVolume, 1);
  assert.equal(state.settings.sfxVolume, 0);
  assert.equal(state.settings.muted, defaultSettings().muted);
  assert.equal(state.settings.sessionMinutes, 8);
  assert.equal(state.settings.largeText, true);
  assert.equal(state.settings.calm, true);
  assert.equal(state.progress.lastLevel, 1);
  assert.equal(state.settings.musicOn, true, "la música está encendida por defecto");
  assert.equal(normalizeState({ settings: { musicOn: false } }).settings.musicOn, false);
  assert.deepEqual(normalizeState(null).settings, defaultSettings());
});

test("sin localStorage los ajustes viven en memoria y el juego sigue", () => {
  const store = createSettingsStore();
  assert.equal(store.persistent, false);
  store.updateSettings({ musicVolume: 0.2, sessionMinutes: 7 });
  store.updateProgress({ lastLevel: 4 });
  assert.equal(store.settings.musicVolume, 0.2);
  assert.equal(store.settings.sessionMinutes, 7);
  assert.equal(store.progress.lastLevel, 4);
});

test("sin IndexedDB el historial usa memoria, ordenado por fecha", async () => {
  const store = await openStore();
  assert.equal(store.persistent, false);
  await store.saveSession({ id: "b", startedAt: "2026-11-10T10:00:00.000Z", summary: {} });
  await store.saveSession({ id: "a", startedAt: "2026-11-09T10:00:00.000Z", summary: {} });
  await store.saveSession({ id: "b", startedAt: "2026-11-10T10:00:00.000Z", summary: { served: 3 } });
  const list = await store.listSessions();
  assert.deepEqual(list.map((r) => r.id), ["a", "b"]);
  assert.equal(list[1].summary.served, 3);
});

test("telemetryEvents descarta los eventos que solo animan la vista", () => {
  const kept = telemetryEvents([
    { type: "session_start" },
    { type: "step_start" },
    { type: "order_served" },
    { type: "brew_done" },
    { type: "session_end" },
  ]);
  assert.deepEqual(kept.map((e) => e.type), ["session_start", "order_served", "session_end"]);
});

test("logicalSize: vertical y horizontal con límites", () => {
  // Teléfonos: lado corto 720, lado largo según la proporción.
  assert.deepEqual(logicalSize(390, 844), { width: 720, height: 1558 });
  assert.deepEqual(logicalSize(844, 390), { width: 1558, height: 720 });
  assert.deepEqual(logicalSize(1366, 768), { width: 1281, height: 720 });
  // Tabletas: lado largo fijo y lado corto más ancho.
  assert.deepEqual(logicalSize(820, 1180), { width: 889, height: 1280 });
  assert.deepEqual(logicalSize(1180, 820), { width: 1200, height: 834 });
  // Límites.
  assert.deepEqual(logicalSize(3000, 600), { width: 1600, height: 720 });
  assert.deepEqual(logicalSize(300, 2000), { width: 720, height: 1560 });
  assert.deepEqual(logicalSize(1000, 1010), { width: 960, height: 1280 });
  assert.deepEqual(logicalSize(0, 0), { width: 1280, height: 720 });
});

test("Phaser fijado a una versión exacta en los tres CDN permitidos", () => {
  assert.match(PHASER_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(PHASER_URLS.length, 3);
  for (const url of PHASER_URLS) {
    assert.ok(url.includes(PHASER_VERSION), url);
    assert.match(url, /^https:\/\/(cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/|cdnjs\.cloudflare\.com\/)/);
  }
});

test("describeDiff explica qué ajustar", () => {
  const catalog = realCatalog();
  const lines = describeDiff(catalog, {
    ok: false,
    drinkOk: false,
    expectedDrinkId: "cortado",
    producedDrinkId: "latte",
    missing: ["azucar"],
    extra: ["llevar"],
  });
  assert.deepEqual(lines, [
    "Pedían Cortado, no Latte.",
    "Faltó: Azúcar.",
    "Sobró: Para llevar.",
    "Ajusta la consola y prepárala de nuevo.",
  ]);
});
