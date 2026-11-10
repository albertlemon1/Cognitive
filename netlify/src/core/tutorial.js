// Práctica guiada: decide qué indicar al jugador a partir del estado de la sesión.
// Se deriva del estado (no de una secuencia fija), así que se adapta si el jugador
// se equivoca, cambia de bebida o activa un extra de más.

import { gaugeZone } from "./gauge.js";

/** En la práctica la extracción dura casi el doble, para aprender a manejar la presión. */
export const PRACTICE_GAUGE_SCALE = 1.8;

/** Comandas de la práctica: una sencilla y otra con un extra. */
export const PRACTICE_ORDERS = Object.freeze([
  Object.freeze({ drinkId: "cortado", modifiers: Object.freeze([]) }),
  Object.freeze({ drinkId: "capuchino", modifiers: Object.freeze(["azucar"]) }),
]);

/**
 * @typedef {Object} PracticeStep
 * @property {string} id         wait | drink | modifier | lever | brewing | gauge | deliver | done
 * @property {string} title
 * @property {string} text
 * @property {string[]} targets  Controles a señalar: "drink:x", "mod:x", "lever", "pressure", "gauge", "plaque", "ticket:N".
 * @property {"below"|"in"|"above"|null} zone
 */

/**
 * @param {any} state  Resultado de session.getState().
 * @param {import("./catalog.js").Catalog} catalog
 * @param {{ keyHints?: boolean, total?: number }} [options]
 * @returns {PracticeStep|null}
 */
export function practiceStep(state, catalog, options = {}) {
  if (!state) return null;
  const total = options.total ?? PRACTICE_ORDERS.length;
  const keys = !!options.keyHints;
  const m = state.machine;
  const order = state.orders[0];
  const step = (id, text, targets = [], zone = null) => {
    const n = order ? Math.min(order.id, total) : Math.min(total, total - (state.scriptRemaining ?? 0));
    return { id, title: `Práctica guiada · comanda ${Math.max(1, n)} de ${total}`, text, targets, zone };
  };

  if (!order) {
    if (state.scriptRemaining === 0 && m.phase === "idle") {
      return { id: "done", title: "Práctica guiada", text: "¡Práctica completada! Ya sabes atender la barra.", targets: [], zone: null };
    }
    return step("wait", "Espera un momento: una comanda está por llegar al riel.");
  }

  const label = (id) => catalog.drinks[id].label;
  const modLabel = (id) => catalog.modifiers[id].label;

  if (m.phase === "ready") {
    return step("deliver", `¡Lista! Toca la comanda No. ${order.id} para entregarla.`, [`ticket:${order.id}`]);
  }

  if (m.phase === "brewing") {
    const current = m.steps[m.stepIndex];
    if (current && current.gauge) {
      const zone = gaugeZone(m.gauge);
      const hold = keys ? "Mantén pulsado PRESIÓN (o la barra espaciadora)" : "Mantén pulsado PRESIÓN";
      const text =
        zone === "in"
          ? "¡En la zona! Da toques cortos para mantener la aguja ahí hasta que termine."
          : zone === "above"
            ? "Suelta PRESIÓN: la aguja baja sola. Vuelve a pulsar cuando entre en la zona."
            : `${hold} para subir la aguja hasta la franja turquesa.`;
      return step("gauge", text, ["gauge", "pressure"], zone);
    }
    return step("brewing", "La máquina prepara la receta paso a paso. Mira las luces y la placa.", ["plaque"]);
  }

  // Máquina libre: configurar.
  if (m.selectedDrink !== order.drinkId) {
    return step("drink", `Lee la comanda: piden ${label(order.drinkId)}. Toca esa tecla en la consola.`, [`ticket:${order.id}`, `drink:${order.drinkId}`]);
  }
  const missing = order.modifiers.find((x) => !m.modifiers.includes(x));
  if (missing) {
    return step("modifier", `La comanda lleva ${modLabel(missing)}: activa ese interruptor.`, [`mod:${missing}`]);
  }
  const extra = m.modifiers.find((x) => !order.modifiers.includes(x));
  if (extra) {
    return step("modifier", `Esta comanda no lleva ${modLabel(extra)}: apaga ese interruptor.`, [`mod:${extra}`]);
  }
  return step("lever", keys ? "Todo listo. Tira de la palanca PREPARAR (o pulsa Enter)." : "Todo listo. Tira de la palanca PREPARAR.", ["lever"]);
}
