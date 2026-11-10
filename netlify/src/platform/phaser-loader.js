// Carga de Phaser desde CDN con respaldo. La versión vive solo aquí;
// el build comprueba que index.html use la misma.

export const PHASER_VERSION = "3.90.0";

export const PHASER_URLS = Object.freeze([
  `https://cdn.jsdelivr.net/npm/phaser@${PHASER_VERSION}/dist/phaser.min.js`,
  `https://unpkg.com/phaser@${PHASER_VERSION}/dist/phaser.min.js`,
  `https://cdnjs.cloudflare.com/ajax/libs/phaser/${PHASER_VERSION}/phaser.min.js`,
]);

function loadScript(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error(`Tiempo agotado: ${url}`));
    }, timeoutMs);
    script.src = url;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(`No cargó: ${url}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Devuelve el espacio de nombres Phaser, cargándolo si la etiqueta principal falló.
 * @returns {Promise<any>}
 */
export async function ensurePhaser(urls = PHASER_URLS, timeoutMs = 12000) {
  if (globalThis.Phaser) return globalThis.Phaser;
  // La primera URL ya la intentó la etiqueta <script> de la página.
  for (const url of urls.slice(1)) {
    try {
      await loadScript(url, timeoutMs);
      if (globalThis.Phaser) return globalThis.Phaser;
    } catch {
      // Probar el siguiente CDN.
    }
  }
  throw new Error("No se pudo cargar el motor gráfico (Phaser). Revisa tu conexión y recarga la página.");
}
