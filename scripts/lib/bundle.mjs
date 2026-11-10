// Bundler mínimo para el archivo único. Sin dependencias.
//
// Convierte los módulos ES del proyecto en un único script clásico (IIFE).
// Solo admite las convenciones de docs/DISENO.md §9.1; ante cualquier otra
// sintaxis de import/export falla con un mensaje claro en vez de adivinar.

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const IDENT = "[A-Za-z_$][\\w$]*";
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL_RE = new RegExp(`^export\\s+((?:async\\s+)?function\\s*\\*?\\s*(${IDENT})|class\\s+(${IDENT})|(?:const|let|var)\\s+(${IDENT})\\s*=)`, "gm");
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

export class BundleError extends Error {
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.name = "BundleError";
  }
}

/** @param {string} spec "a, b as c" */
function parseSpecifiers(spec, file) {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(new RegExp(`^(${IDENT})(?:\\s+as\\s+(${IDENT}))?$`));
      if (!m) throw new BundleError(file, `especificador no soportado: "${s}"`);
      return { imported: m[1], local: m[2] ?? m[1] };
    });
}

/**
 * @param {string} file Ruta absoluta.
 * @param {string} root Raíz del proyecto (para mensajes).
 */
export function parseModule(file, root) {
  const name = relative(root, file);
  let code = readFileSync(file, "utf8");

  /** @type {{ path: string, specifiers: {imported: string, local: string}[] }[]} */
  const imports = [];
  code = code.replace(IMPORT_RE, (_m, spec, from) => {
    imports.push({ path: resolve(dirname(file), from), specifiers: parseSpecifiers(spec, name) });
    return "";
  });
  // Las comprobaciones ignoran comentarios: JSDoc usa `import("./x.js").Tipo` en los tipos.
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  if (/^\s*import[\s{*"']/m.test(bare)) throw new BundleError(name, "import no soportado (usa `import { a } from \"./x.js\";`)");
  if (/\bimport\s*\(/.test(bare)) throw new BundleError(name, "import() dinámico no soportado");
  if (/\bimport\.meta\b/.test(bare)) throw new BundleError(name, "import.meta no soportado");
  if (/^export\s+default\b/m.test(code)) throw new BundleError(name, "export default no soportado");
  if (/^export\s*\*/m.test(code)) throw new BundleError(name, "export * no soportado");
  if (/^export\s+(?:const|let|var)\s*[[{]/m.test(code)) throw new BundleError(name, "export con desestructuración no soportado");

  /** @type {{ exported: string, local: string }[]} */
  const exports = [];
  code = code.replace(EXPORT_DECL_RE, (_m, decl, fnName, className, varName) => {
    const local = fnName ?? className ?? varName;
    exports.push({ exported: local, local });
    return decl;
  });
  code = code.replace(EXPORT_LIST_RE, (_m, spec) => {
    for (const s of parseSpecifiers(spec, name)) exports.push({ exported: s.local, local: s.imported });
    return "";
  });
  if (/^\s*export\b/m.test(code)) throw new BundleError(name, "export no soportado (usa `export function|class|const` al inicio de línea)");

  return { file, name, code, imports, exports };
}

/**
 * Empaqueta a partir de un módulo de entrada.
 * @param {string} entry Ruta absoluta del módulo de entrada.
 * @param {string} root Raíz del proyecto.
 * @returns {{ code: string, modules: string[] }}
 */
export function bundle(entry, root) {
  /** @type {Map<string, ReturnType<typeof parseModule>>} */
  const parsed = new Map();
  const order = [];
  const visiting = new Set();

  const visit = (file, chain) => {
    if (parsed.has(file) && !visiting.has(file)) return;
    if (visiting.has(file)) {
      throw new BundleError(relative(root, file), `dependencia circular: ${[...chain, file].map((f) => relative(root, f)).join(" → ")}`);
    }
    visiting.add(file);
    const mod = parseModule(file, root);
    parsed.set(file, mod);
    for (const imp of mod.imports) visit(imp.path, [...chain, file]);
    visiting.delete(file);
    order.push(file);
  };
  visit(resolve(entry), []);

  const ids = new Map(order.map((file, i) => [file, `__m${i}`]));
  const parts = [];
  for (const file of order) {
    const mod = parsed.get(file);
    const lines = [];
    for (const imp of mod.imports) {
      const dep = parsed.get(imp.path);
      for (const s of imp.specifiers) {
        if (!dep.exports.some((e) => e.exported === s.imported)) {
          throw new BundleError(mod.name, `"${s.imported}" no lo exporta ${dep.name}`);
        }
      }
      const destructure = imp.specifiers.map((s) => (s.imported === s.local ? s.local : `${s.imported}: ${s.local}`)).join(", ");
      lines.push(`const { ${destructure} } = ${ids.get(imp.path)};`);
    }
    const exportsObj = mod.exports.map((e) => (e.exported === e.local ? e.local : `${e.exported}: ${e.local}`)).join(", ");
    parts.push(
      `// ── ${mod.name} ──\nconst ${ids.get(file)} = (function () {\n${lines.join("\n")}\n${mod.code.trim()}\nreturn { ${exportsObj} };\n})();`,
    );
  }
  const code = `(function () {\n"use strict";\n${parts.join("\n\n")}\n})();\n`;
  return { code, modules: order.map((f) => relative(root, f)) };
}
