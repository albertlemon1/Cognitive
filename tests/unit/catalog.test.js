import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, stepsFor, allowedModifiers, canonicalModifiers, CatalogError } from "../../src/core/catalog.js";
import { rawRecipes, realCatalog } from "./helpers.js";

test("el catálogo real valida: 6 bebidas, 4 modificadores, nivel Barrio", () => {
  const catalog = realCatalog();
  assert.equal(catalog.drinkOrder.length, 6);
  assert.deepEqual(catalog.modifierOrder, ["azucar", "doble", "avena", "llevar"]);
  assert.ok(catalog.levels.barrio);
  for (const id of catalog.drinkOrder) {
    const steps = stepsFor(catalog, id, []);
    assert.ok(steps.some((s) => s.gauge), `${id} debería tener un paso con manómetro`);
  }
});

test("las familias agrupan bebidas parecidas", () => {
  const catalog = realCatalog();
  assert.ok(catalog.families.leche.includes("cortado"));
  assert.ok(catalog.families.leche.includes("latte"));
  assert.ok(catalog.families.solo.includes("descafeinado"));
});

test("errores claros con la ruta del campo", () => {
  const broken = rawRecipes();
  broken.drinks.cortado.steps.push("teletransportar");
  assert.throws(() => loadCatalog(broken), (err) => {
    assert.ok(err instanceof CatalogError);
    assert.match(err.message, /drinks\.cortado\.steps\[3\]/);
    return true;
  });

  const badFill = rawRecipes();
  badFill.steps.leche.fill.name = "mercurio";
  assert.throws(() => loadCatalog(badFill), /steps\.leche\.fill\.name/);

  const badEffect = rawRecipes();
  badEffect.modifiers.azucar.effects[0].type = "teleport";
  assert.throws(() => loadCatalog(badEffect), /modifiers\.azucar\.effects\[0\]\.type/);

  const badWeight = rawRecipes();
  badWeight.levels.barrio.drinkWeights.unicornio = 2;
  assert.throws(() => loadCatalog(badWeight), /levels\.barrio\.drinkWeights\.unicornio/);

  assert.throws(() => loadCatalog(null), CatalogError);
});

test("una bebida nueva solo con datos funciona sin tocar código", () => {
  const raw = rawRecipes();
  raw.steps.vainilla = { label: "Vainilla", durationMs: 500, visual: "nuevo-efecto" };
  raw.drinks.vainilla_latte = {
    label: "Latte de vainilla",
    family: "leche",
    steps: ["vainilla", "moler", "extraer", "leche"],
    icon: { vessel: "tall", layers: ["espresso", "milk"], topping: null, mark: null },
  };
  const catalog = loadCatalog(raw);
  const steps = stepsFor(catalog, "vainilla_latte", ["avena"]);
  assert.deepEqual(steps.map((s) => s.id), ["vainilla", "moler", "extraer", "leche_avena"]);
  assert.equal(steps[0].visual, "nuevo-efecto");
});

test("stepsFor aplica appendStep, replaceStep y scaleStep en orden canónico", () => {
  const catalog = realCatalog();
  const base = stepsFor(catalog, "capuchino", []);
  assert.deepEqual(base.map((s) => s.id), ["moler", "extraer", "leche", "espuma", "cacao"]);

  // Orden de entrada desordenado a propósito: el resultado sigue el orden del catálogo.
  const all = stepsFor(catalog, "capuchino", ["llevar", "avena", "azucar", "doble"]);
  assert.deepEqual(all.map((s) => s.id), [
    "moler", "extraer", "leche_avena", "espuma_avena", "cacao", "azucar", "tapa",
  ]);
  const extraer = all.find((s) => s.id === "extraer");
  assert.equal(extraer.durationMs, Math.round(catalog.steps.extraer.durationMs * 1.4));
  assert.equal(extraer.label, "Extraer ×2");
  // stepsFor no modifica el catálogo.
  assert.equal(catalog.steps.extraer.label, "Extraer");
});

test("doble también escala la molienda descafeinada", () => {
  const catalog = realCatalog();
  const steps = stepsFor(catalog, "descafeinado", ["doble"]);
  assert.equal(steps[0].id, "moler_descaf");
  assert.equal(steps[0].durationMs, Math.round(catalog.steps.moler_descaf.durationMs * 1.5));
});

test("allowedModifiers: avena solo para bebidas con leche o espuma", () => {
  const catalog = realCatalog();
  assert.ok(allowedModifiers(catalog, "cortado").includes("avena"));
  assert.ok(allowedModifiers(catalog, "capuchino").includes("avena"));
  assert.ok(!allowedModifiers(catalog, "espresso").includes("avena"));
  assert.ok(allowedModifiers(catalog, "espresso").includes("azucar"));
  assert.deepEqual(allowedModifiers(catalog, "no-existe"), []);
});

test("canonicalModifiers ordena y elimina duplicados", () => {
  const catalog = realCatalog();
  assert.deepEqual(canonicalModifiers(catalog, ["llevar", "azucar", "llevar"]), ["azucar", "llevar"]);
});
