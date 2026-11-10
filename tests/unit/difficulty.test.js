import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDifficulty,
  updateDifficulty,
  paramsFor,
  clampLevel,
  DEFAULT_RULES,
  MAX_LEVEL,
} from "../../src/core/difficulty.js";

function run(state, outcomes) {
  let s = state;
  const changes = [];
  for (const o of outcomes) {
    const r = updateDifficulty(s, o);
    if (r.changed) changes.push([r.from, r.to]);
    s = r.state;
  }
  return { state: s, changes };
}

test("estado inicial", () => {
  assert.deepEqual(initialDifficulty(), { level: 1, successStreak: 0, failStreak: 0 });
  assert.equal(initialDifficulty(99).level, MAX_LEVEL);
  assert.equal(initialDifficulty(-3).level, 1);
});

test("sube un nivel tras 3 éxitos seguidos y reinicia contadores", () => {
  const { state, changes } = run(initialDifficulty(2), ["success", "success", "success"]);
  assert.deepEqual(changes, [[2, 3]]);
  assert.deepEqual(state, { level: 3, successStreak: 0, failStreak: 0 });
});

test("2 éxitos no bastan para subir", () => {
  const { state, changes } = run(initialDifficulty(2), ["success", "success"]);
  assert.deepEqual(changes, []);
  assert.equal(state.successStreak, 2);
});

test("baja un nivel tras 2 fallos seguidos", () => {
  const { state, changes } = run(initialDifficulty(4), ["fail", "fail"]);
  assert.deepEqual(changes, [[4, 3]]);
  assert.deepEqual(state, { level: 3, successStreak: 0, failStreak: 0 });
});

test("histéresis: tras subir, un solo fallo no baja; hacen falta 2 seguidos", () => {
  const { state, changes } = run(initialDifficulty(3), ["success", "success", "success", "fail"]);
  assert.deepEqual(changes, [[3, 4]]);
  assert.equal(state.level, 4);
  assert.equal(state.failStreak, 1);
});

test("alternar éxito y fallo no mueve el nivel", () => {
  const { changes } = run(initialDifficulty(4), Array.from({ length: 20 }, (_, i) => (i % 2 ? "fail" : "success")));
  assert.deepEqual(changes, []);
});

test("neutral corta la racha de éxitos sin sumar fallos", () => {
  const { state, changes } = run(initialDifficulty(2), ["success", "success", "neutral", "success"]);
  assert.deepEqual(changes, []);
  assert.equal(state.successStreak, 1);
  assert.equal(state.failStreak, 0);

  const afterFail = run(initialDifficulty(4), ["fail", "neutral", "fail"]);
  assert.deepEqual(afterFail.changes, [[4, 3]]);
});

test("un éxito interrumpe la racha de fallos", () => {
  const { changes } = run(initialDifficulty(4), ["fail", "success", "fail"]);
  assert.deepEqual(changes, []);
});

test("límites: no baja de 1 ni sube de 8", () => {
  const low = run(initialDifficulty(1), ["fail", "fail", "fail", "fail"]);
  assert.equal(low.state.level, 1);
  assert.deepEqual(low.changes, []);
  const high = run(initialDifficulty(8), Array(9).fill("success"));
  assert.equal(high.state.level, 8);
  assert.deepEqual(high.changes, []);
});

test("updateDifficulty es pura: no modifica el estado de entrada", () => {
  const state = Object.freeze(initialDifficulty(3));
  const result = updateDifficulty(state, "success");
  assert.notEqual(result.state, state);
  assert.deepEqual(state, { level: 3, successStreak: 0, failStreak: 0 });
});

test("reglas personalizadas", () => {
  const rules = { ...DEFAULT_RULES, upAfter: 1, downAfter: 1 };
  assert.equal(updateDifficulty(initialDifficulty(3), "success", rules).state.level, 4);
  assert.equal(updateDifficulty(initialDifficulty(3), "fail", rules).state.level, 2);
});

test("los parámetros se endurecen de forma monótona con el nivel", () => {
  for (let level = 2; level <= MAX_LEVEL; level++) {
    const prev = paramsFor(level - 1);
    const cur = paramsFor(level);
    assert.ok(cur.zoneWidth <= prev.zoneWidth);
    assert.ok(cur.distractorRate >= prev.distractorRate);
    assert.ok(cur.maxConcurrent >= prev.maxConcurrent);
    assert.ok(cur.maxModifiers >= prev.maxModifiers);
    assert.ok(cur.drift >= prev.drift);
    assert.ok(cur.patienceMs <= prev.patienceMs);
    if (prev.exposureMs != null) assert.ok(cur.exposureMs <= prev.exposureMs);
    assert.ok(cur.maxConcurrent >= 1 && cur.maxConcurrent <= 3);
  }
  assert.equal(paramsFor(1).exposureMs, null);
  assert.equal(paramsFor(3).exposureMs, null);
  assert.equal(paramsFor(4).exposureMs, 12000, "primer nivel con comandas volteadas: 12 s");
  assert.equal(paramsFor(8).maxConcurrent, 3);
});

test("modo Calma: sin paciencia, máximo 2 comandas, más pausa y menos deriva", () => {
  const normal = paramsFor(8);
  const calm = paramsFor(8, { calm: true });
  assert.equal(calm.patienceMs, null);
  assert.equal(calm.exposureMs, null, "en Calma las comandas no se voltean");
  assert.equal(calm.maxConcurrent, 2);
  assert.equal(calm.arrivalGapMs, Math.round(normal.arrivalGapMs * 1.5));
  assert.ok(calm.drift < normal.drift);
  assert.equal(calm.zoneWidth, normal.zoneWidth);
});

test("clampLevel redondea y acota", () => {
  assert.equal(clampLevel(3.6), 4);
  assert.equal(clampLevel(NaN), 1);
  assert.equal(clampLevel(100), MAX_LEVEL);
});
