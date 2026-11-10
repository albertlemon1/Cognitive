// Una sesión de juego completa. Reloj propio (suma de dt) y PRNG con semilla:
// la misma semilla con las mismas acciones produce los mismos eventos.

import { createRng } from "./prng.js";
import { createOrderFactory, compareOrder } from "./orders.js";
import { BrewMachine } from "./machine.js";
import { GAUGE } from "./gauge.js";
import { initialDifficulty, updateDifficulty, paramsFor } from "./difficulty.js";
import { summarize } from "./stats.js";

export const SESSION = Object.freeze({
  firstArrivalMs: 800,
  refillDelayMs: 1200,
  cleanMs: 3000,
  maxTickMs: 250,
  tipCorrect: 10,
  tipExcellent: 5,
  tipPartial: 5,
});

/**
 * @typedef {Object} RailOrder
 * @property {number} id
 * @property {string} drinkId
 * @property {string[]} modifiers
 * @property {string} iconDrinkId
 * @property {null|"icono"|"parecida"} trap
 * @property {number} arrivedAt
 * @property {number} ageMs
 * @property {number|null} exposureMs
 * @property {number|null} patienceMs
 * @property {boolean} hidden
 * @property {number} attempts     Entregas fallidas.
 */

/**
 * @typedef {Object} DeliveryResult
 * @property {number} orderId
 * @property {boolean} ok
 * @property {import("./orders.js").OrderDiff} diff
 * @property {"success"|"fail"|"neutral"} outcome
 * @property {boolean} gaugeOk
 * @property {number} quality
 * @property {number} tip
 */

/**
 * @param {{
 *   catalog: import("./catalog.js").Catalog,
 *   seed: number,
 *   levelId?: string,
 *   mode?: "normal"|"calma",
 *   durationMs?: number,
 *   startLevel?: number,
 *   sessionId?: string,
 * }} options
 */
export function createSession(options) {
  const { catalog, seed } = options;
  const levelId = options.levelId ?? Object.keys(catalog.levels)[0];
  const mode = options.mode === "calma" ? "calma" : "normal";
  const durationMs = options.durationMs ?? 5 * 60 * 1000;
  const sessionId = options.sessionId ?? `s-${seed}`;
  const calm = mode === "calma";

  const orderRng = createRng(seed);
  const gaugeRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const factory = createOrderFactory({ catalog, rng: orderRng, levelId });

  let difficulty = initialDifficulty(options.startLevel ?? catalog.levels[levelId].startLevel);
  let params = paramsFor(difficulty.level, { calm });
  const machine = new BrewMachine({
    catalog,
    rng: gaugeRng,
    gauge: { zoneWidth: params.zoneWidth, drift: params.drift },
  });

  let clock = 0;
  let nextArrivalAt = SESSION.firstArrivalMs;
  let idleSince = 0;
  let brewStartedAt = 0;
  let brewIdleSince = 0;
  let cleaningMs = 0;
  let tips = 0;
  let ended = false;
  let endReason = null;
  /** @type {RailOrder[]} */
  let rail = [];
  /** @type {Array<Record<string, any>>} */
  const log = [];
  /** @type {Array<Record<string, any>>} */
  let queue = [];

  function emit(type, payload = {}) {
    const event = { type, t: Math.round(clock), ...payload };
    log.push(event);
    queue.push(event);
    return event;
  }

  emit("session_start", { seed, levelId, mode, level: difficulty.level, durationMs, sessionId });

  function applyOutcome(outcome) {
    const result = updateDifficulty(difficulty, outcome);
    difficulty = result.state;
    if (result.changed) {
      params = paramsFor(difficulty.level, { calm });
      machine.setGaugeParams({ zoneWidth: params.zoneWidth, drift: params.drift });
      emit("difficulty_change", { from: result.from, to: result.to });
    }
  }

  function removeOrder(id) {
    rail = rail.filter((o) => o.id !== id);
    nextArrivalAt = Math.max(nextArrivalAt, clock + SESSION.refillDelayMs);
  }

  function spawnOrder() {
    const order = factory.next(params, rail);
    /** @type {RailOrder} */
    const railOrder = {
      ...order,
      arrivedAt: clock,
      ageMs: 0,
      exposureMs: params.exposureMs,
      patienceMs: params.patienceMs,
      hidden: false,
      attempts: 0,
    };
    rail.push(railOrder);
    nextArrivalAt = clock + params.arrivalGapMs;
    emit("order_arrived", {
      orderId: order.id,
      drinkId: order.drinkId,
      modifiers: order.modifiers,
      trap: order.trap,
      iconDrinkId: order.iconDrinkId,
    });
  }

  function tick(dtMs) {
    if (ended) return;
    const dt = Math.min(SESSION.maxTickMs, Math.max(0, dtMs));
    clock += dt;

    if (cleaningMs > 0) {
      cleaningMs = Math.max(0, cleaningMs - dt);
      // Mientras se limpia, el riel queda en pausa: ni llegadas ni paciencia.
      nextArrivalAt += dt;
    } else {
      for (const order of rail.slice()) {
        order.ageMs += dt;
        if (!order.hidden && order.exposureMs != null && order.ageMs >= order.exposureMs) {
          order.hidden = true;
          emit("order_hidden", { orderId: order.id });
        }
        if (order.patienceMs != null && order.ageMs >= order.patienceMs) {
          removeOrder(order.id);
          emit("order_missed", { orderId: order.id, trap: order.trap });
          applyOutcome("fail");
        }
      }
      if (clock < durationMs && rail.length < params.maxConcurrent && clock >= nextArrivalAt) {
        spawnOrder();
      }
    }

    for (const event of machine.tick(dt)) {
      if (event.type === "gauge_result") {
        emit("gauge_result", { quality: event.quality, ok: event.ok });
      } else if (event.type === "brew_done") {
        emit("brew_done", { drinkId: event.drink.drinkId, modifiers: event.drink.modifiers });
      } else {
        emit(event.type, { index: event.index, stepId: event.step.id });
      }
    }

    if (clock >= durationMs) end("time");
  }

  function selectDrink(drinkId) {
    return !ended && machine.selectDrink(drinkId);
  }

  function toggleModifier(modifierId) {
    return !ended && machine.toggleModifier(modifierId);
  }

  function setPressure(held) {
    machine.setPressure(held);
  }

  function pullLever() {
    if (ended || cleaningMs > 0) return false;
    if (!machine.pullLever()) return false;
    brewStartedAt = clock;
    brewIdleSince = idleSince;
    const snap = machine.snapshot();
    emit("brew_start", { drinkId: snap.selectedDrink, modifiers: snap.modifiers });
    return true;
  }

  /**
   * Entrega la bebida lista a una comanda del riel.
   * @param {number} orderId
   * @returns {DeliveryResult|null}
   */
  function deliver(orderId) {
    if (ended || machine.phase !== "ready") return null;
    const order = rail.find((o) => o.id === orderId);
    if (!order) return null;
    const drink = /** @type {import("./machine.js").ProducedDrink} */ (machine.take());
    idleSince = clock;
    const diff = compareOrder(order, drink);

    if (!diff.ok) {
      order.attempts += 1;
      emit("order_mismatch", { orderId, trap: order.trap, diff });
      applyOutcome("fail");
      return { orderId, ok: false, diff, outcome: "fail", gaugeOk: drink.gaugeOk, quality: drink.quality, tip: 0 };
    }

    const firstAttempt = order.attempts === 0;
    const outcome = firstAttempt && drink.gaugeOk ? "success" : "neutral";
    let tip = SESSION.tipPartial;
    if (outcome === "success") {
      tip = SESSION.tipCorrect + (drink.quality >= GAUGE.excellentQuality ? SESSION.tipExcellent : 0);
    }
    tips += tip;
    removeOrder(orderId);
    machine.clearSelection();
    emit("order_served", {
      orderId,
      firstAttempt,
      ok: true,
      gaugeOk: drink.gaugeOk,
      quality: drink.quality,
      trap: order.trap,
      reactionMs: Math.max(0, Math.round(brewStartedAt - Math.max(order.arrivedAt, brewIdleSince))),
      serviceMs: Math.round(clock - order.arrivedAt),
      tip,
    });
    applyOutcome(outcome);
    return { orderId, ok: true, diff, outcome, gaugeOk: drink.gaugeOk, quality: drink.quality, tip };
  }

  /** Pausa integrada: congela el riel unos segundos. Solo con la máquina libre. */
  function clean() {
    if (ended || cleaningMs > 0 || machine.phase !== "idle") return false;
    cleaningMs = SESSION.cleanMs;
    emit("clean");
    return true;
  }

  /** @param {"time"|"quit"} [reason] */
  function end(reason = "quit") {
    if (ended) return;
    ended = true;
    endReason = reason;
    machine.setPressure(false);
    emit("session_end", { reason, summary: summarize(log) });
  }

  function getState() {
    return {
      sessionId,
      seed,
      levelId,
      mode,
      clock,
      durationMs,
      remainingMs: Math.max(0, durationMs - clock),
      ended,
      endReason,
      level: difficulty.level,
      difficulty: { ...difficulty },
      params: { ...params },
      orders: rail.map((o) => ({
        ...o,
        patienceLeft: o.patienceMs == null ? null : Math.max(0, 1 - o.ageMs / o.patienceMs),
      })),
      machine: machine.snapshot(),
      cleaningMs,
      tips,
    };
  }

  function drainEvents() {
    const out = queue;
    queue = [];
    return out;
  }

  return {
    tick,
    selectDrink,
    toggleModifier,
    setPressure,
    pullLever,
    deliver,
    clean,
    end,
    getState,
    drainEvents,
    get log() {
      return log.slice();
    },
  };
}
