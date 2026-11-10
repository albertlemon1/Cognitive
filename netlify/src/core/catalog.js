// Catálogo de bebidas, pasos y modificadores.
// Valida data/recipes.json y calcula la receta final de cada orden.

/**
 * @typedef {Object} FillDef
 * @property {string} name
 * @property {string} color
 * @property {number} amount   Fracción del recipiente (0..1).
 */

/**
 * @typedef {Object} StepDef
 * @property {string} id
 * @property {string} label
 * @property {number} durationMs
 * @property {string} visual    Animación de la máquina; si es desconocida se usa la genérica.
 * @property {boolean} gauge    Si el paso usa el manómetro.
 * @property {FillDef|null} fill
 * @property {string|null} color
 * @property {string|null} variant
 */

/**
 * @typedef {Object} Effect
 * @property {"appendStep"|"replaceStep"|"scaleStep"} type
 * @property {string} [step]
 * @property {string} [from]
 * @property {string} [to]
 * @property {number} [factor]
 * @property {string} [labelSuffix]
 */

/**
 * @typedef {Object} ModifierDef
 * @property {string} id
 * @property {string} label
 * @property {string} short     Etiqueta corta para comandas.
 * @property {string} icon
 * @property {string|null} key
 * @property {string[]|null} requiresAnyStep
 * @property {Effect[]} effects
 */

/**
 * @typedef {Object} DrinkIcon
 * @property {string} vessel
 * @property {string[]} layers   Nombres de `fills`.
 * @property {string|null} topping
 * @property {string|null} mark
 */

/**
 * @typedef {Object} DrinkDef
 * @property {string} id
 * @property {string} label
 * @property {string} family
 * @property {string[]} steps
 * @property {DrinkIcon} icon
 */

/**
 * @typedef {Object} LevelDef
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {number} startLevel
 * @property {Record<string, number>} drinkWeights
 * @property {Record<string, number>} modifierWeights
 */

/**
 * @typedef {Object} Catalog
 * @property {number} version
 * @property {Record<string, string>} fills
 * @property {Record<string, StepDef>} steps
 * @property {Record<string, ModifierDef>} modifiers
 * @property {string[]} modifierOrder   Orden canónico (el del JSON).
 * @property {Record<string, DrinkDef>} drinks
 * @property {string[]} drinkOrder
 * @property {Record<string, LevelDef>} levels
 * @property {Record<string, string[]>} families
 */

export class CatalogError extends Error {
  /**
   * @param {string} path
   * @param {string} message
   */
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "CatalogError";
    this.path = path;
  }
}

const EFFECT_TYPES = ["appendStep", "replaceStep", "scaleStep"];
const HEX = /^#[0-9a-fA-F]{6}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) throw new CatalogError(path, "debe ser un objeto");
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new CatalogError(path, "debe ser un texto no vacío");
  return value;
}

function requirePositive(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new CatalogError(path, "debe ser un número mayor que 0");
  }
  return value;
}

function requireColor(value, path) {
  if (typeof value !== "string" || !HEX.test(value)) throw new CatalogError(path, "debe ser un color #rrggbb");
  return value;
}

/**
 * Valida y normaliza el JSON de recetas.
 * @param {unknown} json
 * @returns {Catalog}
 */
export function loadCatalog(json) {
  const root = requireObject(json, "recipes");
  const version = root.version ?? 1;

  const fills = {};
  for (const [name, color] of Object.entries(requireObject(root.fills ?? {}, "fills"))) {
    fills[name] = requireColor(color, `fills.${name}`);
  }

  /** @type {Record<string, StepDef>} */
  const steps = {};
  for (const [id, raw] of Object.entries(requireObject(root.steps, "steps"))) {
    const path = `steps.${id}`;
    requireObject(raw, path);
    let fill = null;
    if (raw.fill != null) {
      requireObject(raw.fill, `${path}.fill`);
      const name = requireString(raw.fill.name, `${path}.fill.name`);
      if (!(name in fills)) throw new CatalogError(`${path}.fill.name`, `"${name}" no existe en fills`);
      const amount = requirePositive(raw.fill.amount, `${path}.fill.amount`);
      if (amount > 1) throw new CatalogError(`${path}.fill.amount`, "debe estar entre 0 y 1");
      fill = { name, color: fills[name], amount };
    }
    steps[id] = {
      id,
      label: requireString(raw.label, `${path}.label`),
      durationMs: requirePositive(raw.durationMs, `${path}.durationMs`),
      visual: typeof raw.visual === "string" ? raw.visual : "generic",
      gauge: raw.gauge === true,
      fill,
      color: raw.color != null ? requireColor(raw.color, `${path}.color`) : null,
      variant: typeof raw.variant === "string" ? raw.variant : null,
    };
  }

  /** @type {Record<string, ModifierDef>} */
  const modifiers = {};
  const modifierOrder = [];
  for (const [id, raw] of Object.entries(requireObject(root.modifiers, "modifiers"))) {
    const path = `modifiers.${id}`;
    requireObject(raw, path);
    if (!Array.isArray(raw.effects) || raw.effects.length === 0) {
      throw new CatalogError(`${path}.effects`, "debe ser una lista con al menos un efecto");
    }
    const effects = raw.effects.map((effect, i) => validateEffect(effect, `${path}.effects[${i}]`, steps));
    let requiresAnyStep = null;
    if (raw.requiresAnyStep != null) {
      if (!Array.isArray(raw.requiresAnyStep)) throw new CatalogError(`${path}.requiresAnyStep`, "debe ser una lista");
      requiresAnyStep = raw.requiresAnyStep.map((s, i) => {
        if (!(s in steps)) throw new CatalogError(`${path}.requiresAnyStep[${i}]`, `paso "${s}" no existe`);
        return s;
      });
    }
    modifiers[id] = {
      id,
      label: requireString(raw.label, `${path}.label`),
      short: typeof raw.short === "string" && raw.short.trim() ? raw.short : raw.label,
      icon: typeof raw.icon === "string" ? raw.icon : "generic",
      key: typeof raw.key === "string" ? raw.key : null,
      requiresAnyStep,
      effects,
    };
    modifierOrder.push(id);
  }

  /** @type {Record<string, DrinkDef>} */
  const drinks = {};
  const drinkOrder = [];
  /** @type {Record<string, string[]>} */
  const families = {};
  for (const [id, raw] of Object.entries(requireObject(root.drinks, "drinks"))) {
    const path = `drinks.${id}`;
    requireObject(raw, path);
    if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
      throw new CatalogError(`${path}.steps`, "debe ser una lista con al menos un paso");
    }
    raw.steps.forEach((s, i) => {
      if (!(s in steps)) throw new CatalogError(`${path}.steps[${i}]`, `paso "${s}" no existe`);
    });
    const icon = requireObject(raw.icon, `${path}.icon`);
    const layers = Array.isArray(icon.layers) ? icon.layers : [];
    layers.forEach((layer, i) => {
      if (!(layer in fills)) throw new CatalogError(`${path}.icon.layers[${i}]`, `"${layer}" no existe en fills`);
    });
    const family = typeof raw.family === "string" ? raw.family : "otros";
    drinks[id] = {
      id,
      label: requireString(raw.label, `${path}.label`),
      family,
      steps: raw.steps.slice(),
      icon: {
        vessel: typeof icon.vessel === "string" ? icon.vessel : "cup",
        layers: layers.slice(),
        topping: typeof icon.topping === "string" ? icon.topping : null,
        mark: typeof icon.mark === "string" ? icon.mark : null,
      },
    };
    drinkOrder.push(id);
    (families[family] ??= []).push(id);
  }
  if (drinkOrder.length < 2) throw new CatalogError("drinks", "se necesitan al menos 2 bebidas");

  /** @type {Record<string, LevelDef>} */
  const levels = {};
  for (const [id, raw] of Object.entries(requireObject(root.levels, "levels"))) {
    const path = `levels.${id}`;
    requireObject(raw, path);
    const drinkWeights = {};
    for (const [drinkId, w] of Object.entries(requireObject(raw.drinkWeights ?? {}, `${path}.drinkWeights`))) {
      if (!(drinkId in drinks)) throw new CatalogError(`${path}.drinkWeights.${drinkId}`, "bebida inexistente");
      drinkWeights[drinkId] = requirePositive(w, `${path}.drinkWeights.${drinkId}`);
    }
    const modifierWeights = {};
    for (const [modId, w] of Object.entries(requireObject(raw.modifierWeights ?? {}, `${path}.modifierWeights`))) {
      if (!(modId in modifiers)) throw new CatalogError(`${path}.modifierWeights.${modId}`, "modificador inexistente");
      modifierWeights[modId] = requirePositive(w, `${path}.modifierWeights.${modId}`);
    }
    levels[id] = {
      id,
      label: requireString(raw.label, `${path}.label`),
      description: typeof raw.description === "string" ? raw.description : "",
      startLevel: Number.isInteger(raw.startLevel) ? raw.startLevel : 1,
      drinkWeights,
      modifierWeights,
    };
  }
  if (Object.keys(levels).length === 0) throw new CatalogError("levels", "se necesita al menos un nivel");

  return { version, fills, steps, modifiers, modifierOrder, drinks, drinkOrder, levels, families };
}

function validateEffect(effect, path, steps) {
  requireObject(effect, path);
  if (!EFFECT_TYPES.includes(effect.type)) {
    throw new CatalogError(`${path}.type`, `debe ser uno de: ${EFFECT_TYPES.join(", ")}`);
  }
  const checkStep = (key) => {
    const id = requireString(effect[key], `${path}.${key}`);
    if (!(id in steps)) throw new CatalogError(`${path}.${key}`, `paso "${id}" no existe`);
    return id;
  };
  if (effect.type === "appendStep") return { type: "appendStep", step: checkStep("step") };
  if (effect.type === "replaceStep") return { type: "replaceStep", from: checkStep("from"), to: checkStep("to") };
  return {
    type: "scaleStep",
    step: checkStep("step"),
    factor: requirePositive(effect.factor, `${path}.factor`),
    labelSuffix: typeof effect.labelSuffix === "string" ? effect.labelSuffix : "",
  };
}

/**
 * Modificadores que tienen sentido para una bebida (por ejemplo, avena solo si lleva leche).
 * @param {Catalog} catalog
 * @param {string} drinkId
 * @returns {string[]}
 */
export function allowedModifiers(catalog, drinkId) {
  const drink = catalog.drinks[drinkId];
  if (!drink) return [];
  return catalog.modifierOrder.filter((modId) => {
    const req = catalog.modifiers[modId].requiresAnyStep;
    return !req || req.some((s) => drink.steps.includes(s));
  });
}

/**
 * Ordena y depura una lista de modificadores según el orden canónico del catálogo.
 * @param {Catalog} catalog
 * @param {Iterable<string>} modifiers
 * @returns {string[]}
 */
export function canonicalModifiers(catalog, modifiers) {
  const set = new Set(modifiers);
  return catalog.modifierOrder.filter((id) => set.has(id));
}

/**
 * Receta final: pasos de la bebida con los efectos de los modificadores aplicados.
 * @param {Catalog} catalog
 * @param {string} drinkId
 * @param {Iterable<string>} modifiers
 * @returns {StepDef[]}
 */
export function stepsFor(catalog, drinkId, modifiers) {
  const drink = catalog.drinks[drinkId];
  if (!drink) throw new CatalogError(`drinks.${drinkId}`, "bebida inexistente");
  let steps = drink.steps.map((id) => ({ ...catalog.steps[id] }));
  for (const modId of canonicalModifiers(catalog, modifiers)) {
    for (const effect of catalog.modifiers[modId].effects) {
      if (effect.type === "appendStep") {
        steps.push({ ...catalog.steps[effect.step] });
      } else if (effect.type === "replaceStep") {
        steps = steps.map((s) => (s.id === effect.from ? { ...catalog.steps[effect.to] } : s));
      } else {
        steps = steps.map((s) =>
          s.id === effect.step
            ? { ...s, durationMs: Math.round(s.durationMs * effect.factor), label: s.label + effect.labelSuffix }
            : s,
        );
      }
    }
  }
  return steps;
}
