// Pantallas HTML sobre el juego: inicio, pausa, ajustes, resumen, Cuaderno y errores.
// El texto vive en el DOM para que sea accesible y respete el tamaño de letra.

import { DISCLAIMER, escapeHtml, notebookHtml, summaryHtml } from "./notebook.js";

/**
 * @typedef {Object} OverlayCallbacks
 * @property {() => void} onStart
 * @property {() => void} onPractice
 * @property {() => void} onResume
 * @property {() => void} onQuit
 * @property {(patch: Partial<import("../platform/settings.js").Settings>) => void} onSettings
 * @property {() => Promise<void>} onOpenNotebook
 */

const SCREENS = ["loading", "start", "pause", "settings", "summary", "notebook", "practice-done", "error"];

export class Overlay {
  /**
   * @param {HTMLElement} root
   * @param {OverlayCallbacks} callbacks
   */
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.current = "loading";
    this.returnTo = "start";
    this.root.innerHTML = template();
    /** @type {Record<string, HTMLElement>} */
    this.screens = {};
    for (const name of SCREENS) this.screens[name] = /** @type {HTMLElement} */ (root.querySelector(`[data-screen="${name}"]`));
    this.bind();
  }

  $(selector) {
    return /** @type {HTMLElement} */ (this.root.querySelector(selector));
  }

  bind() {
    const on = (selector, event, fn) => this.$(selector).addEventListener(event, fn);
    on("#btn-start", "click", () => this.callbacks.onStart());
    on("#btn-practice", "click", () => this.callbacks.onPractice());
    on("#btn-practice-again", "click", () => this.callbacks.onPractice());
    on("#btn-practice-start", "click", () => this.callbacks.onStart());
    on("#btn-again", "click", () => this.callbacks.onStart());
    on("#btn-resume", "click", () => this.callbacks.onResume());
    on("#btn-quit", "click", () => this.callbacks.onQuit());
    on("#btn-home", "click", () => this.show("start"));
    on("#btn-error-reload", "click", () => location.reload());
    for (const id of ["#btn-settings-start", "#btn-settings-pause"]) {
      on(id, "click", () => {
        this.returnTo = this.current;
        this.show("settings");
      });
    }
    for (const id of ["#btn-notebook-start", "#btn-notebook-summary"]) {
      on(id, "click", () => {
        this.returnTo = this.current;
        this.callbacks.onOpenNotebook();
      });
    }
    on("#btn-settings-back", "click", () => this.show(this.returnTo));
    on("#btn-notebook-back", "click", () => this.show(this.returnTo));

    const toggle = (id, key) => on(id, "change", (e) => this.callbacks.onSettings({ [key]: /** @type {HTMLInputElement} */ (e.target).checked }));
    toggle("#set-muted", "muted");
    toggle("#set-musicon", "musicOn");
    toggle("#set-motion", "reducedMotion");
    toggle("#set-colorblind", "colorBlind");
    toggle("#set-largetext", "largeText");
    toggle("#set-calm", "calm");
    toggle("#start-calm", "calm");
    const range = (id, key) => on(id, "input", (e) => this.callbacks.onSettings({ [key]: Number(/** @type {HTMLInputElement} */ (e.target).value) / 100 }));
    range("#set-music", "musicVolume");
    range("#set-sfx", "sfxVolume");
    const minutes = (e) => this.callbacks.onSettings({ sessionMinutes: Number(/** @type {HTMLSelectElement} */ (e.target).value) });
    on("#set-minutes", "change", minutes);
    on("#start-minutes", "change", minutes);
  }

  /** Refleja los ajustes en los controles. */
  syncSettings(settings) {
    const set = (id, prop, value) => {
      const el = /** @type {HTMLInputElement} */ (this.$(id));
      if (el && el[prop] !== value) el[prop] = value;
    };
    set("#set-muted", "checked", settings.muted);
    set("#set-musicon", "checked", settings.musicOn);
    set("#set-motion", "checked", settings.reducedMotion);
    set("#set-colorblind", "checked", settings.colorBlind);
    set("#set-largetext", "checked", settings.largeText);
    set("#set-calm", "checked", settings.calm);
    set("#start-calm", "checked", settings.calm);
    set("#set-music", "value", String(Math.round(settings.musicVolume * 100)));
    set("#set-sfx", "value", String(Math.round(settings.sfxVolume * 100)));
    set("#set-minutes", "value", String(settings.sessionMinutes));
    set("#start-minutes", "value", String(settings.sessionMinutes));
    document.documentElement.classList.toggle("large-text", settings.largeText);
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
  }

  /** @param {string} name */
  show(name) {
    this.current = name;
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    this.root.hidden = false;
    this.root.classList.toggle("is-loading", name === "loading");
    const focusable = /** @type {HTMLElement|null} */ (this.screens[name].querySelector("[data-autofocus]"));
    if (focusable) focusable.focus({ preventScroll: true });
    this.root.scrollTop = 0;
  }

  hide() {
    this.current = "none";
    this.root.hidden = true;
  }

  get visible() {
    return !this.root.hidden;
  }

  /**
   * La primera vez, la práctica guiada es la acción principal.
   * @param {boolean} practiced
   */
  setPracticed(practiced) {
    const practice = this.$("#btn-practice");
    const start = this.$("#btn-start");
    this.$("#first-time").hidden = practiced;
    practice.classList.toggle("primary", !practiced);
    start.classList.toggle("primary", practiced);
    // El botón principal va primero y recibe el foco.
    const actions = start.parentElement;
    if (!practiced) {
      actions.insertBefore(practice, start);
      practice.setAttribute("data-autofocus", "");
      start.removeAttribute("data-autofocus");
    } else {
      actions.insertBefore(start, practice);
      start.setAttribute("data-autofocus", "");
      practice.removeAttribute("data-autofocus");
    }
  }

  showError(message) {
    this.$("#error-message").textContent = message;
    this.show("error");
  }

  /**
   * @param {import("../core/stats.js").SessionSummary} summary
   * @param {Array<import("../core/stats.js").SessionSummary>} history
   * @param {{ sessionsToday: number, recommended: number }} day
   */
  showSummary(summary, history, day) {
    this.$("#summary-body").innerHTML = summaryHtml(summary, history, day);
    this.show("summary");
  }

  /**
   * @param {Array<import("../telemetry/store.js").SessionRecord>} records
   * @param {{ persistent: boolean }} storage
   */
  showNotebook(records, storage) {
    this.$("#notebook-body").innerHTML = notebookHtml(records, storage);
    this.show("notebook");
  }
}

function minutesOptions() {
  return [5, 6, 7, 8].map((m) => `<option value="${m}">${m} minutos</option>`).join("");
}

function template() {
  return `
  <section class="card" data-screen="loading" aria-live="polite">
    <p class="eyebrow">Barra Sepia</p>
    <p class="loading">Encendiendo la máquina…</p>
  </section>

  <section class="card" data-screen="start" hidden aria-labelledby="start-title">
    <p class="eyebrow">Cafetería de barrio · desde 1952</p>
    <h1 id="start-title">Barra Sepia</h1>
    <p class="lede">Atiende la barra con una máquina de café con carácter. Lee las comandas, recuérdalas y sirve cada bebida tal como se pidió.</p>
    <ol class="steps">
      <li><span><strong>Lee la comanda</strong> del riel. En niveles altos se voltea: tendrás que recordarla.</span></li>
      <li><span><strong>Elige la bebida y los extras</strong> en la consola.</span></li>
      <li><span><strong>Tira de PREPARAR</strong> y mantén <strong>PRESIÓN</strong> para dejar la aguja en la zona.</span></li>
      <li><span><strong>Toca la comanda</strong> para entregar la bebida.</span></li>
    </ol>
    <p class="rule">Regla de la casa: manda el <strong>texto</strong> de la comanda, no el dibujo.</p>
    <p class="first-time" id="first-time">¿Primera vez? Empieza con la <strong>práctica guiada</strong>: dos comandas sin reloj, con indicaciones paso a paso.</p>
    <div class="options">
      <label class="check"><input type="checkbox" id="start-calm"> Modo Calma <span class="hint">sin reloj de paciencia y con menos comandas</span></label>
      <label class="select">Duración del turno
        <select id="start-minutes">${minutesOptions()}</select>
      </label>
    </div>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-start" data-autofocus>Abrir la cafetería</button>
      <button type="button" class="btn" id="btn-practice">Práctica guiada</button>
      <button type="button" class="btn" id="btn-notebook-start">Cuaderno del barista</button>
      <button type="button" class="btn" id="btn-settings-start">Ajustes</button>
    </div>
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
  </section>

  <section class="card" data-screen="pause" hidden aria-labelledby="pause-title">
    <h2 id="pause-title">Pausa</h2>
    <p class="lede">La máquina espera. El reloj del turno está detenido.</p>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-resume" data-autofocus>Continuar</button>
      <button type="button" class="btn" id="btn-settings-pause">Ajustes</button>
      <button type="button" class="btn danger" id="btn-quit">Terminar el turno</button>
    </div>
  </section>

  <section class="card" data-screen="settings" hidden aria-labelledby="settings-title">
    <h2 id="settings-title">Ajustes</h2>
    <div class="settings">
      <label class="check"><input type="checkbox" id="set-musicon"> Música de fondo</label>
      <label class="range">Volumen de la música <input type="range" id="set-music" min="0" max="100" step="5"></label>
      <label class="range">Efectos <input type="range" id="set-sfx" min="0" max="100" step="5"></label>
      <label class="check"><input type="checkbox" id="set-muted"> Silenciar todo</label>
      <label class="check"><input type="checkbox" id="set-motion"> Movimiento reducido</label>
      <label class="check"><input type="checkbox" id="set-colorblind"> Modo daltónico <span class="hint">marcas y patrones además del color</span></label>
      <label class="check"><input type="checkbox" id="set-largetext"> Texto grande</label>
      <label class="check"><input type="checkbox" id="set-calm"> Modo Calma</label>
      <label class="select">Duración del turno <select id="set-minutes">${minutesOptions()}</select></label>
    </div>
    <p class="note">Teclado: 1 a 6 eligen bebida · Q W E R los extras · Enter prepara · Espacio mantiene la presión · A S D entregan a la comanda 1, 2 o 3 · L toma un respiro · M enciende o apaga la música · Esc pausa.</p>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-settings-back" data-autofocus>Volver</button>
    </div>
  </section>

  <section class="card wide" data-screen="summary" hidden aria-labelledby="summary-title">
    <p class="eyebrow">Cierre de turno</p>
    <h2 id="summary-title">Así fue tu turno</h2>
    <div id="summary-body"></div>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-again" data-autofocus>Otro turno</button>
      <button type="button" class="btn" id="btn-notebook-summary">Cuaderno del barista</button>
      <button type="button" class="btn" id="btn-home">Inicio</button>
    </div>
  </section>

  <section class="card wide" data-screen="notebook" hidden aria-labelledby="notebook-title">
    <p class="eyebrow">Tendencias por turno</p>
    <h2 id="notebook-title">Cuaderno del barista</h2>
    <div id="notebook-body"></div>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-notebook-back" data-autofocus>Volver</button>
    </div>
  </section>

  <section class="card" data-screen="practice-done" hidden aria-labelledby="practice-title">
    <p class="eyebrow">Práctica guiada</p>
    <h2 id="practice-title">¡Lista la práctica!</h2>
    <p class="lede">Ya sabes atender la barra. Recuerda lo esencial:</p>
    <ul class="recap">
      <li><strong>Lee la comanda</strong> y elige esa bebida y sus extras en la consola.</li>
      <li><strong>Tira de PREPARAR.</strong></li>
      <li>En la extracción, <strong>mantén PRESIÓN para subir</strong> la aguja y <strong>suelta para bajarla</strong>. Turquesa: estás en la zona. Rojo: corrige.</li>
      <li><strong>Toca la comanda</strong> para entregar la bebida.</li>
    </ul>
    <p class="note">En el turno de verdad las comandas tienen reloj de paciencia y, en niveles altos, se voltean: tendrás que recordarlas.</p>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-practice-start" data-autofocus>Abrir la cafetería</button>
      <button type="button" class="btn" id="btn-practice-again">Repetir la práctica</button>
    </div>
  </section>

  <section class="card" data-screen="error" hidden aria-labelledby="error-title">
    <h2 id="error-title">La máquina no arrancó</h2>
    <p class="lede" id="error-message"></p>
    <div class="actions">
      <button type="button" class="btn primary" id="btn-error-reload" data-autofocus>Recargar</button>
    </div>
  </section>`;
}
