// Máquina de estados de la preparación.
//
//   idle ──pullLever()──▶ brewing ──último paso──▶ ready ──take()──▶ idle
//
// La configuración (bebida y modificadores) solo cambia en idle.

import { stepsFor, canonicalModifiers } from "./catalog.js";
import { Gauge, GAUGE } from "./gauge.js";

/**
 * @typedef {Object} ProducedDrink
 * @property {string} drinkId
 * @property {string[]} modifiers
 * @property {number} quality      Calidad del manómetro (1 si la receta no lo usa).
 * @property {boolean} gaugeOk
 */

/**
 * @typedef {Object} MachineEvent
 * @property {"step_start"|"step_end"|"gauge_result"|"brew_done"} type
 * @property {number} [index]
 * @property {import("./catalog.js").StepDef} [step]
 * @property {number} [quality]
 * @property {boolean} [ok]
 * @property {ProducedDrink} [drink]
 */

/**
 * @typedef {Object} MachineState
 * @property {"idle"|"brewing"|"ready"} phase
 * @property {string|null} selectedDrink
 * @property {string[]} modifiers
 * @property {import("./catalog.js").StepDef[]} steps
 * @property {number} stepIndex
 * @property {number} stepProgress   0..1 del paso actual.
 * @property {import("./gauge.js").GaugeState|null} gauge
 * @property {boolean} pressureHeld
 * @property {ProducedDrink|null} produced
 */

export class BrewMachine {
  /**
   * @param {{ catalog: import("./catalog.js").Catalog, rng: import("./prng.js").Rng,
   *           gauge: import("./gauge.js").GaugeParams, gaugeStepScale?: number }} options
   *   gaugeStepScale: multiplica la duración del paso con manómetro (la práctica lo alarga).
   */
  constructor({ catalog, rng, gauge, gaugeStepScale = 1 }) {
    this.catalog = catalog;
    this.rng = rng;
    this.gaugeStepScale = gaugeStepScale;
    this.gaugeParams = { ...gauge };
    this.reset();
  }

  reset() {
    /** @type {"idle"|"brewing"|"ready"} */
    this.phase = "idle";
    /** @type {string|null} */
    this.selectedDrink = null;
    /** @type {Set<string>} */
    this.modifiers = new Set();
    /** @type {import("./catalog.js").StepDef[]} */
    this.steps = [];
    this.stepIndex = -1;
    this.stepElapsed = 0;
    /** @type {Gauge|null} */
    this.gauge = null;
    this.lastGauge = null;
    this.quality = 1;
    this.pressureHeld = false;
    /** @type {ProducedDrink|null} */
    this.produced = null;
  }

  /** @param {import("./gauge.js").GaugeParams} params Aplica desde la próxima extracción. */
  setGaugeParams(params) {
    this.gaugeParams = { ...params };
  }

  /** @param {string} drinkId */
  selectDrink(drinkId) {
    if (this.phase !== "idle" || !(drinkId in this.catalog.drinks)) return false;
    this.selectedDrink = drinkId;
    return true;
  }

  /** @param {string} modifierId */
  toggleModifier(modifierId) {
    if (this.phase !== "idle" || !(modifierId in this.catalog.modifiers)) return false;
    if (this.modifiers.has(modifierId)) this.modifiers.delete(modifierId);
    else this.modifiers.add(modifierId);
    return true;
  }

  clearSelection() {
    if (this.phase !== "idle") return;
    this.selectedDrink = null;
    this.modifiers.clear();
  }

  /** @param {boolean} held */
  setPressure(held) {
    this.pressureHeld = !!held;
    if (this.gauge) this.gauge.setHeld(this.pressureHeld);
  }

  /** @returns {boolean} true si empezó a preparar. */
  pullLever() {
    if (this.phase !== "idle" || !this.selectedDrink) return false;
    this.steps = stepsFor(this.catalog, this.selectedDrink, this.modifiers).map((step) =>
      step.gauge && this.gaugeStepScale !== 1 ? { ...step, durationMs: Math.round(step.durationMs * this.gaugeStepScale) } : step,
    );
    this.phase = "brewing";
    this.stepIndex = -1;
    this.stepElapsed = 0;
    this.quality = 1;
    this.lastGauge = null;
    this.produced = null;
    this._pendingStart = true;
    return true;
  }

  /**
   * @param {number} dtMs
   * @returns {MachineEvent[]}
   */
  tick(dtMs) {
    /** @type {MachineEvent[]} */
    const events = [];
    if (this.phase !== "brewing") return events;

    if (this._pendingStart) {
      this._pendingStart = false;
      this._startStep(0, events);
    }

    let remaining = Math.max(0, dtMs);
    while (this.phase === "brewing" && remaining >= 0) {
      const step = this.steps[this.stepIndex];
      const left = step.durationMs - this.stepElapsed;
      const used = Math.min(left, remaining);
      this.stepElapsed += used;
      if (this.gauge) this.gauge.tick(used);
      remaining -= used;
      if (this.stepElapsed < step.durationMs) break;

      events.push({ type: "step_end", index: this.stepIndex, step });
      if (this.gauge) {
        this.quality = this.gauge.quality();
        this.lastGauge = this.gauge.snapshot();
        events.push({ type: "gauge_result", quality: this.quality, ok: this.quality >= GAUGE.goodQuality });
        this.gauge = null;
      }
      if (this.stepIndex + 1 < this.steps.length) {
        this._startStep(this.stepIndex + 1, events);
      } else {
        this.phase = "ready";
        this.produced = {
          drinkId: /** @type {string} */ (this.selectedDrink),
          modifiers: canonicalModifiers(this.catalog, this.modifiers),
          quality: this.quality,
          gaugeOk: this.quality >= GAUGE.goodQuality,
        };
        events.push({ type: "brew_done", drink: this.produced });
      }
      if (remaining === 0) break;
    }
    return events;
  }

  _startStep(index, events) {
    this.stepIndex = index;
    this.stepElapsed = 0;
    const step = this.steps[index];
    if (step.gauge) {
      this.gauge = new Gauge(this.rng, this.gaugeParams);
      this.gauge.setHeld(this.pressureHeld);
    }
    events.push({ type: "step_start", index, step });
  }

  /** Retira la bebida lista y vuelve a idle conservando la configuración. */
  take() {
    if (this.phase !== "ready") return null;
    const drink = this.produced;
    this.phase = "idle";
    this.steps = [];
    this.stepIndex = -1;
    this.stepElapsed = 0;
    this.produced = null;
    return drink;
  }

  /** @returns {MachineState} */
  snapshot() {
    const step = this.steps[this.stepIndex];
    return {
      phase: this.phase,
      selectedDrink: this.selectedDrink,
      modifiers: canonicalModifiers(this.catalog, this.modifiers),
      steps: this.steps,
      stepIndex: this.stepIndex,
      stepProgress: step ? Math.min(1, this.stepElapsed / step.durationMs) : 0,
      gauge: this.gauge ? this.gauge.snapshot() : this.lastGauge,
      pressureHeld: this.pressureHeld,
      produced: this.produced,
    };
  }
}
