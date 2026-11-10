import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../../src/core/prng.js";
import { createOrderFactory, compareOrder, sameSpec } from "../../src/core/orders.js";
import { allowedModifiers } from "../../src/core/catalog.js";
import { paramsFor } from "../../src/core/difficulty.js";
import { realCatalog } from "./helpers.js";

const catalog = realCatalog();

function generate(seed, params, count, pendingSize = 0) {
  const factory = createOrderFactory({ catalog, rng: createRng(seed), levelId: "barrio" });
  const pending = [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const order = factory.next(params, pending);
    out.push(order);
    pending.push(order);
    if (pending.length > pendingSize) pending.shift();
  }
  return out;
}

test("misma semilla, mismas comandas", () => {
  const params = paramsFor(6);
  assert.deepEqual(generate(2024, params, 40, 2), generate(2024, params, 40, 2));
});

test("los números de comanda son consecutivos", () => {
  const orders = generate(1, paramsFor(1), 5);
  assert.deepEqual(orders.map((o) => o.id), [1, 2, 3, 4, 5]);
});

test("respeta el máximo de modificadores y los modificadores permitidos", () => {
  for (const level of [1, 2, 4, 8]) {
    const params = paramsFor(level);
    for (const order of generate(level * 31, params, 300, 2)) {
      assert.ok(order.modifiers.length <= params.maxModifiers, `nivel ${level}: ${JSON.stringify(order)}`);
      const allowed = allowedModifiers(catalog, order.drinkId);
      for (const m of order.modifiers) assert.ok(allowed.includes(m), `${m} no permitido en ${order.drinkId}`);
      assert.equal(new Set(order.modifiers).size, order.modifiers.length);
    }
  }
});

test("nivel 1 no genera trampas ni modificadores", () => {
  for (const order of generate(77, paramsFor(1), 200, 1)) {
    assert.equal(order.trap, null);
    assert.equal(order.iconDrinkId, order.drinkId);
    assert.deepEqual(order.modifiers, []);
  }
});

test("la tasa de trampas se acerca a distractorRate", () => {
  const params = paramsFor(8);
  const orders = generate(5150, params, 2000, 2);
  const rate = orders.filter((o) => o.trap).length / orders.length;
  assert.ok(Math.abs(rate - params.distractorRate) < 0.05, `tasa ${rate}`);
});

test("trampa icono: el icono es de otra bebida, preferentemente de la misma familia", () => {
  const orders = generate(9, { ...paramsFor(8), distractorRate: 1 }, 300, 0);
  const iconTraps = orders.filter((o) => o.trap === "icono");
  assert.ok(iconTraps.length > 0);
  for (const o of iconTraps) {
    assert.notEqual(o.iconDrinkId, o.drinkId);
    const family = catalog.drinks[o.drinkId].family;
    if (catalog.families[family].length > 1) assert.equal(catalog.drinks[o.iconDrinkId].family, family);
  }
});

test("trampa parecida: difiere en un solo detalle de una comanda pendiente y no la duplica", () => {
  const params = { ...paramsFor(8), distractorRate: 1 };
  const factory = createOrderFactory({ catalog, rng: createRng(4), levelId: "barrio" });
  let found = 0;
  for (let i = 0; i < 200; i++) {
    const base = factory.next({ ...params, distractorRate: 0 }, []);
    const trap = factory.next(params, [base]);
    if (trap.trap !== "parecida") continue;
    found += 1;
    assert.ok(!sameSpec(base, trap));
    const diff = compareOrder(base, trap);
    const differences = (diff.drinkOk ? 0 : 1) + (diff.drinkOk ? diff.missing.length + diff.extra.length : 0);
    assert.equal(differences, 1, `${JSON.stringify(base)} vs ${JSON.stringify(trap)}`);
  }
  assert.ok(found > 20, `solo ${found} trampas parecidas`);
});

test("compareOrder detecta bebida equivocada, faltantes y sobrantes", () => {
  const ok = compareOrder({ drinkId: "cortado", modifiers: ["azucar"] }, { drinkId: "cortado", modifiers: ["azucar"] });
  assert.equal(ok.ok, true);

  const diff = compareOrder(
    { drinkId: "cortado", modifiers: ["azucar", "avena"] },
    { drinkId: "latte", modifiers: ["avena", "llevar"] },
  );
  assert.equal(diff.ok, false);
  assert.equal(diff.drinkOk, false);
  assert.deepEqual(diff.missing, ["azucar"]);
  assert.deepEqual(diff.extra, ["llevar"]);
});
