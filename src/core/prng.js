// Generador pseudoaleatorio determinista (mulberry32).
// Toda la aleatoriedad del juego pasa por aquí para que una sesión
// pueda reproducirse a partir de su semilla.

/**
 * @typedef {Object} Rng
 * @property {() => number} next              Flotante en [0, 1).
 * @property {(min: number, max: number) => number} int  Entero en [min, max].
 * @property {(p: number) => boolean} chance  Verdadero con probabilidad p.
 * @property {<T>(items: T[]) => T} pick      Elemento uniforme de una lista no vacía.
 * @property {<T>(items: T[], weightOf: (item: T) => number) => T} weighted
 * @property {<T>(items: T[]) => T[]} shuffle Copia barajada (Fisher-Yates).
 * @property {() => number} getState          Estado interno, para reanudar.
 */

/**
 * Crea un generador a partir de una semilla entera de 32 bits.
 * @param {number} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    if (max < min) throw new RangeError(`int(${min}, ${max}): max < min`);
    return min + Math.floor(next() * (max - min + 1));
  }

  function chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return next() < p;
  }

  function pick(items) {
    if (!items.length) throw new RangeError("pick() de una lista vacía");
    return items[Math.floor(next() * items.length)];
  }

  function weighted(items, weightOf) {
    if (!items.length) throw new RangeError("weighted() de una lista vacía");
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) return pick(items);
    let roll = next() * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  return { next, int, chance, pick, weighted, shuffle, getState: () => state };
}

/**
 * Hash FNV-1a de 32 bits: convierte un texto en semilla.
 * @param {string} text
 * @returns {number}
 */
export function seedFromString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
