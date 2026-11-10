// Arranque de Barra Sepia. Funciona igual como módulo (Netlify) y como script inline (archivo único).

import { loadCatalog } from "./core/catalog.js";
import { clampLevel } from "./core/difficulty.js";
import { createSettingsStore } from "./platform/settings.js";
import { ensurePhaser, PHASER_VERSION } from "./platform/phaser-loader.js";
import { registerServiceWorker } from "./platform/pwa.js";
import { logicalSize } from "./platform/viewport.js";
import { openStore, telemetryEvents } from "./telemetry/store.js";
import { AudioEngine } from "./audio/audio.js";
import { Overlay } from "./ui/overlay.js";
import { PRACTICE_ORDERS, PRACTICE_GAUGE_SCALE } from "./core/tutorial.js";
import { defineBarScene } from "./scenes/BarScene.js";

export const APP_VERSION = "0.1.0";
const RECOMMENDED_SESSIONS = 3;

/** Información que inyecta el build del archivo único (o nada en Netlify). */
function buildInfo() {
  const b = globalThis.BARRA_SEPIA_BUILD;
  return { single: !!(b && b.single), data: (b && b.data) || null };
}

async function loadRecipes(build) {
  if (build.data) return build.data;
  const response = await fetch("data/recipes.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo leer el menú de bebidas (HTTP ${response.status}).`);
  return response.json();
}

async function waitForFonts(timeoutMs) {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['36px "Rye"', '24px "Special Elite"', '20px "Libre Baskerville"', 'bold 20px "Libre Baskerville"', 'italic 20px "Libre Baskerville"'];
  const loads = faces.map((f) => document.fonts.load(f).catch(() => null));
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

function newSeed() {
  try {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  } catch {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function createAnnouncer(element) {
  let timer = null;
  return (text) => {
    if (!element) return;
    clearTimeout(timer);
    element.textContent = "";
    timer = setTimeout(() => {
      element.textContent = text;
    }, 30);
  };
}

async function boot() {
  const build = buildInfo();
  const gameEl = /** @type {HTMLElement} */ (document.getElementById("game"));
  const overlayEl = /** @type {HTMLElement} */ (document.getElementById("overlay"));
  const announce = createAnnouncer(document.getElementById("announcer"));
  const settingsStore = createSettingsStore();
  const audio = new AudioEngine();
  audio.applySettings(settingsStore.settings);

  /** @type {any} */
  let scene = null;
  /** @type {any} */
  let game = null;
  /** @type {Awaited<ReturnType<typeof openStore>>|null} */
  let store = null;
  let startedAt = null;

  const api = {
    version: APP_VERSION,
    phaserVersion: PHASER_VERSION,
    single: build.single,
    ready: false,
    getState: () => (scene && scene.session ? scene.session.getState() : null),
    getLog: () => (scene && scene.session ? scene.session.log : []),
    get screen() {
      return overlay.current;
    },
    get fps() {
      return game ? Math.round(game.loop.actualFps) : 0;
    },
    get scene() {
      return scene;
    },
    /** Coordenadas de pantalla (CSS px) de un control: útil para pruebas. */
    pointFor(id) {
      if (!scene || !game) return null;
      const world = scene.worldPointFor(id);
      if (!world) return null;
      const rect = game.canvas.getBoundingClientRect();
      return {
        x: rect.left + (world.x * rect.width) / game.scale.width,
        y: rect.top + (world.y * rect.height) / game.scale.height,
      };
    },
  };
  globalThis.BarraSepia = api;

  const overlay = new Overlay(overlayEl, {
    onStart: () => startSession(),
    onPractice: () => startPractice(),
    onResume: () => {
      overlay.hide();
      if (scene) scene.resumeSession();
    },
    onQuit: () => {
      overlay.hide();
      if (scene) scene.quitSession();
    },
    onSettings: (patch) => applySettings(patch),
    onOpenNotebook: async () => {
      const records = store ? await store.listSessions(50) : [];
      overlay.showNotebook(records, { persistent: !!(store && store.persistent) });
    },
  });
  overlay.syncSettings(settingsStore.settings);
  overlay.setPracticed(settingsStore.progress.practiced);
  overlay.show("loading");

  function applySettings(patch) {
    const settings = settingsStore.updateSettings(patch);
    audio.applySettings(settings);
    overlay.syncSettings(settings);
    if (scene) scene.applySettings(settings);
  }

  function startSession() {
    if (!scene) return;
    audio.unlock();
    audio.applySettings(settingsStore.settings);
    const s = settingsStore.settings;
    const seed = newSeed();
    startedAt = new Date();
    overlay.hide();
    scene.startSession({
      seed,
      mode: s.calm ? "calma" : "normal",
      durationMs: s.sessionMinutes * 60 * 1000,
      // Se arranca un nivel por debajo del último: calentamiento.
      startLevel: clampLevel(settingsStore.progress.lastLevel - 1),
      sessionId: `s-${startedAt.getTime().toString(36)}-${seed.toString(36)}`,
    });
    if (game && game.canvas) game.canvas.focus({ preventScroll: true });
  }

  /** Práctica guiada: dos comandas con guion, sin reloj y sin guardar en el historial. */
  function startPractice() {
    if (!scene) return;
    audio.unlock();
    audio.applySettings(settingsStore.settings);
    const seed = newSeed();
    startedAt = new Date();
    overlay.hide();
    scene.startSession({
      seed,
      mode: "practica",
      durationMs: 30 * 60 * 1000,
      startLevel: 1,
      sessionId: `p-${startedAt.getTime().toString(36)}`,
      scriptedOrders: PRACTICE_ORDERS,
      gaugeStepScale: PRACTICE_GAUGE_SCALE,
    });
    if (game && game.canvas) game.canvas.focus({ preventScroll: true });
  }

  async function onSessionEnd(session) {
    const log = session.log;
    const state = session.getState();
    if (state.mode === "practica") {
      if (state.endReason === "done") {
        settingsStore.updateProgress({ practiced: true });
        overlay.setPracticed(true);
        overlay.show("practice-done");
        announce("Práctica completada.");
      } else {
        overlay.show("start");
      }
      return;
    }
    const end = log[log.length - 1];
    const summary = end.summary;
    const resolved = summary.served + summary.missed;
    if (resolved > 0 && store) {
      await store.saveSession({
        id: state.sessionId,
        startedAt: (startedAt || new Date()).toISOString(),
        seed: state.seed,
        levelId: state.levelId,
        mode: state.mode,
        durationMs: state.durationMs,
        endLevel: summary.endLevel,
        summary,
        events: telemetryEvents(log),
      });
      settingsStore.updateProgress({ lastLevel: summary.endLevel });
    }
    const records = store ? await store.listSessions(50) : [];
    const history = records.map((r) => r.summary);
    if (resolved === 0) history.push(summary);
    const today = dayKey(new Date());
    const sessionsToday = records.filter((r) => dayKey(new Date(r.startedAt)) === today).length;
    overlay.showSummary(summary, history, { sessionsToday: Math.max(1, sessionsToday), recommended: RECOMMENDED_SESSIONS });
    announce(`Turno terminado. Serviste ${summary.served} comandas.`);
  }

  try {
    const [Phaser, raw, opened] = await Promise.all([ensurePhaser(), loadRecipes(build), openStore()]);
    store = opened;
    const catalog = loadCatalog(raw);
    await waitForFonts(1500);
    const BarScene = defineBarScene(Phaser);
    const size = logicalSize(gameEl.clientWidth, gameEl.clientHeight);
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameEl,
      backgroundColor: "#2a1d15",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: size.width,
        height: size.height,
      },
      input: { activePointers: 3 },
      audio: { noAudio: true },
      banner: false,
      disableContextMenu: true,
      render: { antialias: true },
    });
    game.scene.add("bar", BarScene, true, {
      app: {
        catalog,
        getSettings: () => settingsStore.settings,
        audio,
        announce,
        onSessionEnd: (session) => {
          onSessionEnd(session).catch((err) => overlay.showError(String(err && err.message ? err.message : err)));
        },
        onPauseRequest: () => overlay.show("pause"),
        onToggleMusic: () => {
          const on = !settingsStore.settings.musicOn;
          applySettings({ musicOn: on });
          announce(on ? "Música encendida." : "Música apagada.");
        },
        onReady: (readyScene) => {
          scene = readyScene;
          game.canvas.setAttribute("tabindex", "0");
          game.canvas.setAttribute("aria-label", "Barra Sepia: máquina de café, riel de comandas y consola");
          overlay.show("start");
          api.ready = true;
        },
      },
    });

    // Tamaño lógico adaptable: vertical u horizontal según la pantalla.
    let lastKey = `${size.width}x${size.height}`;
    const onResize = () => {
      const next = logicalSize(gameEl.clientWidth, gameEl.clientHeight);
      const key = `${next.width}x${next.height}`;
      if (key !== lastKey) {
        lastKey = key;
        game.scale.setGameSize(next.width, next.height);
      }
      game.scale.refresh();
    };
    if (globalThis.ResizeObserver) new ResizeObserver(onResize).observe(gameEl);
    else window.addEventListener("resize", onResize);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && scene && scene.running && !scene.paused) {
        scene.pauseSession();
        overlay.show("pause");
      }
    });

    registerServiceWorker(build);
  } catch (err) {
    overlay.showError(err && err.message ? err.message : String(err));
    console.error(err);
  }
}

boot();
