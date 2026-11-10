// La máquina de café: protagonista del juego.
// Estilo "manguera de goma": ojos de pastel, piernas flexibles, rebote constante.
// Muestra la receta paso a paso (lámparas), el manómetro y la taza llenándose.

import { COLORS, CSS, FONTS, hexToNum } from "./palette.js";
import { drawCup, drawModifierIcon, iconSpec, fitText, textStyle } from "./draw.js";
import { gaugeZone } from "../core/gauge.js";

export const MACHINE_W = 600;
export const MACHINE_H = 520;

const CX = 300;
const GAUGE = { x: 300, y: 104, r: 64 };
const GAUGE_START = (-215 * Math.PI) / 180;
const GAUGE_SWEEP = (250 * Math.PI) / 180;
const CUP = { x: 300, base: 458, size: 74 };
const EYES = [{ x: 252, y: 200 }, { x: 348, y: 200 }];
const LAMPS_Y = 336;
const SPOUT = { x: 300, y: 392 };
const WAND = { x: 372, y: 408 };

/**
 * @typedef {Object} MachineOptions
 * @property {boolean} reducedMotion
 * @property {boolean} colorBlind
 * @property {boolean} largeText
 */

export class MachineView {
  /**
   * @param {Phaser.Scene} scene
   * @param {import("../core/catalog.js").Catalog} catalog
   * @param {MachineOptions} options
   */
  constructor(scene, catalog, options) {
    this.scene = scene;
    this.catalog = catalog;
    this.options = { ...options };
    this.time = 0;
    this.mood = "smile";
    this.moodUntil = 0;
    this.blinkAt = 2500;
    this.blinkUntil = 0;
    this.look = { x: 0, y: 0 };
    this.lastCupKey = "";
    this.lastPlaqueKey = "";
    this.lastLampsKey = "";
    this.crankAngle = 0;
    this.hop = 0;
    this.shakeX = 0;
    this.particles = [];

    this.root = scene.add.container(0, 0);
    this.legs = scene.add.graphics();
    this.body = scene.add.container(0, 0);
    this.root.add([this.legs, this.body]);

    this.bodyArt = scene.add.graphics();
    this.crank = scene.add.graphics();
    this.hoppers = scene.add.graphics();
    this.gaugeArt = scene.add.graphics();
    this.face = scene.add.graphics();
    this.plaque = scene.add.graphics();
    this.lamps = scene.add.graphics();
    this.stream = scene.add.graphics();
    this.cup = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.arms = scene.add.graphics();

    this.plaqueText = scene.add.text(CX, 268, "", textStyle(22, { font: FONTS.type, color: CSS.ink, align: "center" })).setOrigin(0.5);
    this.gaugeLabel = scene.add.text(GAUGE.x, GAUGE.y + GAUGE.r * 0.38, "PRESIÓN", textStyle(13, { font: FONTS.body, color: CSS.ink, bold: true, align: "center" })).setOrigin(0.5);

    this.body.add([
      this.arms,
      this.bodyArt,
      this.hoppers,
      this.crank,
      this.gaugeArt,
      this.gaugeLabel,
      this.face,
      this.plaque,
      this.plaqueText,
      this.lamps,
      this.stream,
      this.cup,
      this.fx,
    ]);
    this.crank.setPosition(132, 98);
    this.drawStatic();
  }

  /** @param {Partial<MachineOptions>} options */
  setOptions(options) {
    Object.assign(this.options, options);
    this.lastPlaqueKey = "";
    this.lastLampsKey = "";
    this.drawStatic();
  }

  drawStatic() {
    const g = this.bodyArt;
    g.clear();

    // Corona cromada con el manómetro.
    g.fillStyle(COLORS.black, 0.3);
    g.fillEllipse(CX + 6, 150, 330, 190);
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillEllipse(CX, 146, 326, 186);
    g.fillStyle(COLORS.chrome, 1);
    g.fillEllipse(CX, 144, 312, 172);
    g.fillStyle(COLORS.chromeLight, 0.8);
    g.fillEllipse(CX - 60, 104, 120, 40);

    // Remate de latón.
    g.fillStyle(COLORS.brassDark, 1);
    g.fillRect(CX - 8, 22, 16, 26);
    g.fillCircle(CX, 20, 15);
    g.fillStyle(COLORS.brass, 1);
    g.fillCircle(CX - 3, 17, 11);
    g.fillStyle(COLORS.brassLight, 1);
    g.fillCircle(CX - 6, 13, 4);

    // Cuerpo esmaltado.
    g.fillStyle(COLORS.black, 0.3);
    g.fillRoundedRect(136, 150, 340, 334, 34);
    g.fillStyle(COLORS.tealDark, 1);
    g.fillRoundedRect(128, 140, 344, 338, 34);
    g.fillStyle(COLORS.teal, 1);
    g.fillRoundedRect(134, 144, 332, 326, 30);
    g.fillStyle(COLORS.tealLight, 0.45);
    g.fillRoundedRect(150, 152, 26, 300, 13);
    // Bandas cromadas.
    for (const y of [150]) {
      g.fillStyle(COLORS.chromeDark, 1);
      g.fillRect(134, y, 332, 10);
      g.fillStyle(COLORS.chromeLight, 1);
      g.fillRect(134, y, 332, 4);
    }
    // Remaches.
    for (const x of [150, 450]) {
      for (const y of [176, 296, 440]) {
        g.fillStyle(COLORS.tealDark, 1);
        g.fillCircle(x, y, 5);
        g.fillStyle(COLORS.chromeLight, 0.7);
        g.fillCircle(x - 1, y - 1, 2.5);
      }
    }

    // Grupo y portafiltro.
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRoundedRect(CX - 44, 364, 88, 26, 8);
    g.fillStyle(COLORS.chrome, 1);
    g.fillRoundedRect(CX - 40, 364, 80, 18, 7);
    g.fillStyle(COLORS.black, 1);
    g.fillRect(CX + 38, 372, 64, 10);
    g.fillStyle(COLORS.brick, 1);
    g.fillRoundedRect(CX + 96, 366, 34, 22, 10);
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRect(CX - 12, 388, 24, 8);

    // Bandeja de goteo.
    g.fillStyle(COLORS.black, 0.35);
    g.fillRoundedRect(CX - 104, 456, 208, 18, 6);
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRoundedRect(CX - 106, 452, 212, 16, 6);
    g.fillStyle(COLORS.chrome, 1);
    g.fillRoundedRect(CX - 104, 452, 208, 9, 5);
    g.lineStyle(2, COLORS.chromeDark, 1);
    for (let x = CX - 92; x <= CX + 92; x += 14) g.lineBetween(x, 454, x, 460);

    // Placa del nombre.
    this.plaque.clear();
    this.plaque.fillStyle(COLORS.brassDark, 1);
    this.plaque.fillRoundedRect(CX - 112, 248, 224, 42, 10);
    this.plaque.fillStyle(COLORS.cream, 1);
    this.plaque.fillRoundedRect(CX - 108, 252, 216, 34, 8);

    this.drawHoppers(false, false);
    this.drawCrank();
    this.drawGauge(null);
  }

  drawHoppers(grinding, decaf) {
    const g = this.hoppers;
    g.clear();
    const jiggle = (on) => (on && !this.options.reducedMotion ? Math.sin(this.time / 30) * 1.5 : 0);
    // Tolva principal (izquierda).
    const lx = 176 + jiggle(grinding && !decaf);
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRect(lx - 22, 120, 44, 26);
    g.fillStyle(0xe7efe9, 0.9);
    g.fillPoints([{ x: lx - 42, y: 56 }, { x: lx + 42, y: 56 }, { x: lx + 22, y: 122 }, { x: lx - 22, y: 122 }], true);
    g.fillStyle(0x4a2a17, 1);
    for (let i = 0; i < 16; i++) {
      const bx = lx - 26 + ((i * 13) % 52);
      const by = 86 + ((i * 7) % 30);
      g.fillEllipse(bx, by, 10, 7);
    }
    g.lineStyle(3, COLORS.ink, 1);
    g.strokePoints([{ x: lx - 42, y: 56 }, { x: lx + 42, y: 56 }, { x: lx + 22, y: 122 }, { x: lx - 22, y: 122 }], true);
    g.fillStyle(COLORS.chrome, 1);
    g.fillRoundedRect(lx - 46, 48, 92, 12, 6);
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeRoundedRect(lx - 46, 48, 92, 12, 6);

    // Tolva de descafeinado (derecha, banda verde).
    const rx = 428 + jiggle(grinding && decaf);
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRect(rx - 16, 124, 32, 22);
    g.fillStyle(0xe7efe9, 0.9);
    g.fillPoints([{ x: rx - 30, y: 76 }, { x: rx + 30, y: 76 }, { x: rx + 16, y: 126 }, { x: rx - 16, y: 126 }], true);
    g.fillStyle(0x6b4a2e, 1);
    for (let i = 0; i < 9; i++) g.fillEllipse(rx - 16 + ((i * 11) % 32), 100 + ((i * 5) % 20), 8, 6);
    g.fillStyle(COLORS.decaf, 1);
    g.fillRect(rx - 26, 86, 52, 10);
    g.lineStyle(3, COLORS.ink, 1);
    g.strokePoints([{ x: rx - 30, y: 76 }, { x: rx + 30, y: 76 }, { x: rx + 16, y: 126 }, { x: rx - 16, y: 126 }], true);
    g.fillStyle(COLORS.chrome, 1);
    g.fillRoundedRect(rx - 34, 70, 68, 10, 5);
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeRoundedRect(rx - 34, 70, 68, 10, 5);
  }

  drawCrank() {
    const g = this.crank;
    g.clear();
    g.lineStyle(6, COLORS.ink, 1);
    g.lineBetween(0, 0, 0, -26);
    g.lineBetween(0, -26, 16, -26);
    g.fillStyle(COLORS.brick, 1);
    g.fillCircle(18, -26, 7);
    g.fillStyle(COLORS.brass, 1);
    g.fillCircle(0, 0, 6);
  }

  /** @param {import("../core/gauge.js").GaugeState|null} gauge */
  drawGauge(gauge, active = false) {
    const g = this.gaugeArt;
    g.clear();
    const { x, y, r } = GAUGE;
    // Durante la extracción, todo el manómetro cambia de color según la aguja:
    // turquesa dentro de la zona, ladrillo fuera. El texto da la misma pista sin color.
    const zone = active ? gaugeZone(gauge) : null;
    const inZone = zone === "in";
    const outColor = 0xe0896c;

    g.fillStyle(COLORS.black, 0.35);
    g.fillCircle(x + 3, y + 4, r + 12);
    if (zone) {
      const pulse = this.options.reducedMotion ? 0.45 : 0.3 + 0.25 * Math.sin(this.time / 120);
      g.fillStyle(inZone ? COLORS.tealLight : outColor, pulse);
      g.fillCircle(x, y, r + 24);
    }
    g.fillStyle(COLORS.brassDark, 1);
    g.fillCircle(x, y, r + 12);
    g.fillStyle(zone ? (inZone ? COLORS.tealLight : outColor) : COLORS.brass, 1);
    g.fillCircle(x, y, r + 8);
    g.fillStyle(COLORS.cream, 1);
    g.fillCircle(x, y, r);

    const angleAt = (v) => GAUGE_START + GAUGE_SWEEP * v;
    if (gauge) {
      // Zona objetivo.
      const a0 = angleAt(gauge.zoneMin);
      const a1 = angleAt(gauge.zoneMax);
      const zoneColor = this.options.colorBlind ? 0x3b6fb6 : inZone ? 0x3fa596 : COLORS.teal;
      g.fillStyle(zoneColor, 0.9);
      g.slice(x, y, r - 4, a0, a1, false);
      g.fillPath();
      g.fillStyle(COLORS.cream, 1);
      g.fillCircle(x, y, r - 22);
      if (this.options.colorBlind) {
        g.lineStyle(3, COLORS.ink, 1);
        for (const a of [a0, a1]) {
          g.lineBetween(x + Math.cos(a) * (r - 24), y + Math.sin(a) * (r - 24), x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
        }
      }
    }
    // Marcas.
    g.lineStyle(2, COLORS.ink, 1);
    for (let i = 0; i <= 10; i++) {
      const a = angleAt(i / 10);
      const inner = i % 5 === 0 ? r - 14 : r - 8;
      g.lineBetween(x + Math.cos(a) * inner, y + Math.sin(a) * inner, x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    }
    // Zona roja final.
    g.lineStyle(5, COLORS.brick, 1);
    g.beginPath();
    g.arc(x, y, r - 4, angleAt(0.9), angleAt(1), false);
    g.strokePath();

    // Aguja.
    const value = gauge ? gauge.value : 0;
    const a = angleAt(value);
    g.lineStyle(zone ? 5 : 4, zone ? (inZone ? COLORS.tealDark : COLORS.brick) : COLORS.brickDark, 1);
    g.lineBetween(x, y, x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8));
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(x, y, 7);
    g.fillStyle(COLORS.brass, 1);
    g.fillCircle(x, y, 3);

    // Indicación en el centro del manómetro: qué hacer ahora.
    let label = "PRESIÓN";
    let color = CSS.ink;
    if (zone === "in") {
      label = "EN ZONA";
      color = CSS.tealDark;
    } else if (zone === "below") {
      label = "PULSA";
      color = CSS.brickDark;
    } else if (zone === "above") {
      label = "SUELTA";
      color = CSS.brickDark;
    }
    if (zone === "below" || zone === "above") {
      // Flecha: hacia dónde debe ir la aguja.
      const ay = y + r * 0.72;
      const dir = zone === "below" ? -1 : 1;
      g.fillStyle(COLORS.brickDark, 1);
      g.fillTriangle(x - 7, ay - dir * 4, x + 7, ay - dir * 4, x, ay + dir * 5);
    } else if (zone === "in") {
      g.fillStyle(COLORS.tealDark, 1);
      g.fillCircle(x, y + r * 0.72, 5);
    }
    const key = `${label}|${color}`;
    if (key !== this.gaugeLabelKey) {
      this.gaugeLabelKey = key;
      this.gaugeLabel.setText(label);
      this.gaugeLabel.setColor(color);
      this.gaugeLabel.setFontSize(zone ? 16 : 13);
    }
  }

  /**
   * Dibuja el estado de la máquina. Se llama cada cuadro.
   * @param {import("../core/machine.js").MachineState|null} state
   * @param {number} dtMs
   */
  update(state, dtMs) {
    this.time += dtMs;
    const rm = this.options.reducedMotion;
    const phase = state?.phase ?? "idle";
    const step = state && state.stepIndex >= 0 ? state.steps[state.stepIndex] : null;
    const brewing = phase === "brewing";

    // Rebote: más vivo mientras trabaja.
    const bounceSpeed = brewing ? 140 : 380;
    const bounceAmp = rm ? 0 : brewing ? 4 : 3;
    const bounce = Math.sin(this.time / bounceSpeed) * bounceAmp;
    this.hop = Math.max(0, this.hop - dtMs * 0.06);
    const bodyY = bounce - this.hop;
    this.body.setPosition(this.shakeX, bodyY);
    this.drawLegs(bodyY);

    // Molino.
    const grinding = brewing && step?.visual === "grind";
    if (grinding && !rm) this.crankAngle += dtMs * 0.02;
    this.crank.setRotation(this.crankAngle);
    if (grinding || this._wasGrinding) this.drawHoppers(grinding, step?.variant === "decaf");
    this._wasGrinding = grinding;

    // Manómetro.
    const gaugeActive = brewing && !!step?.gauge;
    this.drawGauge(gaugeActive ? state.gauge : null, gaugeActive);

    // Placa y lámparas.
    this.updatePlaque(state);
    this.updateLamps(state);

    // Taza.
    this.updateCup(state);

    // Chorro y efectos del paso actual.
    this.updateStream(state, step);
    this.updateParticles(dtMs);

    // Cara.
    this.updateFace(state, step, gaugeActive);
  }

  drawLegs(bodyY) {
    const g = this.legs;
    g.clear();
    const hipY = 470 + bodyY;
    const squash = Math.max(-6, Math.min(10, bodyY));
    for (const side of [-1, 1]) {
      const hipX = CX + side * 70;
      const footX = CX + side * 96;
      const footY = 502;
      const kneeX = hipX + side * (14 + squash * 1.2);
      const kneeY = (hipY + footY) / 2;
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(hipX, hipY),
        new Phaser.Math.Vector2(kneeX, kneeY),
        new Phaser.Math.Vector2(footX, footY),
      );
      const pts = curve.getPoints(14);
      g.lineStyle(20, COLORS.ink, 1);
      g.strokePoints(pts, false);
      g.lineStyle(13, COLORS.tealDark, 1);
      g.strokePoints(pts, false);
      // Zapato.
      g.fillStyle(COLORS.black, 0.35);
      g.fillEllipse(footX + side * 12, footY + 14, 84, 14);
      g.fillStyle(COLORS.ink, 1);
      g.fillEllipse(footX + side * 12, footY + 4, 76, 30);
      g.fillStyle(COLORS.brickDark, 1);
      g.fillEllipse(footX + side * 12, footY + 1, 68, 24);
      g.fillStyle(COLORS.white, 0.35);
      g.fillEllipse(footX + side * 20, footY - 5, 22, 7);
    }
  }

  updatePlaque(state) {
    const drinkId = state?.selectedDrink ?? null;
    const mods = state?.modifiers ?? [];
    const phase = state?.phase ?? "idle";
    const step = phase === "brewing" && state.stepIndex >= 0 ? state.steps[state.stepIndex] : null;
    const key = `${drinkId}|${mods.join(",")}|${phase}|${step?.label}|${this.options.largeText}|${this.options.colorBlind}`;
    if (key === this.lastPlaqueKey) return;
    this.lastPlaqueKey = key;
    // La placa muestra la bebida elegida; mientras prepara, el paso en curso.
    let label = drinkId ? this.catalog.drinks[drinkId].label.toUpperCase() : "ELIGE UNA BEBIDA";
    let color = drinkId ? CSS.ink : "#8a755c";
    if (phase === "brewing") {
      label = step ? `${step.label.toUpperCase()}…` : "…";
      color = CSS.brickDark;
    } else if (phase === "ready") {
      label = "¡LISTO!";
      color = CSS.tealDark;
    }
    this.plaqueText.setText(label);
    this.plaqueText.setColor(color);
    fitText(this.plaqueText, 206, 30, drinkId ? 24 : 17, 11);

    // Lámparas de modificadores bajo la placa.
    const g = this.plaque;
    g.clear();
    g.fillStyle(COLORS.brassDark, 1);
    g.fillRoundedRect(CX - 112, 248, 224, 42, 10);
    g.fillStyle(COLORS.cream, 1);
    g.fillRoundedRect(CX - 108, 252, 216, 34, 8);
    const ids = this.catalog.modifierOrder;
    const spacing = 52;
    const startX = CX - ((ids.length - 1) * spacing) / 2;
    ids.forEach((id, i) => {
      const on = mods.includes(id);
      const x = startX + i * spacing;
      const y = 306;
      g.fillStyle(COLORS.tealDark, 1);
      g.fillCircle(x, y, 13);
      g.fillStyle(on ? COLORS.glow : COLORS.chromeDark, 1);
      g.fillCircle(x, y, 10);
      if (on) drawModifierIcon(g, this.catalog.modifiers[id].icon, x, y, 15);
      else if (this.options.colorBlind) {
        g.lineStyle(2, COLORS.ink, 0.6);
        g.lineBetween(x - 5, y, x + 5, y);
      }
    });
  }

  updateLamps(state) {
    const steps = state?.steps ?? [];
    const idx = state?.stepIndex ?? -1;
    const phase = state?.phase ?? "idle";
    const blink = Math.floor(this.time / 260) % 2;
    const key = `${steps.map((s) => s.id).join(",")}|${idx}|${phase}|${phase === "brewing" ? blink : 0}`;
    if (key === this.lastLampsKey) return;
    this.lastLampsKey = key;
    const g = this.lamps;
    g.clear();
    const n = Math.max(steps.length, 1);
    const spacing = Math.min(40, 280 / n);
    const startX = CX - ((n - 1) * spacing) / 2;
    g.fillStyle(COLORS.tealDark, 1);
    g.fillRoundedRect(CX - 150, LAMPS_Y - 16, 300, 32, 16);
    for (let i = 0; i < n; i++) {
      const x = startX + i * spacing;
      let color = COLORS.chromeDark;
      if (steps.length) {
        if (phase === "ready" || i < idx) color = COLORS.mustard;
        else if (i === idx) color = blink || this.options.reducedMotion ? COLORS.glow : COLORS.mustardLight;
        else color = 0x6d7f7a;
      }
      g.fillStyle(COLORS.ink, 1);
      g.fillCircle(x, LAMPS_Y, 11);
      g.fillStyle(color, 1);
      g.fillCircle(x, LAMPS_Y, 8);
      if (i === idx && phase === "brewing") {
        g.fillStyle(COLORS.white, 0.7);
        g.fillCircle(x - 2, LAMPS_Y - 3, 3);
      }
    }
  }

  updateCup(state) {
    const phase = state?.phase ?? "idle";
    if (phase === "idle" || !state?.selectedDrink) {
      if (this.lastCupKey !== "none") {
        this.cup.clear();
        this.lastCupKey = "none";
      }
      return;
    }
    const steps = state.steps;
    const idx = phase === "ready" ? steps.length : state.stepIndex;
    const progress = phase === "ready" ? 1 : state.stepProgress;
    const key = `${state.selectedDrink}|${state.modifiers.join(",")}|${idx}|${Math.round(progress * 30)}`;
    if (key === this.lastCupKey) return;
    this.lastCupKey = key;

    const icon = this.catalog.drinks[state.selectedDrink].icon;
    const togo = state.modifiers.includes("llevar");
    /** @type {import("./draw.js").CupSpec} */
    const spec = { vessel: togo ? "togo" : icon.vessel, layers: [], toppings: [], mark: icon.mark, lid: false };
    for (let i = 0; i < steps.length && i <= idx; i++) {
      const s = steps[i];
      const f = i < idx ? 1 : progress;
      if (f <= 0) continue;
      if (s.fill) spec.layers.push({ color: hexToNum(s.fill.color), amount: s.fill.amount * f });
      if (f >= 0.6) {
        if (s.visual === "dust") {
          spec.toppings.push("dust");
          if (s.color) spec.dustColor = hexToNum(s.color);
        } else if (s.visual === "art") spec.toppings.push("heart");
        else if (s.visual === "ice") spec.toppings.push("ice");
        else if (s.visual === "sugar") spec.toppings.push("sugar");
        else if (s.visual === "lid") spec.lid = true;
      }
    }
    this.cup.clear();
    if (phase === "ready") {
      const pulse = this.options.reducedMotion ? 0.5 : 0.35 + 0.25 * Math.sin(this.time / 160);
      this.cup.fillStyle(COLORS.glow, pulse);
      this.cup.fillEllipse(CUP.x, CUP.base - CUP.size * 0.42, CUP.size * 1.6, CUP.size * 1.3);
      this.lastCupKey += `|${Math.round(this.time / 60)}`;
    }
    this.cupGeo = drawCup(this.cup, spec, CUP.x, CUP.base, CUP.size);
  }

  updateStream(state, step) {
    const g = this.stream;
    g.clear();
    if (!state || state.phase !== "brewing" || !step || !this.cupGeo) return;
    const surfaceY = this.cupGeo.topY + 6;
    const rm = this.options.reducedMotion;
    const wobble = rm ? 0 : Math.sin(this.time / 50) * 1.2;
    const fillColor = step.fill ? hexToNum(step.fill.color) : null;
    if (step.visual === "pour" || step.visual === "water" || step.visual === "syrup") {
      const width = step.visual === "pour" ? 7 : 5;
      g.fillStyle(fillColor ?? COLORS.ink, 1);
      g.fillRect(SPOUT.x - width / 2 + wobble, SPOUT.y, width, Math.max(0, surfaceY - SPOUT.y));
      if (!rm) {
        g.fillStyle(COLORS.white, 0.3);
        g.fillRect(SPOUT.x - 1 + wobble, SPOUT.y, 1.5, Math.max(0, surfaceY - SPOUT.y));
      }
    } else if (step.visual === "steam") {
      this.emit("steam", WAND.x, WAND.y, 0.35);
    } else if (step.visual === "dust" || step.visual === "ice" || step.visual === "sugar" || step.visual === "cream" || step.visual === "lid" || step.visual === "art") {
      const color = step.visual === "dust" && step.color ? hexToNum(step.color) : step.visual === "ice" ? 0xdff1f2 : COLORS.white;
      this.emit("drop", CUP.x + (Math.random() - 0.5) * 30, SPOUT.y + 6, step.visual === "dust" ? 0.5 : 0.12, color);
    } else if (step.visual !== "grind") {
      this.emit("steam", CUP.x, SPOUT.y + 10, 0.15);
    }
  }

  /** Partículas simples (vapor, gotas, humo). */
  emit(kind, x, y, rate, color = COLORS.steam) {
    if (this.options.reducedMotion && kind !== "smoke") return;
    if (Math.random() > rate) return;
    this.particles.push({
      kind,
      x,
      y,
      vx: kind === "steam" ? (Math.random() - 0.3) * 0.03 : kind === "smoke" ? (Math.random() - 0.5) * 0.06 : 0,
      vy: kind === "drop" ? 0.18 : -0.05 - Math.random() * 0.04,
      r: kind === "drop" ? 3 : 6 + Math.random() * 6,
      life: 0,
      max: kind === "drop" ? 380 : 900,
      color,
    });
  }

  updateParticles(dtMs) {
    const g = this.fx;
    g.clear();
    const keep = [];
    for (const p of this.particles) {
      p.life += dtMs;
      if (p.life >= p.max) continue;
      if (p.life < 0) {
        keep.push(p);
        continue;
      }
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      const t = p.life / p.max;
      if (p.kind === "drop") {
        g.fillStyle(p.color, 1);
        g.fillCircle(p.x, p.y, p.r);
      } else {
        g.fillStyle(p.kind === "smoke" ? 0x8c8579 : p.color, (1 - t) * (p.kind === "smoke" ? 0.8 : 0.6));
        g.fillCircle(p.x, p.y, p.r * (1 + t * 1.4));
      }
      keep.push(p);
    }
    this.particles = keep;
  }

  updateFace(state, step, gaugeActive) {
    const g = this.face;
    g.clear();
    const phase = state?.phase ?? "idle";
    if (this.time > this.moodUntil) this.mood = "smile";

    // Hacia dónde mira.
    let target = { x: Math.sin(this.time / 1700) * 0.6, y: Math.cos(this.time / 2300) * 0.3 };
    if (gaugeActive) target = { x: 0, y: -1 };
    else if (phase === "brewing") target = { x: 0, y: 1 };
    else if (phase === "ready") target = { x: Math.sin(this.time / 500) * 0.9, y: -0.9 };
    const k = this.options.reducedMotion ? 1 : 0.15;
    this.look.x += (target.x - this.look.x) * k;
    this.look.y += (target.y - this.look.y) * k;

    // Parpadeo.
    if (this.time > this.blinkAt) {
      this.blinkUntil = this.time + 120;
      this.blinkAt = this.time + 2500 + ((this.time * 7) % 3000);
    }
    const blinking = this.time < this.blinkUntil && !this.options.reducedMotion;
    const worried = gaugeActive && state?.gauge && !state.gauge.inZone && state.gauge.elapsedMs > 700;

    for (const eye of EYES) {
      g.fillStyle(COLORS.ink, 1);
      g.fillEllipse(eye.x, eye.y, 58, blinking ? 10 : 72);
      g.fillStyle(COLORS.white, 1);
      g.fillEllipse(eye.x, eye.y, 50, blinking ? 4 : 64);
      if (!blinking) {
        const px = eye.x + this.look.x * 10;
        const py = eye.y + this.look.y * 16;
        // Pupila "de pastel" con la porción recortada, típica de los dibujos de los 30.
        g.fillStyle(COLORS.ink, 1);
        g.fillEllipse(px, py, 20, 32);
        g.fillStyle(COLORS.white, 1);
        g.slice(px, py, 12, -Math.PI * 0.62, -Math.PI * 0.38, false);
        g.fillPath();
      }
      // Cejas.
      g.lineStyle(6, COLORS.ink, 1);
      const browY = eye.y - 42 - (phase === "ready" ? 6 : 0);
      const tilt = worried || this.mood === "cough" ? (eye.x < CX ? 6 : -6) : 0;
      g.lineBetween(eye.x - 18, browY + tilt, eye.x + 18, browY - tilt);
    }

    // Boca.
    const mouthY = 238;
    g.lineStyle(6, COLORS.ink, 1);
    if (this.mood === "cough") {
      g.fillStyle(COLORS.ink, 1);
      g.fillEllipse(CX, mouthY, 22, 18);
    } else if (this.mood === "grin") {
      g.fillStyle(COLORS.ink, 1);
      g.slice(CX, mouthY - 8, 26, 0.15, Math.PI - 0.15, false);
      g.fillPath();
      g.fillStyle(COLORS.brick, 1);
      g.fillEllipse(CX, mouthY + 10, 18, 8);
    } else if (worried) {
      g.beginPath();
      g.moveTo(CX - 22, mouthY);
      for (let i = 0; i <= 8; i++) g.lineTo(CX - 22 + i * 5.5, mouthY + (i % 2 ? -4 : 4));
      g.strokePath();
    } else {
      g.beginPath();
      g.arc(CX, mouthY - 14, 20, 0.35, Math.PI - 0.35, false);
      g.strokePath();
    }

    // Brazos de manguera: lanza de vapor (derecha) y brazo con guante (izquierda).
    this.drawArms(state, step);
  }

  drawArms(state, step) {
    const g = this.arms;
    g.clear();
    const t = this.time;
    const rm = this.options.reducedMotion;
    const steaming = state?.phase === "brewing" && step?.visual === "steam";
    const wave = this.mood === "grin" && !rm ? Math.sin(t / 90) * 18 : 0;

    const hose = (pts, color) => {
      g.lineStyle(16, COLORS.ink, 1);
      g.strokePoints(pts, false);
      g.lineStyle(10, color, 1);
      g.strokePoints(pts, false);
    };
    const bez = (a, b, c) =>
      new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a[0], a[1]),
        new Phaser.Math.Vector2(b[0], b[1]),
        new Phaser.Math.Vector2(c[0], c[1]),
      ).getPoints(16);

    // Lanza de vapor.
    const jitter = steaming && !rm ? Math.sin(t / 40) * 3 : 0;
    hose(bez([462, 300], [540, 360 + jitter], [WAND.x + 12, WAND.y - 4]), COLORS.chromeDark);
    g.fillStyle(COLORS.chrome, 1);
    g.fillRoundedRect(WAND.x - 6, WAND.y - 12, 22, 14, 5);
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeRoundedRect(WAND.x - 6, WAND.y - 12, 22, 14, 5);

    // Brazo izquierdo con guante blanco.
    const hand = [92, 352 - wave];
    hose(bez([140, 300], [88 - wave * 0.3, 300], hand), COLORS.tealDark);
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(hand[0], hand[1], 19);
    g.fillStyle(COLORS.white, 1);
    g.fillCircle(hand[0], hand[1], 15);
    g.fillStyle(COLORS.white, 1);
    g.fillEllipse(hand[0] - 14, hand[1] - 8, 12, 18);
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeEllipse(hand[0] - 14, hand[1] - 8, 12, 18);
    g.lineStyle(2, COLORS.ink, 0.6);
    g.lineBetween(hand[0] - 4, hand[1] - 6, hand[0] - 4, hand[1] + 6);
    g.lineBetween(hand[0] + 4, hand[1] - 6, hand[0] + 4, hand[1] + 6);
  }

  // --- Reacciones ---------------------------------------------------------

  celebrate() {
    this.mood = "grin";
    this.moodUntil = this.time + 1400;
    if (!this.options.reducedMotion) this.hop = 26;
  }

  cough() {
    this.mood = "cough";
    this.moodUntil = this.time + 1300;
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        kind: "smoke",
        x: CX + (Math.random() - 0.5) * 60,
        y: 46,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.04 - Math.random() * 0.05,
        r: 8 + Math.random() * 8,
        life: i * -60,
        max: 1100,
        color: 0x8c8579,
      });
    }
    if (this.options.reducedMotion) return;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 520,
      onUpdate: (tw) => {
        const v = tw.getValue();
        this.shakeX = Math.sin(v * Math.PI * 8) * 9 * (1 - v);
      },
      onComplete: () => {
        this.shakeX = 0;
      },
    });
  }

  worry() {
    this.mood = "smile";
  }

  /** Punto del mundo donde está la taza (para animaciones de entrega). */
  cupWorldPoint() {
    return this.localToWorld(CUP.x, CUP.base - CUP.size * 0.5);
  }

  /** Centro del manómetro en coordenadas del mundo. */
  gaugeWorldPoint() {
    return { ...this.localToWorld(GAUGE.x, GAUGE.y), radius: (GAUGE.r + 14) * this.root.scaleX };
  }

  /** Placa del nombre (y del paso en curso) en coordenadas del mundo. */
  plaqueWorldPoint() {
    return { ...this.localToWorld(CX, 270), radius: 120 * this.root.scaleX };
  }

  localToWorld(x, y) {
    const s = this.root.scaleX;
    return { x: this.root.x + x * s, y: this.root.y + y * s };
  }
}
