// Tamaño lógico del juego según la proporción de la pantalla (ver docs/DISENO.md §7).
//
// El lado corto mide 720 unidades. En pantallas alargadas (teléfonos) el lado largo
// crece hasta 1560/1600; en pantallas más cuadradas (tabletas) se fija el lado largo
// y se ensancha el corto, para no dejar franjas vacías.

/**
 * @param {number} width   Ancho disponible en píxeles CSS.
 * @param {number} height  Alto disponible en píxeles CSS.
 * @returns {{ width: number, height: number }}
 */
export function logicalSize(width, height) {
  if (!width || !height) return { width: 1280, height: 720 };
  if (height > width) {
    const h = Math.round((720 * height) / width);
    if (h >= 1280) return { width: 720, height: Math.min(h, 1560) };
    return { width: Math.min(960, Math.round((1280 * width) / height)), height: 1280 };
  }
  const w = Math.round((720 * width) / height);
  if (w >= 1200) return { width: Math.min(w, 1600), height: 720 };
  return { width: 1200, height: Math.min(900, Math.round((1200 * height) / width)) };
}
