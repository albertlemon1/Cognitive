import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { bundle, BundleError } from "../../scripts/lib/bundle.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "barra-bundle-"));
  for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, name), code);
  return dir;
}

test("el código real se empaqueta y es JavaScript válido", () => {
  const { code, modules } = bundle(join(ROOT, "src/main.js"), ROOT);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.ok(modules.includes("src/core/session.js"));
  assert.equal(modules[modules.length - 1], "src/main.js");
  assert.ok(!/^\s*import\s/m.test(code), "no quedan import");
  assert.ok(!/^export\s/m.test(code), "no quedan export");
});

test("ejecuta módulos en orden, con alias y listas de exportación", () => {
  const dir = project({
    "a.js": "export const base = 2;\nexport function twice(x) { return x * base; }\nconst hidden = 5;\nexport { hidden as five };\n",
    "b.js": 'import { twice as dbl, five } from "./a.js";\nexport class Calc { run() { return dbl(five); } }\n',
    "main.js": 'import { Calc } from "./b.js";\nglobalThis.result = new Calc().run();\n',
  });
  const { code } = bundle(join(dir, "main.js"), dir);
  const context = {};
  vm.runInNewContext(code, context);
  assert.equal(context.result, 10);
});

test("los tipos JSDoc con import() no se confunden con import dinámico", () => {
  const dir = project({
    "a.js": "/** @param {import(\"./b.js\").T} x */\nexport function f(x) { return x; }\n",
    "main.js": 'import { f } from "./a.js";\nglobalThis.r = f(1);\n',
  });
  assert.doesNotThrow(() => bundle(join(dir, "main.js"), dir));
});

test("rechaza sintaxis no soportada con un mensaje claro", () => {
  const cases = {
    "export default 1;\n": /export default/,
    'import x from "./y.js";\n': /import no soportado/,
    'const m = import("./y.js");\n': /import\(\) dinámico/,
    'export * from "./y.js";\n': /export \*/,
    "export const { a } = obj;\n": /desestructuración/,
  };
  for (const [source, message] of Object.entries(cases)) {
    const dir = project({ "main.js": source });
    assert.throws(() => bundle(join(dir, "main.js"), dir), (err) => err instanceof BundleError && message.test(err.message), source);
  }
});

test("detecta dependencias circulares y nombres que no se exportan", () => {
  const cyclic = project({
    "a.js": 'import { b } from "./b.js";\nexport const a = 1;\n',
    "b.js": 'import { a } from "./a.js";\nexport const b = 2;\n',
  });
  assert.throws(() => bundle(join(cyclic, "a.js"), cyclic), /circular/);

  const missing = project({
    "a.js": "export const a = 1;\n",
    "main.js": 'import { nope } from "./a.js";\n',
  });
  assert.throws(() => bundle(join(missing, "main.js"), missing), /"nope" no lo exporta/);
});
