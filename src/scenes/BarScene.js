// Escena principal. No decide reglas: envía acciones a la sesión (core/session.js),
// dibuja su estado y anima según los eventos que la sesión emite.

import { createSession } from "../core/session.js";
import { MachineView, MACHINE_W, MACHINE_H } from "../ui/machine.js";
import { RailView } from "../ui/rail.js";
import { ControlsView, DRINK_KEYS } from "../ui/controls.js";
import { HudView } from "../ui/hud.js";
import { BackdropView, FilmView, FeedbackView } from "../ui/effects.js";
import { CoachView } from "../ui/coach.js";
import { CSS } from "../ui/palette.js";
import { gaugeZone } from "../core/gauge.js";
import { practiceStep } from "../core/tutorial.js";

/**
 * @typedef {Object} SceneApp
 * @property {import("../core/catalog.js").Catalog} catalog
 * @property {() => import("../platform/settings.js").Settings} getSettings
 * @property {import("../audio/audio.js").AudioEngine} audio
 * @property {(text: string) => void} announce
 * @property {(session: ReturnType<typeof createSession>) => void} onSessionEnd
 * @property {() => void} onPauseRequest
 * @property {(scene: any) => void} onReady
 */

const HUD_H = 64;
const DELIVERY_KEYS = ["A", "S", "D"];

/**
 * Define la clase de la escena cuando Phaser ya está cargado.
 * @param {any} Phaser
 */
export function defineBarScene(Phaser) {
  return class BarScene extends Phaser.Scene {
    constructor() {
      super({ key: "bar" });
      /** @type {ReturnType<typeof createSession>|null} */
      this.session = null;
      this.paused = false;
      this.endHandled = false;
    }

    /** @param {{ app: SceneApp }} data */
    init(data) {
      this.app = data.app;
    }

    create() {
      const { catalog } = this.app;
      const s = this.app.getSettings();
      const coarse = !!globalThis.matchMedia?.("(pointer: coarse)").matches;
      this.viewOptions = {
        reducedMotion: s.reducedMotion,
        colorBlind: s.colorBlind,
        largeText: s.largeText,
        keyHints: !coarse,
      };

      this.backdrop = new BackdropView(this);
      this.machine = new MachineView(this, catalog, this.viewOptions);
      this.rail = new RailView(this, catalog, { onTicketTap: (id) => this.onTicketTap(id) }, this.viewOptions);
      this.controls = new ControlsView(
        this,
        catalog,
        {
          onDrink: (id) => this.onDrink(id),
          onModifier: (id) => this.onModifier(id),
          onLever: () => this.onLever(),
          onPressure: (held) => this.onPressure(held),
          onClean: () => this.onClean(),
        },
        this.viewOptions,
      );
      this.hud = new HudView(this, { onPause: () => this.requestPause() }, this.viewOptions);
      this.feedback = new FeedbackView(this, this.viewOptions);
      this.coach = new CoachView(this, this.viewOptions);
      this.film = new FilmView(this, this.viewOptions);
      this.practice = false;
      this.practiceStepId = "";
      this.practiceDoneAt = 0;

      this.input.on("pointerup", () => this.onPressure(false));
      this.input.on("gameout", () => this.onPressure(false));
      this.input.keyboard?.on("keydown", (event) => this.onKeyDown(event));
      this.input.keyboard?.on("keyup", (event) => {
        if (event.code === "Space") this.onPressure(false);
      });

      const onResize = () => this.relayout();
      this.scale.on("resize", onResize);
      this.events.once("shutdown", () => this.scale.off("resize", onResize));
      this.relayout();
      this.app.onReady(this);
    }

    // --- Distribución -------------------------------------------------------

    relayout() {
      const W = this.scale.gameSize.width;
      const H = this.scale.gameSize.height;
      const portrait = H > W;
      this.layoutMode = portrait ? "portrait" : "landscape";
      this.hud.layout(W, HUD_H);
      let rail;
      let machine;
      let controls;
      if (portrait) {
        rail = { x: 8, y: HUD_H + 4, w: W - 16, h: 288 };
        // La consola no ocupa más del 58 % del alto disponible: la máquina es la protagonista.
        const available = H - (rail.y + rail.h);
        const controlsH = Math.min(600, Math.round((W - 16) * (560 / 700)), Math.round(available * 0.58));
        controls = { x: 8, y: H - controlsH - 10, w: W - 16, h: controlsH };
        machine = { x: 0, y: rail.y + rail.h, w: W, h: controls.y - (rail.y + rail.h) - 4 };
      } else {
        // Horizontal: máquina a toda altura a la izquierda; riel y consola a la derecha.
        const colX = Math.round(Math.max(W * 0.42, W - 760));
        rail = { x: colX, y: HUD_H + 2, w: W - colX - 8, h: 278 };
        const bottomY = rail.y + rail.h + 2;
        controls = { x: colX, y: bottomY, w: W - colX - 10, h: H - bottomY - 10 };
        machine = { x: 0, y: HUD_H + 40, w: colX - 4, h: H - HUD_H - 40 };
      }
      this.backdrop.layout(W, H, H - Math.round(machine.h * 0.16));
      this.rail.layout(rail);
      this.controls.layout(controls, this.layoutMode);
      const ms = Math.min(machine.w / MACHINE_W, machine.h / MACHINE_H, 1.25);
      this.machine.root.setScale(ms);
      this.machine.root.setPosition(machine.x + (machine.w - MACHINE_W * ms) / 2, machine.y + (machine.h - MACHINE_H * ms));
      this.feedback.setAnchor(machine.x + machine.w / 2, machine.y + 8, Math.min(portrait ? 640 : 480, machine.w - 24), portrait ? 1.35 : 1);
      // La guía de la práctica ocupa los dos tercios derechos del riel (en la práctica
      // solo hay una comanda, en el primer hueco), así no tapa la máquina ni el manómetro.
      this.coach.setAnchor(rail.x + (rail.w * 2) / 3, rail.y + 30, Math.min(560, (rail.w * 2) / 3 - 20), portrait ? 1.35 : 1);
      this.film.layout(W, H);
      this.regions = { rail, machine, controls };
    }

    /** @param {Partial<import("../platform/settings.js").Settings>} settings */
    applySettings(settings) {
      const patch = {};
      for (const key of ["reducedMotion", "colorBlind", "largeText"]) {
        if (key in settings) patch[key] = settings[key];
      }
      Object.assign(this.viewOptions, patch);
      this.machine.setOptions(patch);
      this.rail.setOptions(patch);
      this.controls.setOptions(patch);
      this.hud.setOptions(patch);
      this.feedback.setOptions(patch);
      this.coach.setOptions(patch);
      this.film.setOptions(patch);
      this.relayout();
    }

    // --- Ciclo de sesión ----------------------------------------------------

    /**
     * @param {{ seed: number, mode: "normal"|"calma"|"practica", durationMs: number, startLevel: number, sessionId: string,
     *           scriptedOrders?: Array<{ drinkId: string, modifiers?: string[] }> }} options
     */
    startSession(options) {
      this.rail.clear();
      this.feedback.hide();
      this.coach.hide();
      this.practice = options.mode === "practica";
      this.practiceStepId = "";
      this.practiceDoneAt = 0;
      this.session = createSession({ catalog: this.app.catalog, levelId: "barrio", ...options });
      this.paused = false;
      this.endHandled = false;
      this.app.audio.startMusic();
      this.handleEvents(this.session.drainEvents());
    }

    pauseSession() {
      if (!this.session || this.paused) return;
      this.paused = true;
      this.session.setPressure(false);
      this.app.audio.suspend();
    }

    resumeSession() {
      if (!this.session) return;
      this.paused = false;
      this.app.audio.resume();
    }

    quitSession() {
      if (!this.session) return;
      this.paused = false;
      this.app.audio.resume();
      this.session.end("quit");
    }

    requestPause() {
      if (!this.session || this.session.getState().ended) return;
      this.pauseSession();
      this.app.onPauseRequest();
    }

    get running() {
      return !!this.session && !this.session.getState().ended;
    }

    update(_time, delta) {
      // Tiempo real: el delta de Phaser se suaviza y, con pocos cuadros por segundo,
      // haría que el turno durara más de lo debido.
      const raw = Math.min(250, this.game.loop.rawDelta || delta);
      const dt = Math.min(100, raw);
      const session = this.session;
      if (session && !this.paused && !this.endHandled) {
        session.tick(raw);
        this.handleEvents(session.drainEvents());
      }
      const state = session ? session.getState() : null;
      const live = state && !state.ended;

      this.machine.update(live ? state.machine : null, this.paused ? 0 : dt);
      this.rail.sync(live ? state.orders : [], { deliverable: !!live && state.machine.phase === "ready" });
      this.controls.render(this.controlsView(live ? state : null), dt);
      this.hud.update(live ? state : null, dt);
      this.feedback.update(dt);
      this.updatePractice(live ? state : null, dt);
      this.film.update();
      if (live) {
        const gaugeActive = state.machine.phase === "brewing" && !!state.machine.steps[state.machine.stepIndex]?.gauge;
        this.app.audio.setPressure(state.orders.length / 3 + (gaugeActive ? 0.25 : 0));
      }

      if (state && state.ended && !this.endHandled) {
        this.endHandled = true;
        this.app.audio.stopMusic();
        this.app.audio.play("ding");
        this.feedback.hide();
        this.app.onSessionEnd(session);
      }
    }

    controlsView(state) {
      if (!state) {
        return {
          phase: "idle",
          selectedDrink: null,
          modifiers: [],
          canPull: false,
          gaugeActive: false,
          gaugeZone: null,
          pressureHeld: false,
          canClean: false,
          cleaningFraction: 0,
          status: "Abre la cafetería para empezar el turno.",
        };
      }
      const m = state.machine;
      const step = m.stepIndex >= 0 ? m.steps[m.stepIndex] : null;
      const gaugeActive = m.phase === "brewing" && !!step?.gauge;
      const cleaning = state.cleaningMs > 0;
      let status;
      if (cleaning) status = "Limpiando la máquina… el riel espera.";
      else if (m.phase === "ready") status = "¡Lista! Toca la comanda que le corresponde.";
      else if (gaugeActive) {
        const zone = gaugeZone(m.gauge);
        if (zone === "in") status = "¡En zona! Mantén el ritmo con toques cortos.";
        else if (zone === "above") status = "Suelta PRESIÓN: la aguja debe bajar a la zona.";
        else status = "Pulsa PRESIÓN: la aguja debe subir a la zona.";
      }
      else if (m.phase === "brewing") status = `Preparando: ${step ? step.label.toLowerCase() : "…"}`;
      else if (state.orders.length === 0) status = "Esperando comandas…";
      else if (!m.selectedDrink) status = "Elige la bebida de una comanda.";
      else status = "Ajusta los extras y tira de PREPARAR.";
      return {
        phase: m.phase,
        selectedDrink: m.selectedDrink,
        modifiers: m.modifiers,
        canPull: m.phase === "idle" && !!m.selectedDrink && !cleaning,
        gaugeActive,
        gaugeZone: gaugeActive ? gaugeZone(m.gauge) : null,
        pressureHeld: m.pressureHeld,
        canClean: m.phase === "idle" && !cleaning,
        cleaningFraction: cleaning ? 1 - state.cleaningMs / 3000 : 0,
        status,
      };
    }

    // --- Eventos de sesión → vista ------------------------------------------

    handleEvents(events) {
      const { catalog, audio, announce } = this.app;
      for (const e of events) {
        switch (e.type) {
          case "order_arrived": {
            audio.play("click");
            const mods = e.modifiers.map((m) => catalog.modifiers[m].label.toLowerCase());
            announce(`Nueva comanda ${e.orderId}: ${catalog.drinks[e.drinkId].label}${mods.length ? `, ${mods.join(", ")}` : ", sin extras"}.`);
            break;
          }
          case "order_hidden":
            audio.play("flip");
            announce(`La comanda ${e.orderId} se volteó.`);
            break;
          case "step_start": {
            const visual = catalog.steps[e.stepId]?.visual;
            if (visual === "grind") audio.play("grind");
            else if (visual === "pour" || visual === "water" || visual === "syrup") audio.play("pour");
            else if (visual === "steam") audio.play("steam");
            if (catalog.steps[e.stepId]?.gauge) announce("Mantén la presión: la aguja debe quedar en la zona.");
            break;
          }
          case "gauge_result": {
            const p = this.machine.root;
            const x = p.x + 300 * p.scaleX;
            const y = p.y + 60 * p.scaleY;
            if (e.ok) this.feedback.float(e.quality >= 0.85 ? "¡Extracción perfecta!" : "Buena extracción", x, y, CSS.cream, 26);
            else this.feedback.float("Extracción irregular", x, y, "#f2b19f", 26);
            break;
          }
          case "brew_done":
            audio.play("toggle");
            announce("Bebida lista. Elige la comanda para entregarla.");
            break;
          case "order_served": {
            this.rail.release(e.orderId, "served");
            this.machine.celebrate();
            audio.play("ding");
            const c = this.rail.ticketCenter(e.orderId);
            if (c) this.feedback.float(`+${e.tip}`, c.x, c.y, CSS.mustard, 40);
            if (!e.gaugeOk) {
              this.feedback.show({ title: "Servida, pero algo aguada", lines: ["Vigila el manómetro: mantén la aguja en la zona durante la extracción."], tone: "info" });
            } else if (!e.firstAttempt) {
              this.feedback.show({ title: "Corregida y servida", lines: ["Bien visto. A la próxima, a la primera."], tone: "good", durationMs: 2500 });
            }
            announce(`Comanda ${e.orderId} servida.${e.gaugeOk ? "" : " Vigila el manómetro."}`);
            break;
          }
          case "order_mismatch": {
            this.rail.shake(e.orderId);
            this.machine.cough();
            audio.play("cough");
            const lines = describeDiff(catalog, e.diff);
            this.feedback.show({ title: `¡Cof, cof! No es la comanda ${e.orderId}`, lines, tone: "bad", durationMs: 5200 });
            announce(`La bebida no coincide con la comanda ${e.orderId}. ${lines.join(" ")}`);
            break;
          }
          case "order_missed":
            this.rail.release(e.orderId, "missed");
            audio.play("miss");
            this.feedback.show({ title: `La comanda ${e.orderId} se enfrió`, lines: ["No pasa nada: sigue con la siguiente."], tone: "info", durationMs: 3200 });
            announce(`Se perdió la comanda ${e.orderId}.`);
            break;
          case "difficulty_change": {
            const up = e.to > e.from;
            audio.play(up ? "level-up" : "level-down");
            const r = this.regions?.rail;
            if (r) this.feedback.float(up ? `Nivel ${e.to}` : `Nivel ${e.to} · más calma`, r.x + r.w / 2, r.y + r.h * 0.55, up ? CSS.mustard : CSS.cream, 44);
            announce(up ? `Subes al nivel ${e.to}.` : `Bajamos el ritmo: nivel ${e.to}.`);
            break;
          }
          case "clean":
            audio.play("clean");
            announce("Limpiando la máquina. El riel espera tres segundos.");
            break;
          default:
            break;
        }
      }
    }

    // --- Entradas -----------------------------------------------------------

    canAct() {
      return !!this.session && !this.paused && !this.session.getState().ended;
    }

    onDrink(id) {
      if (!this.canAct()) return;
      if (this.session.selectDrink(id)) this.app.audio.play("click");
    }

    onModifier(id) {
      if (!this.canAct()) return;
      if (this.session.toggleModifier(id)) this.app.audio.play("toggle");
    }

    onLever() {
      if (!this.canAct()) return;
      if (this.session.pullLever()) {
        this.app.audio.play("lever");
        this.feedback.hide();
        this.handleEvents(this.session.drainEvents());
      } else if (!this.session.getState().machine.selectedDrink) {
        this.feedback.show({ title: "Falta la bebida", lines: ["Elige primero una bebida en la consola."], tone: "info", durationMs: 2200 });
      }
    }

    onPressure(held) {
      if (!this.session) return;
      if (held && !this.canAct()) return;
      this.session.setPressure(held);
    }

    onClean() {
      if (!this.canAct()) return;
      if (this.session.clean()) this.handleEvents(this.session.drainEvents());
    }

    onTicketTap(id) {
      if (!this.canAct()) return;
      const state = this.session.getState();
      if (state.machine.phase === "ready") {
        this.session.deliver(id);
        this.handleEvents(this.session.drainEvents());
      } else {
        this.rail.shake(id);
        if (state.machine.phase === "idle") {
          this.feedback.show({ title: "Primero, prepárala", lines: ["Elige la bebida y los extras en la consola y tira de PREPARAR."], tone: "info", durationMs: 2400 });
        }
      }
    }

    deliverToSlot(slot) {
      const id = this.rail.slots[slot];
      if (id != null) this.onTicketTap(id);
    }

    /** @param {KeyboardEvent} event */
    onKeyDown(event) {
      if (event.repeat && event.code !== "Space") return;
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      if (key === "Escape" || key === "P") {
        this.requestPause();
        return;
      }
      if (!this.canAct()) return;
      const drinkIndex = DRINK_KEYS.indexOf(event.key);
      if (drinkIndex >= 0 && drinkIndex < this.app.catalog.drinkOrder.length) {
        this.onDrink(this.app.catalog.drinkOrder[drinkIndex]);
        return;
      }
      const mod = this.app.catalog.modifierOrder.find((m) => this.app.catalog.modifiers[m].key === key);
      if (mod) {
        this.onModifier(mod);
        return;
      }
      if (key === "Enter") this.onLever();
      else if (event.code === "Space") {
        event.preventDefault?.();
        this.onPressure(true);
      } else if (key === "L") this.onClean();
      else if (DELIVERY_KEYS.includes(key)) this.deliverToSlot(DELIVERY_KEYS.indexOf(key));
    }

    // --- Apoyo para pruebas y accesibilidad ---------------------------------

    /** Punto del mundo de un control interactivo ("drink:cortado", "lever", "ticket:3", "pause"...). */
    worldPointFor(id) {
      if (id.startsWith("ticket:")) {
        const c = this.rail.ticketCenter(Number(id.slice(7)));
        return c ? { ...c, radius: 92 * this.rail.ticketScale } : null;
      }
      if (id === "pause") return this.hud.pauseCenter();
      if (id === "gauge") return this.machine.gaugeWorldPoint();
      if (id === "plaque") return this.machine.plaqueWorldPoint();
      return this.controls.controlCenter(id);
    }

    // --- Práctica guiada ----------------------------------------------------

    updatePractice(state, dt) {
      if (!this.practice || !state || this.paused) {
        if (!this.practice || !state) this.coach.hide();
        return;
      }
      const step = practiceStep(state, this.app.catalog, { keyHints: this.viewOptions.keyHints });
      if (!step) {
        this.coach.hide();
        return;
      }
      const tone = step.id === "done" || step.zone === "in" ? "good" : step.zone ? "bad" : "info";
      const targets = step.targets.map((id) => this.worldPointFor(id));
      this.coach.update({ title: step.title, text: step.text, tone }, targets, dt);
      if (step.id !== this.practiceStepId) {
        this.practiceStepId = step.id;
        this.app.announce(step.text);
      }
      if (step.id === "done") {
        if (!this.practiceDoneAt) {
          this.practiceDoneAt = state.clock;
          this.machine.celebrate();
        } else if (state.clock - this.practiceDoneAt > 1800) {
          this.session.end("done");
        }
      }
    }
  };
}

/**
 * Texto de "qué ajustar" a partir de la diferencia entre comanda y bebida.
 * @param {import("../core/catalog.js").Catalog} catalog
 * @param {import("../core/orders.js").OrderDiff} diff
 */
export function describeDiff(catalog, diff) {
  const lines = [];
  if (!diff.drinkOk) {
    lines.push(`Pedían ${catalog.drinks[diff.expectedDrinkId].label}, no ${catalog.drinks[diff.producedDrinkId].label}.`);
  }
  const names = (ids) => ids.map((m) => catalog.modifiers[m].label).join(", ");
  if (diff.missing.length) lines.push(`Faltó: ${names(diff.missing)}.`);
  if (diff.extra.length) lines.push(`Sobró: ${names(diff.extra)}.`);
  lines.push("Ajusta la consola y prepárala de nuevo.");
  return lines;
}
