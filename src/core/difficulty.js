// Dificultad adaptativa: escalera con histéresis.
// Todo en este módulo es puro: mismas entradas, mismas salidas, sin efectos.

/**
 * @typedef {Object} DifficultyParams
 * @property {number} level
 * @property {number|null} exposureMs     Tiempo antes de voltear la comanda; null = siempre visible.
 * @property {number} maxConcurrent       Comandas simultáneas en el riel (1..3).
 * @property {number} zoneWidth           Ancho de la zona verde del manómetro (fracción de 0..1).
 * @property {number} distractorRate      Probabilidad de comanda trampa.
 * @property {number} maxModifiers        Modificadores máximos por orden.
 * @property {number} arrivalGapMs        Pausa mínima entre llegadas.
 * @property {number|null} patienceMs     Tiempo antes de perder la comanda; null = sin límite.
 * @property {number} drift               Intensidad de la deriva del manómetro (0..1).
 */

/**
 * @typedef {Object} DifficultyState
 * @property {number} level
 * @property {number} successStreak
 * @property {number} failStreak
 */

/**
 * @typedef {Object} DifficultyRules
 * @property {number} upAfter
 * @property {number} downAfter
 * @property {number} minLevel
 * @property {number} maxLevel
 */

/** @type {DifficultyRules} */
export const DEFAULT_RULES = Object.freeze({ upAfter: 3, downAfter: 2, minLevel: 1, maxLevel: 8 });

// Una fila por nivel. Ver docs/DISENO.md §5.5.
const TABLE = Object.freeze([
  { exposureMs: null, maxConcurrent: 1, zoneWidth: 0.4, distractorRate: 0.0, maxModifiers: 0, arrivalGapMs: 1500, patienceMs: 60000, drift: 0.3 },
  { exposureMs: null, maxConcurrent: 1, zoneWidth: 0.36, distractorRate: 0.05, maxModifiers: 1, arrivalGapMs: 1500, patienceMs: 55000, drift: 0.4 },
  { exposureMs: null, maxConcurrent: 2, zoneWidth: 0.33, distractorRate: 0.1, maxModifiers: 1, arrivalGapMs: 3000, patienceMs: 50000, drift: 0.5 },
  { exposureMs: 9000, maxConcurrent: 2, zoneWidth: 0.3, distractorRate: 0.15, maxModifiers: 2, arrivalGapMs: 3000, patienceMs: 46000, drift: 0.6 },
  { exposureMs: 7000, maxConcurrent: 2, zoneWidth: 0.27, distractorRate: 0.2, maxModifiers: 2, arrivalGapMs: 2800, patienceMs: 43000, drift: 0.7 },
  { exposureMs: 6000, maxConcurrent: 3, zoneWidth: 0.24, distractorRate: 0.25, maxModifiers: 2, arrivalGapMs: 2600, patienceMs: 40000, drift: 0.8 },
  { exposureMs: 5000, maxConcurrent: 3, zoneWidth: 0.21, distractorRate: 0.3, maxModifiers: 3, arrivalGapMs: 2400, patienceMs: 38000, drift: 0.9 },
  { exposureMs: 4000, maxConcurrent: 3, zoneWidth: 0.18, distractorRate: 0.35, maxModifiers: 3, arrivalGapMs: 2200, patienceMs: 35000, drift: 1.0 },
]);

export const MAX_LEVEL = TABLE.length;

/**
 * @param {number} level
 * @param {DifficultyRules} [rules]
 */
export function clampLevel(level, rules = DEFAULT_RULES) {
  const n = Number.isFinite(level) ? Math.round(level) : rules.minLevel;
  return Math.min(rules.maxLevel, Math.max(rules.minLevel, n));
}

/**
 * @param {number} [level]
 * @returns {DifficultyState}
 */
export function initialDifficulty(level = 1) {
  return { level: clampLevel(level), successStreak: 0, failStreak: 0 };
}

/**
 * Aplica un resultado a la escalera.
 * - "success": suma racha de éxitos; con `upAfter` seguidos sube un nivel.
 * - "fail": suma racha de fallos; con `downAfter` seguidos baja un nivel.
 * - "neutral": corta la racha de éxitos y no suma fallos.
 * Al cambiar de nivel ambos contadores vuelven a cero (histéresis).
 *
 * @param {DifficultyState} state
 * @param {"success"|"fail"|"neutral"} outcome
 * @param {DifficultyRules} [rules]
 * @returns {{ state: DifficultyState, changed: boolean, from: number, to: number }}
 */
export function updateDifficulty(state, outcome, rules = DEFAULT_RULES) {
  const from = state.level;
  let { level, successStreak, failStreak } = state;

  if (outcome === "success") {
    successStreak += 1;
    failStreak = 0;
  } else if (outcome === "fail") {
    failStreak += 1;
    successStreak = 0;
  } else {
    successStreak = 0;
  }

  if (successStreak >= rules.upAfter && level < rules.maxLevel) {
    level += 1;
    successStreak = 0;
    failStreak = 0;
  } else if (failStreak >= rules.downAfter && level > rules.minLevel) {
    level -= 1;
    successStreak = 0;
    failStreak = 0;
  }

  return { state: { level, successStreak, failStreak }, changed: level !== from, from, to: level };
}

/**
 * Parámetros de juego para un nivel.
 * @param {number} level
 * @param {{ calm?: boolean }} [options]
 * @returns {DifficultyParams}
 */
export function paramsFor(level, options = {}) {
  const lvl = clampLevel(level);
  const row = TABLE[lvl - 1];
  const params = { level: lvl, ...row };
  if (options.calm) {
    params.patienceMs = null;
    params.maxConcurrent = Math.min(params.maxConcurrent, 2);
    params.arrivalGapMs = Math.round(params.arrivalGapMs * 1.5);
    params.drift = Math.round(params.drift * 0.7 * 100) / 100;
  }
  return params;
}
