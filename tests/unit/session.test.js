import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, SESSION } from "../../src/core/session.js";
import { paramsFor } from "../../src/core/difficulty.js";
import { summarize } from "../../src/core/stats.js";
import { realCatalog } from "./helpers.js";

const catalog = realCatalog();

function advance(session, ms, dt = 50, controller = null) {
  for (let t = 0; t < ms; t += dt) {
    if (controller) controller(session);
    session.tick(dt);
  }
}

/** Mantiene la aguja en la zona como un jugador atento. */
function steer(session) {
  const g = session.getState().machine.gauge;
  if (g && session.getState().machine.phase === "brewing") {
    session.setPressure(g.value < (g.zoneMin + g.zoneMax) / 2);
  }
}

/** Prepara la bebida de la comanda indicada y la entrega. */
function serve(session, order, { drinkId = order.drinkId, modifiers = order.modifiers } = {}) {
  const state = session.getState().machine;
  // Ajusta la configuración desde lo que haya quedado de la bebida anterior.
  session.selectDrink(drinkId);
  for (const m of catalog.modifierOrder) {
    if (state.modifiers.includes(m) !== modifiers.includes(m)) session.toggleModifier(m);
  }
  assert.ok(session.pullLever(), "la palanca debería funcionar");
  let guard = 0;
  while (session.getState().machine.phase !== "ready") {
    steer(session);
    session.tick(50);
    if (++guard > 1000) throw new Error("la preparación no terminó");
  }
  session.setPressure(false);
  return session.deliver(order.id);
}

test("emite session_start y la primera comanda llega a los 800 ms", () => {
  const s = createSession({ catalog, seed: 1 });
  const start = s.drainEvents();
  assert.equal(start[0].type, "session_start");
  assert.equal(start[0].level, 1);
  advance(s, SESSION.firstArrivalMs - 50);
  assert.equal(s.getState().orders.length, 0);
  advance(s, 100);
  assert.equal(s.getState().orders.length, 1);
  assert.ok(s.drainEvents().some((e) => e.type === "order_arrived"));
});

test("las llegadas respetan el máximo simultáneo", () => {
  const s = createSession({ catalog, seed: 2, startLevel: 6 });
  advance(s, 20000);
  assert.equal(s.getState().orders.length, paramsFor(6).maxConcurrent);
});

test("las comandas se voltean al vencer la exposición", () => {
  const s = createSession({ catalog, seed: 3, startLevel: 4 });
  advance(s, SESSION.firstArrivalMs + 50);
  const order = s.getState().orders[0];
  assert.equal(order.hidden, false);
  advance(s, paramsFor(4).exposureMs);
  assert.equal(s.getState().orders.find((o) => o.id === order.id).hidden, true);
  assert.ok(s.log.some((e) => e.type === "order_hidden" && e.orderId === order.id));
});

test("en nivel 1 las comandas nunca se voltean", () => {
  const s = createSession({ catalog, seed: 3, startLevel: 1 });
  advance(s, 30000);
  assert.ok(s.getState().orders.every((o) => !o.hidden));
});

test("omisión: la comanda se pierde al agotar la paciencia", () => {
  const s = createSession({ catalog, seed: 4, startLevel: 1 });
  advance(s, SESSION.firstArrivalMs + 50);
  const order = s.getState().orders[0];
  advance(s, paramsFor(1).patienceMs);
  const missed = s.log.filter((e) => e.type === "order_missed");
  assert.equal(missed.length, 1);
  assert.equal(missed[0].orderId, order.id);
  assert.ok(!s.getState().orders.some((o) => o.id === order.id));
});

test("modo Calma: sin omisiones ni comandas volteadas", () => {
  const s = createSession({ catalog, seed: 4, mode: "calma", startLevel: 8, durationMs: 600000 });
  advance(s, 300000, 100);
  assert.equal(s.log.filter((e) => e.type === "order_missed").length, 0);
  assert.equal(s.log.filter((e) => e.type === "order_hidden").length, 0, "en Calma no se voltean");
  assert.ok(s.getState().orders.length <= 2);
});

test("entrega correcta: éxito, propina y comanda retirada", () => {
  const s = createSession({ catalog, seed: 5 });
  advance(s, 1000);
  const order = s.getState().orders[0];
  const result = serve(s, order);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "success");
  assert.ok(result.tip >= SESSION.tipCorrect);
  assert.equal(s.getState().orders.length, 0);
  assert.equal(s.getState().machine.selectedDrink, null, "tras servir bien, la máquina se limpia");
  const served = s.log.find((e) => e.type === "order_served");
  assert.equal(served.firstAttempt, true);
  assert.ok(served.reactionMs >= 0);
  assert.ok(served.serviceMs > 0);
});

test("entrega incorrecta: fallo, la comanda sigue y la configuración se conserva", () => {
  const s = createSession({ catalog, seed: 6 });
  advance(s, 1000);
  const order = s.getState().orders[0];
  const wrong = catalog.drinkOrder.find((d) => d !== order.drinkId);
  const result = serve(s, order, { drinkId: wrong });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "fail");
  assert.equal(result.diff.drinkOk, false);
  assert.equal(result.diff.expectedDrinkId, order.drinkId);
  assert.ok(s.getState().orders.some((o) => o.id === order.id));
  assert.equal(s.getState().machine.selectedDrink, wrong);

  // Corregida después: se sirve pero cuenta como neutral, no como éxito.
  const fixed = serve(s, order);
  assert.equal(fixed.ok, true);
  assert.equal(fixed.outcome, "neutral");
  const served = s.log.find((e) => e.type === "order_served");
  assert.equal(served.firstAttempt, false);
});

test("bebida correcta con manómetro malo: se sirve como neutral", () => {
  const s = createSession({ catalog, seed: 7 });
  advance(s, 1000);
  const order = s.getState().orders[0];
  s.selectDrink(order.drinkId);
  s.pullLever();
  while (s.getState().machine.phase !== "ready") s.tick(50); // sin presión
  const result = s.deliver(order.id);
  assert.equal(result.ok, true);
  assert.equal(result.gaugeOk, false);
  assert.equal(result.outcome, "neutral");
  assert.equal(result.tip, SESSION.tipPartial);
});

test("entregar sin bebida lista o a una comanda inexistente no hace nada", () => {
  const s = createSession({ catalog, seed: 8 });
  advance(s, 1000);
  const order = s.getState().orders[0];
  assert.equal(s.deliver(order.id), null);
  s.selectDrink(order.drinkId);
  s.pullLever();
  while (s.getState().machine.phase !== "ready") s.tick(50);
  assert.equal(s.deliver(9999), null);
  assert.equal(s.getState().machine.phase, "ready");
});

test("tres éxitos seguidos suben el nivel", () => {
  const s = createSession({ catalog, seed: 9, startLevel: 1 });
  for (let i = 0; i < 3; i++) {
    advance(s, 2000);
    serve(s, s.getState().orders[0]);
  }
  assert.equal(s.getState().level, 2);
  assert.ok(s.log.some((e) => e.type === "difficulty_change" && e.from === 1 && e.to === 2));
});

test("limpiar congela el riel y solo funciona con la máquina libre", () => {
  const s = createSession({ catalog, seed: 10, startLevel: 1 });
  advance(s, 1000);
  const order = s.getState().orders[0];
  const ageBefore = order.ageMs;
  assert.equal(s.clean(), true);
  assert.equal(s.clean(), false, "no se encadena mientras dura");
  advance(s, SESSION.cleanMs - 100);
  assert.equal(s.getState().orders[0].ageMs, ageBefore);
  assert.equal(s.pullLever(), false, "no se prepara mientras se limpia");
  advance(s, 200);
  assert.ok(s.getState().orders[0].ageMs > ageBefore);

  s.selectDrink(order.drinkId);
  s.pullLever();
  assert.equal(s.clean(), false);
});

test("fin por tiempo: las pendientes no cuentan como omisiones", () => {
  const s = createSession({ catalog, seed: 11, startLevel: 6, durationMs: 10000 });
  advance(s, 12000);
  const state = s.getState();
  assert.equal(state.ended, true);
  assert.equal(state.endReason, "time");
  const end = s.log.find((e) => e.type === "session_end");
  assert.equal(end.reason, "time");
  assert.equal(end.summary.missed, 0);
  const count = s.log.length;
  s.tick(1000);
  assert.equal(s.log.length, count, "tras terminar no se emiten más eventos");
});

test("terminar antes de tiempo", () => {
  const s = createSession({ catalog, seed: 12 });
  advance(s, 2000);
  s.end();
  assert.equal(s.getState().endReason, "quit");
  assert.equal(s.pullLever(), false);
});

test("misma semilla y mismas acciones: mismos eventos", () => {
  const play = () => {
    const s = createSession({ catalog, seed: 2025, startLevel: 3, durationMs: 60000 });
    let served = 0;
    while (!s.getState().ended) {
      const state = s.getState();
      if (state.orders.length && state.machine.phase === "idle" && served < 6) {
        const target = state.orders[0];
        // Se equivoca a propósito en la tercera.
        const drinkId = served === 2 ? catalog.drinkOrder.find((d) => d !== target.drinkId) : target.drinkId;
        serve(s, target, { drinkId });
        served += 1;
      }
      s.tick(50);
    }
    return s.log;
  };
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
  assert.ok(a.some((e) => e.type === "order_mismatch"));
});

test("el resumen de fin de sesión coincide con summarize(log)", () => {
  const s = createSession({ catalog, seed: 13, durationMs: 20000 });
  advance(s, 1000);
  serve(s, s.getState().orders[0]);
  advance(s, 25000);
  const end = s.log.find((e) => e.type === "session_end");
  assert.deepEqual(end.summary, summarize(s.log.slice(0, -1)));
  assert.equal(end.summary.served, 1);
});
