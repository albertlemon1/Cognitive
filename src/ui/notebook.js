// Cuaderno del barista: tendencias por sesión, generado como HTML.
// Funciones puras (datos → texto HTML) para poder probarlas sin navegador.

import { trend } from "../core/stats.js";

export const DISCLAIMER =
  "Barra Sepia entrena tareas concretas de atención y memoria dentro del juego. No es una herramienta médica ni garantiza mejoras en la vida diaria.";

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const METRICS = Object.freeze([
  {
    key: "accuracy",
    label: "Precisión",
    help: "Comandas servidas bien a la primera.",
    format: (v) => (v == null ? "—" : `${Math.round(v * 100)} %`),
    lowerIsBetter: false,
    tolerance: 0.05,
  },
  {
    key: "avgReactionMs",
    label: "Tiempo de reacción",
    help: "Desde que la comanda y la máquina están listas hasta tirar de la palanca.",
    format: (v) => (v == null ? "—" : `${(v / 1000).toFixed(1)} s`),
    lowerIsBetter: true,
    tolerance: 0.08,
  },
  {
    key: "inhibition",
    label: "Control inhibitorio",
    help: "Aciertos a la primera en comandas trampa (icono engañoso o comanda casi igual).",
    format: (v) => (v == null ? "—" : `${Math.round(v * 100)} %`),
    lowerIsBetter: false,
    tolerance: 0.05,
  },
]);

const DIRECTION_TEXT = {
  mejora: "Mejor que tus turnos anteriores",
  baja: "Por debajo de tus turnos anteriores",
  estable: "Estable",
  primera: "Primer dato",
  "sin-datos": "Sin datos todavía",
};

/**
 * Minigráfico SVG de una serie.
 * @param {number[]} values
 * @param {{ lowerIsBetter?: boolean }} [options]
 */
export function sparkline(values, options = {}) {
  const w = 168;
  const h = 44;
  const pad = 5;
  if (values.length === 0) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const x = (i) => (values.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (values.length - 1));
  // En tiempos, "arriba" debe ser mejor: se invierte el eje.
  const y = (v) => {
    const t = (v - min) / (max - min);
    return options.lowerIsBetter ? pad + t * (h - pad * 2) : h - pad - t * (h - pad * 2);
  };
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  const area = `${x(0).toFixed(1)},${h - 1} ${points} ${x(last).toFixed(1)},${h - 1}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <line class="spark-grid" x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}"/>
    ${values.length > 1 ? `<polygon class="spark-area" points="${area}"/>` : ""}
    ${values.length > 1 ? `<polyline class="spark-line" points="${points}"/>` : ""}
    <circle class="spark-dot" cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="4"/>
  </svg>`;
}

/**
 * Tarjetas de métricas con tendencia.
 * @param {Array<import("../core/stats.js").SessionSummary>} summaries  De la más antigua a la más reciente.
 */
export function metricCards(summaries) {
  return METRICS.map((m) => {
    const t = trend(summaries, m.key, { lowerIsBetter: m.lowerIsBetter, tolerance: m.tolerance });
    const values = t.values.slice(-12);
    return `<article class="metric metric-${escapeHtml(t.direction)}">
      <h3>${escapeHtml(m.label)}</h3>
      <p class="metric-value">${escapeHtml(m.format(t.last))}</p>
      <p class="metric-trend"><span class="chip">${escapeHtml(DIRECTION_TEXT[t.direction])}</span></p>
      ${sparkline(values, { lowerIsBetter: m.lowerIsBetter })}
      <p class="metric-help">${escapeHtml(m.help)}</p>
    </article>`;
  }).join("");
}

/**
 * @param {Array<import("../telemetry/store.js").SessionRecord>} records De la más antigua a la más reciente.
 * @param {{ persistent: boolean }} storage
 */
export function notebookHtml(records, storage) {
  const storageNote = storage.persistent
    ? ""
    : `<p class="note">Este navegador no permite guardar el historial: el Cuaderno se borrará al cerrar la página.</p>`;
  if (records.length === 0) {
    return `<p class="empty">Aún no hay turnos registrados. Juega uno y aquí verás tu precisión, tu tiempo de reacción y tu control inhibitorio, turno a turno.</p>
      ${storageNote}
      <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>`;
  }
  const summaries = records.map((r) => r.summary);
  const rows = records
    .slice(-10)
    .reverse()
    .map((r) => {
      const date = new Date(r.startedAt);
      const when = Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      return `<tr>
        <td>${escapeHtml(when)}</td>
        <td>${r.mode === "calma" ? "Calma" : "Normal"}</td>
        <td class="num">${escapeHtml(METRICS[0].format(r.summary.accuracy))}</td>
        <td class="num">${escapeHtml(METRICS[1].format(r.summary.avgReactionMs))}</td>
        <td class="num">${escapeHtml(METRICS[2].format(r.summary.inhibition))}</td>
        <td class="num">${escapeHtml(r.summary.served)}</td>
        <td class="num">${escapeHtml(r.summary.endLevel)}</td>
      </tr>`;
    })
    .join("");
  return `<div class="metrics">${metricCards(summaries)}</div>
    <h3 class="table-title">Últimos turnos</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Modo</th><th class="num">Precisión</th><th class="num">Reacción</th><th class="num">Inhibición</th><th class="num">Servidas</th><th class="num">Nivel</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note">La tendencia compara tu último turno con la media de hasta cinco turnos anteriores.</p>
    ${storageNote}
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>`;
}

/**
 * Resumen al cerrar un turno.
 * @param {import("../core/stats.js").SessionSummary} summary
 * @param {Array<import("../core/stats.js").SessionSummary>} history Incluye el turno actual al final.
 * @param {{ sessionsToday: number, recommended: number }} day
 */
export function summaryHtml(summary, history, day) {
  const details = [
    `Servidas: ${summary.served}`,
    `Perdidas: ${summary.missed}`,
    `Errores de configuración: ${summary.configErrors}`,
    `Extracciones fuera de zona: ${summary.gaugeErrors}`,
    `Nivel final: ${summary.endLevel}`,
    `Propinas: ${summary.tips}`,
  ];
  const remaining = Math.max(0, day.recommended - day.sessionsToday);
  const dayText =
    remaining > 0
      ? `Turno ${day.sessionsToday} de ${day.recommended} recomendados para hoy.`
      : `Jornada completa: ${day.sessionsToday} turnos hoy. Buen momento para descansar.`;
  return `<div class="metrics">${metricCards(history)}</div>
    <ul class="details">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
    <p class="day">${escapeHtml(dayText)}</p>`;
}
