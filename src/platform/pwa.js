// Registro del service worker. Solo en la versión de Netlify (HTTPS, no archivo único).

/**
 * @param {{ single: boolean }} build
 */
export function registerServiceWorker(build) {
  if (build.single) return;
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:") return;
  const register = () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Sin service worker el juego funciona igual, solo sin modo sin conexión.
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
