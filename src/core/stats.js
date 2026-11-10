// Métricas del Cuaderno del barista, calculadas solo a partir de eventos.

/**
 * @typedef {Object} SessionSummary
 * @property {number} served
 * @property {number} correctFirst
 * @property {number|null} accuracy          correctFirst / served.
 * @property {number|null} avgReactionMs
 * @property {number|null} avgServiceMs
 * @property {number} trapResolved
 * @property {number} trapCorrect
 * @property {number|null} inhibition        trapCorrect / trapResolved.
 * @property {number} missed                 Omisiones.
 * @property {number} configErrors
 * @property {number} gaugeErrors
 * @property {number} brews
 * @property {number} tips
 * @property {number} startLevel
 * @property {number} endLevel
 * @property {number} maxLevel
 */

/** Tipos de evento que se guardan en el historial (el resto solo anima la vista). */
export const TELEMETRY_TYPES = Object.freeze([
  "session_start",
  "order_arrived",
  "order_hidden",
  "brew_start",
  "gauge_result",
  "order_served",
  "order_mismatch",
  "order_missed",
  "difficulty_change",
  "clean",
  "session_end",
]);

function mean(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function ratio(num, den) {
  return den > 0 ? Math.round((num / den) * 1000) / 1000 : null;
}

/**
 * @param {Array<{type: string, [key: string]: any}>} events
 * @returns {SessionSummary}
 */
export function summarize(events) {
  let served = 0;
  let correctFirst = 0;
  let trapResolved = 0;
  let trapCorrect = 0;
  let missed = 0;
  let configErrors = 0;
  let gaugeErrors = 0;
  let brews = 0;
  let tips = 0;
  let startLevel = 1;
  let endLevel = 1;
  let maxLevel = 1;
  const reactions = [];
  const services = [];

  for (const e of events) {
    switch (e.type) {
      case "session_start":
        startLevel = endLevel = maxLevel = e.level ?? 1;
        break;
      case "order_served":
        served += 1;
        tips += e.tip ?? 0;
        if (e.firstAttempt) correctFirst += 1;
        if (typeof e.reactionMs === "number") reactions.push(e.reactionMs);
        if (typeof e.serviceMs === "number") services.push(e.serviceMs);
        if (e.trap) {
          trapResolved += 1;
          if (e.firstAttempt) trapCorrect += 1;
        }
        break;
      case "order_missed":
        missed += 1;
        if (e.trap) trapResolved += 1;
        break;
      case "order_mismatch":
        configErrors += 1;
        break;
      case "gauge_result":
        brews += 1;
        if (!e.ok) gaugeErrors += 1;
        break;
      case "difficulty_change":
        endLevel = e.to;
        maxLevel = Math.max(maxLevel, e.to);
        break;
      default:
        break;
    }
  }

  return {
    served,
    correctFirst,
    accuracy: ratio(correctFirst, served),
    avgReactionMs: mean(reactions),
    avgServiceMs: mean(services),
    trapResolved,
    trapCorrect,
    inhibition: ratio(trapCorrect, trapResolved),
    missed,
    configErrors,
    gaugeErrors,
    brews,
    tips,
    startLevel,
    endLevel,
    maxLevel,
  };
}

/**
 * Tendencia de una métrica entre sesiones (de la más antigua a la más reciente).
 * Compara la última sesión con la media de hasta 5 anteriores.
 *
 * @param {Array<Record<string, any>>} summaries
 * @param {string} key
 * @param {{ lowerIsBetter?: boolean, tolerance?: number, window?: number }} [options]
 *   tolerance: diferencia relativa por debajo de la cual se considera "estable".
 */
export function trend(summaries, key, options = {}) {
  const { lowerIsBetter = false, tolerance = 0.05, window = 5 } = options;
  const values = summaries.map((s) => s?.[key]).filter((v) => typeof v === "number");
  if (values.length === 0) {
    return { values, last: null, previousMean: null, delta: null, direction: "sin-datos" };
  }
  const last = values[values.length - 1];
  const previous = values.slice(Math.max(0, values.length - 1 - window), values.length - 1);
  if (previous.length === 0) {
    return { values, last, previousMean: null, delta: null, direction: "primera" };
  }
  const previousMean = previous.reduce((a, b) => a + b, 0) / previous.length;
  const delta = last - previousMean;
  const scale = Math.max(Math.abs(previousMean), 1e-9);
  let direction = "estable";
  if (Math.abs(delta) / scale > tolerance) {
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    direction = better ? "mejora" : "baja";
  }
  return { values, last, previousMean, delta, direction };
}
