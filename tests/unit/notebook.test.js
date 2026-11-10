import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, sparkline, notebookHtml, summaryHtml, metricCards, DISCLAIMER } from "../../src/ui/notebook.js";

const summary = (accuracy, avgReactionMs, inhibition, extra = {}) => ({
  served: 10,
  correctFirst: 8,
  accuracy,
  avgReactionMs,
  avgServiceMs: 6000,
  trapResolved: 3,
  trapCorrect: 2,
  inhibition,
  missed: 1,
  configErrors: 2,
  gaugeErrors: 1,
  brews: 12,
  tips: 110,
  startLevel: 2,
  endLevel: 3,
  maxLevel: 3,
  ...extra,
});

test("escapeHtml neutraliza marcado", () => {
  assert.equal(escapeHtml(`<b a="1">'&'</b>`), "&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
});

test("sparkline: vacío, un punto y serie completa", () => {
  assert.ok(!sparkline([]).includes("<circle"));
  const one = sparkline([0.5]);
  assert.ok(one.includes("<circle") && !one.includes("<polyline"));
  const many = sparkline([0.2, 0.5, 0.9]);
  assert.ok(many.includes("<polyline") && many.includes("<polygon"));
  // Sin NaN aunque todos los valores sean iguales.
  assert.ok(!sparkline([1, 1, 1]).includes("NaN"));
});

test("en tiempos de reacción, la línea sube cuando el tiempo baja", () => {
  const svg = sparkline([3000, 1000], { lowerIsBetter: true });
  const [, y1, , y2] = svg.match(/points="([\d.]+),([\d.]+) ([\d.]+),([\d.]+)"/).slice(1).map(Number);
  assert.ok(y2 < y1, "el último punto (más rápido) queda más arriba");
});

test("Cuaderno vacío: explica qué aparecerá y muestra el aviso", () => {
  const html = notebookHtml([], { persistent: false });
  assert.match(html, /Aún no hay turnos/);
  assert.match(html, /no permite guardar el historial/);
  assert.ok(html.includes(escapeHtml(DISCLAIMER)));
});

test("Cuaderno con turnos: tres métricas, tendencia y tabla", () => {
  const records = [
    { id: "1", startedAt: "2026-11-08T10:00:00Z", mode: "normal", summary: summary(0.6, 3000, 0.4) },
    { id: "2", startedAt: "2026-11-09T10:00:00Z", mode: "calma", summary: summary(0.7, 2600, 0.5) },
    { id: "3", startedAt: "2026-11-10T10:00:00Z", mode: "normal", summary: summary(0.9, 2000, 0.8) },
  ];
  const html = notebookHtml(records, { persistent: true });
  assert.equal((html.match(/class="metric /g) || []).length, 3);
  assert.equal((html.match(/metric-mejora/g) || []).length, 3);
  assert.match(html, /90 %/);
  assert.match(html, /2\.0 s/);
  assert.equal((html.match(/<tr>/g) || []).length, 4);
  assert.match(html, /Calma/);
  assert.ok(!html.includes("no permite guardar"));
});

test("métricas sin datos muestran un guion", () => {
  const html = metricCards([summary(null, null, null)]);
  assert.equal((html.match(/—/g) || []).length, 3);
});

test("resumen del turno: detalles y jornada", () => {
  const s = summary(0.8, 2100, 0.5);
  const partial = summaryHtml(s, [s], { sessionsToday: 1, recommended: 3 });
  assert.match(partial, /Turno 1 de 3/);
  assert.match(partial, /Servidas: 10/);
  assert.match(partial, /Propinas: 110/);
  const done = summaryHtml(s, [s], { sessionsToday: 3, recommended: 3 });
  assert.match(done, /Jornada completa/);
});
