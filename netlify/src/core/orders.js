// Generación de comandas y comparación con la bebida preparada.

import { allowedModifiers, canonicalModifiers } from "./catalog.js";

/**
 * @typedef {Object} OrderSpec
 * @property {string} drinkId
 * @property {string[]} modifiers   En orden canónico.
 */

/**
 * @typedef {Object} Order
 * @property {number} id            Número visible en la comanda ("#7").
 * @property {string} drinkId
 * @property {string[]} modifiers
 * @property {string} iconDrinkId   Igual a drinkId salvo en la trampa "icono".
 * @property {null|"icono"|"parecida"} trap
 */

/**
 * @typedef {Object} OrderDiff
 * @property {boolean} ok
 * @property {boolean} drinkOk
 * @property {string} expectedDrinkId
 * @property {string} producedDrinkId
 * @property {string[]} missing     Modificadores pedidos que no se pusieron.
 * @property {string[]} extra       Modificadores puestos que no se pidieron.
 */

/**
 * @param {OrderSpec} a
 * @param {OrderSpec} b
 */
export function sameSpec(a, b) {
  if (a.drinkId !== b.drinkId || a.modifiers.length !== b.modifiers.length) return false;
  const set = new Set(a.modifiers);
  return b.modifiers.every((m) => set.has(m));
}

/**
 * @param {OrderSpec} expected
 * @param {OrderSpec} produced
 * @returns {OrderDiff}
 */
export function compareOrder(expected, produced) {
  const want = new Set(expected.modifiers);
  const got = new Set(produced.modifiers);
  const missing = expected.modifiers.filter((m) => !got.has(m));
  const extra = produced.modifiers.filter((m) => !want.has(m));
  const drinkOk = expected.drinkId === produced.drinkId;
  return {
    ok: drinkOk && missing.length === 0 && extra.length === 0,
    drinkOk,
    expectedDrinkId: expected.drinkId,
    producedDrinkId: produced.drinkId,
    missing,
    extra,
  };
}

/**
 * Crea la fábrica de comandas de una sesión.
 * @param {{ catalog: import("./catalog.js").Catalog, rng: import("./prng.js").Rng, levelId: string }} options
 */
export function createOrderFactory({ catalog, rng, levelId }) {
  const level = catalog.levels[levelId];
  if (!level) throw new Error(`Nivel inexistente: ${levelId}`);
  let counter = 0;

  const drinkWeight = (id) => level.drinkWeights[id] ?? 1;
  const modifierWeight = (id) => level.modifierWeights[id] ?? 1;

  function pickModifiers(drinkId, max) {
    const allowed = allowedModifiers(catalog, drinkId);
    const count = rng.int(0, Math.min(max, allowed.length));
    const chosen = [];
    let pool = allowed.slice();
    for (let i = 0; i < count; i++) {
      const m = rng.weighted(pool, modifierWeight);
      chosen.push(m);
      pool = pool.filter((x) => x !== m);
    }
    return canonicalModifiers(catalog, chosen);
  }

  function siblingsOf(drinkId) {
    const family = catalog.families[catalog.drinks[drinkId].family] ?? [];
    return family.filter((id) => id !== drinkId);
  }

  function lookAlikeIcon(drinkId) {
    const siblings = siblingsOf(drinkId);
    if (siblings.length) return rng.pick(siblings);
    return rng.pick(catalog.drinkOrder.filter((id) => id !== drinkId));
  }

  /** Variante de una comanda pendiente que difiere en un solo detalle. */
  function lookAlikeSpec(base, maxModifiers) {
    const options = [];
    for (const sibling of siblingsOf(base.drinkId)) {
      const allowed = new Set(allowedModifiers(catalog, sibling));
      options.push({ drinkId: sibling, modifiers: base.modifiers.filter((m) => allowed.has(m)) });
    }
    if (maxModifiers > 0) {
      for (const m of allowedModifiers(catalog, base.drinkId)) {
        const has = base.modifiers.includes(m);
        if (has) {
          options.push({ drinkId: base.drinkId, modifiers: base.modifiers.filter((x) => x !== m) });
        } else if (base.modifiers.length < maxModifiers) {
          options.push({ drinkId: base.drinkId, modifiers: canonicalModifiers(catalog, [...base.modifiers, m]) });
        }
      }
    }
    return options;
  }

  /**
   * @param {import("./difficulty.js").DifficultyParams} params
   * @param {Order[]} pending   Comandas que siguen en el riel.
   * @returns {Order}
   */
  function next(params, pending) {
    counter += 1;
    const id = counter;

    if (rng.chance(params.distractorRate)) {
      if (pending.length > 0 && rng.chance(0.5)) {
        const base = rng.pick(pending);
        const options = lookAlikeSpec(base, params.maxModifiers).filter(
          (spec) => !pending.some((p) => sameSpec(p, spec)),
        );
        if (options.length) {
          const spec = rng.pick(options);
          return { id, drinkId: spec.drinkId, modifiers: spec.modifiers, iconDrinkId: spec.drinkId, trap: "parecida" };
        }
      }
      const drinkId = rng.weighted(catalog.drinkOrder, drinkWeight);
      return {
        id,
        drinkId,
        modifiers: pickModifiers(drinkId, params.maxModifiers),
        iconDrinkId: lookAlikeIcon(drinkId),
        trap: "icono",
      };
    }

    const drinkId = rng.weighted(catalog.drinkOrder, drinkWeight);
    return { id, drinkId, modifiers: pickModifiers(drinkId, params.maxModifiers), iconDrinkId: drinkId, trap: null };
  }

  /**
   * Comanda fija (práctica guiada): sin trampas y con modificadores en orden canónico.
   * @param {{ drinkId: string, modifiers?: string[] }} spec
   * @returns {Order}
   */
  function fromSpec(spec) {
    if (!(spec.drinkId in catalog.drinks)) throw new Error(`Bebida inexistente: ${spec.drinkId}`);
    for (const m of spec.modifiers ?? []) {
      if (!(m in catalog.modifiers)) throw new Error(`Modificador inexistente: ${m}`);
    }
    counter += 1;
    return {
      id: counter,
      drinkId: spec.drinkId,
      modifiers: canonicalModifiers(catalog, spec.modifiers ?? []),
      iconDrinkId: spec.drinkId,
      trap: null,
    };
  }

  return { next, fromSpec, get issued() { return counter; } };
}
