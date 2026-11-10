import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../../src/core/session.js";
import { practiceStep, PRACTICE_ORDERS, PRACTICE_GAUGE_SCALE } from "../../src/core/tutorial.js";
import { stepsFor } from "../../src/core/catalog.js";
import { gaugeZone } from "../../src/core/gauge.js";
import { realCatalog } from "./helpers.js";

const catalog = realCatalog();

function practice() {
  return createSession({
    catalog,
    seed: 1,
    mode: "practica",
    startLevel: 1,
    durationMs: 15 * 60 * 1000,
    scriptedOrders: PRACTICE_ORDERS,
    gaugeStepScale: PRACTICE_GAUGE_SCALE,
  });
}

function tickUntil(s, predicate, max = 60000) {
  for (let t = 0; t < max; t += 50) {
    if (predicate(s.getState())) return;
    s.tick(50);
  }
  throw new Error("la condición no se cumplió");
}

test("gaugeZone clasifica la aguja", () => {
  const g = { zoneMin: 0.4, zoneMax: 0.6 };
  assert.equal(gaugeZone({ ...g, value: 0.1 }), "below");
  assert.equal(gaugeZone({ ...g, value: 0.5 }), "in");
  assert.equal(gaugeZone({ ...g, value: 0.9 }), "above");
  assert.equal(gaugeZone(null), null);
});

test("las comandas con guion salen en orden y luego no llegan más", () => {
  const s = practice();
  assert.equal(s.getState().mode, "practica");
  assert.equal(s.getState().params.patienceMs, null, "la práctica no tiene reloj de paciencia");
  tickUntil(s, (st) => st.orders.length === 1);
  const first = s.getState().orders[0];
  assert.deepEqual([first.drinkId, first.modifiers, first.trap], ["cortado", [], null]);
  assert.equal(s.getState().scriptRemaining, 1);

  for (const spec of PRACTICE_ORDERS) {
    tickUntil(s, (st) => st.orders.length === 1);
    const order = s.getState().orders[0];
    assert.equal(order.drinkId, spec.drinkId);
    s.selectDrink(order.drinkId);
    for (const m of order.modifiers) s.toggleModifier(m);
    s.pullLever();
    tickUntil(s, (st) => st.machine.phase === "ready");
    assert.equal(s.deliver(order.id).ok, true);
  }
  s.tick(60000);
  assert.equal(s.getState().orders.length, 0);
  assert.equal(s.getState().scriptRemaining, 0);
  assert.equal(s.log.filter((e) => e.type === "order_arrived").length, 2);
});

test("la guía sigue al jugador paso a paso", () => {
  const s = practice();
  const at = () => practiceStep(s.getState(), catalog, { keyHints: true });
  assert.equal(at().id, "wait");
  tickUntil(s, (st) => st.orders.length === 1);
  const order = s.getState().orders[0];

  let step = at();
  assert.equal(step.id, "drink");
  assert.deepEqual(step.targets, [`ticket:${order.id}`, "drink:cortado"]);
  assert.match(step.title, /comanda 1 de 2/);
  assert.match(step.text, /Cortado/);

  // Si elige mal, la guía insiste en la bebida correcta.
  s.selectDrink("latte");
  assert.equal(at().id, "drink");

  // Un extra de más: pide apagarlo.
  s.selectDrink("cortado");
  s.toggleModifier("llevar");
  step = at();
  assert.equal(step.id, "modifier");
  assert.match(step.text, /no lleva Para llevar/);
  assert.deepEqual(step.targets, ["mod:llevar"]);
  s.toggleModifier("llevar");

  step = at();
  assert.equal(step.id, "lever");
  assert.match(step.text, /Enter/);
  s.pullLever();
  s.tick(10);
  assert.equal(at().id, "brewing");

  tickUntil(s, (st) => st.machine.steps[st.machine.stepIndex]?.gauge === true);
  step = at();
  assert.equal(step.id, "gauge");
  assert.equal(step.zone, "below", "la aguja arranca abajo");
  assert.match(step.text, /Mantén pulsado PRESIÓN \(o la barra espaciadora\)/);
  assert.deepEqual(step.targets, ["gauge", "pressure"]);

  tickUntil(s, (st) => st.machine.phase === "ready");
  step = at();
  assert.equal(step.id, "deliver");
  assert.deepEqual(step.targets, [`ticket:${order.id}`]);
  s.deliver(order.id);

  // Segunda comanda: enseña el interruptor de extras.
  tickUntil(s, (st) => st.orders.length === 1);
  s.selectDrink("capuchino");
  step = at();
  assert.equal(step.id, "modifier");
  assert.match(step.text, /lleva Azúcar/);
  assert.match(step.title, /comanda 2 de 2/);
  s.toggleModifier("azucar");
  s.pullLever();
  tickUntil(s, (st) => st.machine.phase === "ready");
  s.deliver(s.getState().orders[0].id);
  assert.equal(at().id, "done");
});

test("sin estado no hay paso", () => {
  assert.equal(practiceStep(null, catalog), null);
});

test("la práctica alarga solo el paso con manómetro", () => {
  const s = practice();
  tickUntil(s, (st) => st.orders.length === 1);
  s.selectDrink("cortado");
  s.pullLever();
  const steps = s.getState().machine.steps;
  const base = stepsFor(catalog, "cortado", []);
  steps.forEach((step, i) => {
    const expected = step.gauge ? Math.round(base[i].durationMs * PRACTICE_GAUGE_SCALE) : base[i].durationMs;
    assert.equal(step.durationMs, expected, step.id);
  });
});
