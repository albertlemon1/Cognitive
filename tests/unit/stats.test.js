import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, trend } from "../../src/core/stats.js";

const events = [
  { type: "session_start", t: 0, level: 2 },
  { type: "gauge_result", t: 5000, quality: 0.9, ok: true },
  { type: "order_served", t: 6000, firstAttempt: true, trap: null, reactionMs: 1000, serviceMs: 5000, tip: 15 },
  { type: "gauge_result", t: 9000, quality: 0.3, ok: false },
  { type: "order_mismatch", t: 9500, trap: "icono" },
  { type: "gauge_result", t: 14000, quality: 0.8, ok: true },
  { type: "order_served", t: 15000, firstAttempt: false, trap: "icono", reactionMs: 3000, serviceMs: 12000, tip: 5 },
  { type: "order_missed", t: 20000, trap: "parecida" },
  { type: "order_missed", t: 21000, trap: null },
  { type: "difficulty_change", t: 21000, from: 2, to: 1 },
  { type: "gauge_result", t: 25000, quality: 0.7, ok: true },
  { type: "order_served", t: 26000, firstAttempt: true, trap: "parecida", reactionMs: 2000, serviceMs: 4000, tip: 10 },
];

test("summarize calcula las tres métricas del Cuaderno", () => {
  const s = summarize(events);
  assert.equal(s.served, 3);
  assert.equal(s.correctFirst, 2);
  assert.equal(s.accuracy, 0.667);
  assert.equal(s.avgReactionMs, 2000);
  assert.equal(s.avgServiceMs, 7000);
  // Trampas resueltas: icono (servida tarde), parecida (perdida), parecida (bien) → 1 de 3.
  assert.equal(s.trapResolved, 3);
  assert.equal(s.trapCorrect, 1);
  assert.equal(s.inhibition, 0.333);
  assert.equal(s.missed, 2);
  assert.equal(s.configErrors, 1);
  assert.equal(s.gaugeErrors, 1);
  assert.equal(s.brews, 4);
  assert.equal(s.tips, 30);
  assert.equal(s.startLevel, 2);
  assert.equal(s.endLevel, 1);
  assert.equal(s.maxLevel, 2);
});

test("summarize sin datos devuelve null en las proporciones", () => {
  const s = summarize([{ type: "session_start", t: 0, level: 1 }]);
  assert.equal(s.accuracy, null);
  assert.equal(s.avgReactionMs, null);
  assert.equal(s.inhibition, null);
});

test("trend: mejora, baja, estable y casos sin historial", () => {
  const up = trend([{ a: 0.5 }, { a: 0.6 }, { a: 0.8 }], "a");
  assert.equal(up.direction, "mejora");
  assert.equal(up.last, 0.8);
  assert.ok(Math.abs(up.previousMean - 0.55) < 1e-9);

  assert.equal(trend([{ a: 0.8 }, { a: 0.5 }], "a").direction, "baja");
  assert.equal(trend([{ a: 0.8 }, { a: 0.81 }], "a").direction, "estable");

  // En tiempos, bajar es mejorar.
  assert.equal(trend([{ t: 3000 }, { t: 2000 }], "t", { lowerIsBetter: true }).direction, "mejora");

  assert.equal(trend([], "a").direction, "sin-datos");
  assert.equal(trend([{ a: 0.5 }], "a").direction, "primera");
  assert.equal(trend([{ a: null }, { a: 0.4 }], "a").direction, "primera");
});

test("trend usa como mucho 5 sesiones previas", () => {
  const data = [100, 0, 0, 0, 0, 0, 50].map((a) => ({ a }));
  const r = trend(data, "a");
  assert.equal(r.previousMean, 0);
});
