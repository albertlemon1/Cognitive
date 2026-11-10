// Servidor estático mínimo para desarrollo y pruebas. Sin dependencias.
// Uso: node scripts/serve.mjs [carpeta] [puerto]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * @param {string} root
 * @param {number} [port] 0 = puerto libre.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function startServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = normalize(join(base, decodeURIComponent(url.pathname)));
      if (path !== base && !path.startsWith(base + sep)) {
        res.writeHead(403).end("Prohibido");
        return;
      }
      const info = await stat(path).catch(() => null);
      if (info?.isDirectory()) path = join(path, "index.html");
      const body = await readFile(path);
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolvePromise({
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? ".";
  const port = Number(process.argv[3] ?? 8080);
  startServer(root, port).then(({ url }) => console.log(`Sirviendo ${resolve(root)} en ${url}`));
}
