import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../../src/core/prng.js";
import { BrewMachine } from "../../src/core/machine.js";
import { Gauge, GAUGE } from "../../src/core/gauge.js";
import { stepsFor } from "../../src/core/catalog.js";
import { realCatalog } from "./helpers.js";

const catalog = realCatalog();

function newMachine(seed = 1, gauge = { zoneWidth: 0.4, drift: 0.3 }) {
  return new BrewMachine({ catalog, rng: createRng(seed), gauge });
}

/** Controlador ideal: sostiene si la aguja está por debajo del centro de la zona. */
function steer(machine) {
  const g = machine.snapshot().gauge;
  if (g && machine.gauge) machine.setPressure(g.value < (g.zoneMin + g.zoneMax) / 2);
}

function runToEnd(machine, { dt = 16, controller = null, maxMs = 30000 } = {}) {
  const events = [];
  for (let t = 0; t < maxMs && machine.phase === "brewing"; t += dt) {
    if (controller) controller(machine);
    events.push(...machine.tick(dt));
  }
  return events;
}

test("secuencia válida: idle → brewing → ready → idle", () => {
  const m = newMachine();
  assert.equal(m.phase, "idle");
  assert.ok(m.selectDrink("cortado"));
  assert.ok(m.toggleModifier("azucar"));
  assert.ok(m.pullLever());
  assert.equal(m.phase, "brewing");

  const events = runToEnd(m, { controller: steer });
  assert.equal(m.phase, "ready");
  const expected = stepsFor(catalog, "cortado", ["azucar"]).map((s) => s.id);
  assert.deepEqual(events.filter((e) => e.type === "step_start").map((e) => e.step.id), expected);
  assert.deepEqual(events.filter((e) => e.type === "step_end").map((e) => e.step.id), expected);
  assert.equal(events.filter((e) => e.type === "gauge_result").length, 1);
  const done = events.find((e) => e.type === "brew_done");
  assert.deepEqual(done.drink.drinkId, "cortado");
  assert.deepEqual(done.drink.modifiers, ["azucar"]);

  const drink = m.take();
  assert.equal(drink.drinkId, "cortado");
  assert.equal(m.phase, "idle");
  // La configuración se conserva para poder corregirla.
  assert.equal(m.selectedDrink, "cortado");
  assert.equal(m.take(), null);
});

test("la palanca sin bebida elegida no hace nada", () => {
  const m = newMachine();
  assert.equal(m.pullLever(), false);
  assert.equal(m.phase, "idle");
  assert.deepEqual(m.tick(100), []);
});

test("no se cambia la configuración durante la preparación", () => {
  const m = newMachine();
  m.selectDrink("espresso");
  m.pullLever();
  m.tick(50);
  assert.equal(m.selectDrink("latte"), false);
  assert.equal(m.toggleModifier("azucar"), false);
  assert.equal(m.pullLever(), false);
  assert.equal(m.snapshot().selectedDrink, "espresso");
  assert.deepEqual(m.snapshot().modifiers, []);
});

test("bebida o modificador inexistente se rechaza", () => {
  const m = newMachine();
  assert.equal(m.selectDrink("unicornio"), false);
  assert.equal(m.toggleModifier("purpurina"), false);
});

test("la duración total coincide con la receta, con cualquier tamaño de paso", () => {
  for (const dt of [7, 16, 33, 250]) {
    const m = newMachine();
    m.selectDrink("capuchino");
    m.toggleModifier("doble");
    m.pullLever();
    const total = stepsFor(catalog, "capuchino", ["doble"]).reduce((a, s) => a + s.durationMs, 0);
    let elapsed = 0;
    while (m.phase === "brewing") {
      m.tick(dt);
      elapsed += dt;
    }
    assert.ok(elapsed >= total && elapsed < total + dt + 1, `dt=${dt}: ${elapsed} vs ${total}`);
  }
});

test("clearSelection solo en idle", () => {
  const m = newMachine();
  m.selectDrink("latte");
  m.toggleModifier("llevar");
  m.clearSelection();
  assert.equal(m.selectedDrink, null);
  assert.deepEqual(m.snapshot().modifiers, []);
});

test("manómetro: sostener bien da calidad alta", () => {
  const m = newMachine(5);
  m.selectDrink("espresso");
  m.pullLever();
  const events = runToEnd(m, { controller: steer });
  const result = events.find((e) => e.type === "gauge_result");
  assert.ok(result.quality >= GAUGE.goodQuality, `calidad ${result.quality}`);
  assert.equal(result.ok, true);
  assert.equal(m.produced.gaugeOk, true);
});

test("manómetro: no sostener nunca da calidad baja", () => {
  const m = newMachine(5);
  m.selectDrink("espresso");
  m.pullLever();
  const events = runToEnd(m);
  const result = events.find((e) => e.type === "gauge_result");
  assert.ok(result.quality < 0.2, `calidad ${result.quality}`);
  assert.equal(result.ok, false);
});

test("manómetro: sostener siempre también falla (la aguja se pasa)", () => {
  const m = newMachine(5);
  m.selectDrink("espresso");
  m.setPressure(true);
  m.pullLever();
  const result = runToEnd(m).find((e) => e.type === "gauge_result");
  assert.ok(result.quality < GAUGE.goodQuality, `calidad ${result.quality}`);
});

test("Gauge: determinista y con zona dentro de [0, 1]", () => {
  const run = () => {
    const g = new Gauge(createRng(9), { zoneWidth: 0.2, drift: 1 });
    const values = [];
    for (let i = 0; i < 100; i++) {
      g.setHeld(i % 7 < 4);
      g.tick(30);
      values.push(g.value);
    }
    return { values, q: g.quality(), zone: [g.zoneMin, g.zoneMax] };
  };
  const a = run();
  assert.deepEqual(a, run());
  assert.ok(a.zone[0] >= 0 && a.zone[1] <= 1 && a.zone[1] - a.zone[0] <= 0.2 + 1e-9);
  for (const v of a.values) assert.ok(v >= 0 && v <= 1);
});
