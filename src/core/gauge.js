// Manómetro de extracción: tarea de atención sostenida.
// La aguja sube mientras se sostiene la presión, baja al soltar
// y una deriva aleatoria la empuja. Hay que mantenerla en la zona.

/**
 * @typedef {Object} GaugeParams
 * @property {number} zoneWidth   Ancho de la zona (fracción de 0..1).
 * @property {number} drift       Intensidad de la deriva (0..1).
 */

/**
 * @typedef {Object} GaugeState
 * @property {number} value        Posición de la aguja (0..1).
 * @property {number} zoneMin
 * @property {number} zoneMax
 * @property {boolean} held
 * @property {number} elapsedMs
 * @property {number} scoredMs     Tiempo evaluado (tras el margen de gracia).
 * @property {number} inZoneMs
 * @property {boolean} inZone
 */

export const GAUGE = Object.freeze({
  risePerSec: 0.62,
  fallPerSec: 0.42,
  graceMs: 700,
  startValue: 0.12,
  goodQuality: 0.6,
  excellentQuality: 0.85,
  driftPerSec: 0.55,
});

export class Gauge {
  /**
   * @param {import("./prng.js").Rng} rng
   * @param {GaugeParams} params
   */
  constructor(rng, params) {
    this.rng = rng;
    this.params = params;
    const half = params.zoneWidth / 2;
    // El centro de la zona cambia en cada extracción para que no se automatice.
    const center = 0.45 + rng.next() * 0.25;
    this.zoneMin = Math.max(0.05, center - half);
    this.zoneMax = Math.min(0.95, center + half);
    this.value = GAUGE.startValue;
    this.velocity = 0;
    this.held = false;
    this.elapsedMs = 0;
    this.scoredMs = 0;
    this.inZoneMs = 0;
  }

  /** @param {boolean} held */
  setHeld(held) {
    this.held = !!held;
  }

  /** @param {number} dtMs */
  tick(dtMs) {
    // Pasos de como máximo 50 ms para que el resultado no dependa de la tasa de cuadros.
    let remaining = Math.max(0, dtMs);
    while (remaining > 0) {
      const step = Math.min(50, remaining);
      remaining -= step;
      this._step(step);
    }
  }

  _step(dtMs) {
    const dt = dtMs / 1000;
    const push = this.held ? GAUGE.risePerSec : -GAUGE.fallPerSec;
    // Deriva tipo Ornstein-Uhlenbeck: ruido suavizado que tira hacia los bordes.
    const noise = (this.rng.next() - 0.5) * 2;
    this.velocity = this.velocity * 0.92 + noise * GAUGE.driftPerSec * this.params.drift * 0.35;
    this.value = Math.min(1, Math.max(0, this.value + (push + this.velocity) * dt));
    this.elapsedMs += dtMs;
    if (this.elapsedMs > GAUGE.graceMs) {
      this.scoredMs += dtMs;
      if (this.isInZone()) this.inZoneMs += dtMs;
    }
  }

  isInZone() {
    return this.value >= this.zoneMin && this.value <= this.zoneMax;
  }

  /** Calidad de la extracción (0..1). */
  quality() {
    if (this.scoredMs <= 0) return 0;
    return Math.round((this.inZoneMs / this.scoredMs) * 1000) / 1000;
  }

  /** @returns {GaugeState} */
  snapshot() {
    return {
      value: this.value,
      zoneMin: this.zoneMin,
      zoneMax: this.zoneMax,
      held: this.held,
      elapsedMs: this.elapsedMs,
      scoredMs: this.scoredMs,
      inZoneMs: this.inZoneMs,
      inZone: this.isInZone(),
    };
  }
}

/**
 * Posición de la aguja respecto de la zona.
 * @param {GaugeState|null|undefined} gauge
 * @returns {"below"|"in"|"above"|null}
 */
export function gaugeZone(gauge) {
  if (!gauge) return null;
  if (gauge.value < gauge.zoneMin) return "below";
  if (gauge.value > gauge.zoneMax) return "above";
  return "in";
}
