import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, seedFromString } from "../../src/core/prng.js";

test("la misma semilla produce la misma secuencia", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test("semillas distintas producen secuencias distintas", () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notDeepEqual(
    Array.from({ length: 10 }, () => a.next()),
    Array.from({ length: 10 }, () => b.next()),
  );
});

test("next() queda en [0, 1) y se distribuye de forma razonable", () => {
  const rng = createRng(99);
  let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  const mean = sum / 10000;
  assert.ok(mean > 0.48 && mean < 0.52, `media fuera de rango: ${mean}`);
});

test("int() respeta los límites e incluye ambos extremos", () => {
  const rng = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = rng.int(2, 5);
    assert.ok(Number.isInteger(v) && v >= 2 && v <= 5);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
  assert.throws(() => rng.int(5, 2), RangeError);
});

test("chance() en los extremos es determinista", () => {
  const rng = createRng(3);
  for (let i = 0; i < 100; i++) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

test("pick() y weighted() eligen de la lista y respetan pesos", () => {
  const rng = createRng(11);
  const items = ["a", "b", "c"];
  for (let i = 0; i < 100; i++) assert.ok(items.includes(rng.pick(items)));
  assert.throws(() => rng.pick([]), RangeError);

  const counts = { a: 0, b: 0, c: 0 };
  const weights = { a: 8, b: 2, c: 0 };
  for (let i = 0; i < 5000; i++) counts[rng.weighted(items, (x) => weights[x])] += 1;
  assert.equal(counts.c, 0);
  assert.ok(counts.a > counts.b * 3, JSON.stringify(counts));
});

test("shuffle() devuelve una permutación sin modificar la original", () => {
  const rng = createRng(5);
  const original = [1, 2, 3, 4, 5, 6];
  const shuffled = rng.shuffle(original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...shuffled].sort(), original);
});

test("getState() permite reanudar la secuencia", () => {
  const a = createRng(42);
  a.next();
  a.next();
  const resumed = createRng(a.getState());
  assert.equal(resumed.next(), a.next());
});

test("seedFromString() es estable y distingue textos", () => {
  assert.equal(seedFromString("barra"), seedFromString("barra"));
  assert.notEqual(seedFromString("barra"), seedFromString("sepia"));
  assert.ok(Number.isInteger(seedFromString("x")) && seedFromString("x") >= 0);
});
