import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../../src/core/catalog.js";

export const RECIPES_PATH = fileURLToPath(new URL("../../data/recipes.json", import.meta.url));

export function rawRecipes() {
  return JSON.parse(readFileSync(RECIPES_PATH, "utf8"));
}

export function realCatalog() {
  return loadCatalog(rawRecipes());
}
