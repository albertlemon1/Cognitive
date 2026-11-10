// Consola de la máquina: teclas de bebida, interruptores de extras,
// palanca de preparación, botón de presión y botón de limpiar.

import { COLORS, CSS, FONTS } from "./palette.js";
import { drawCup, drawModifierIcon, drawPanel, drawScrew, iconSpec, fitText, textStyle } from "./draw.js";

export const DRINK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

// Dos distribuciones: horizontal (4×3 teclas) y vertical (3×4 teclas).
const ARRANGEMENTS = {
  landscape: { w: 680, h: 430, cols: 4, keyW: 158, keyH: 58, gap: 8, top: 44, switchH: 70, bottomH: 92, lever: 220, pressure: 220, clean: 200 },
  portrait: { w: 700, h: 560, cols: 3, keyW: 220, keyH: 62, gap: 9, top: 48, switchH: 74, bottomH: 120, lever: 250, pressure: 250, clean: 160 },
};

/**
 * @typedef {Object} ControlsCallbacks
 * @property {(drinkId: string) => void} onDrink
 * @property {(modifierId: string) => void} onModifier
 * @property {() => void} onLever
 * @property {(held: boolean) => void} onPressure
 * @property {() => void} onClean
 */

/**
 * @typedef {Object} ControlsView
 * @property {"idle"|"brewing"|"ready"} phase
 * @property {string|null} selectedDrink
 * @property {string[]} modifiers
 * @property {boolean} canPull
 * @property {boolean} gaugeActive
 * @property {"below"|"in"|"above"|null} gaugeZone   Posición de la aguja durante la extracción.
 * @property {boolean} pressureHeld
 * @property {boolean} canClean
 * @property {number} cleaningFraction   0 si no se está limpiando.
 * @property {string} status
 */

export class ControlsView {
  /**
   * @param {Phaser.Scene} scene
   * @param {import("../core/catalog.js").Catalog} catalog
   * @param {ControlsCallbacks} callbacks
   * @param {{ largeText: boolean, colorBlind: boolean, reducedMotion: boolean, keyHints: boolean }} options
   */
  constructor(scene, catalog, callbacks, options) {
    this.scene = scene;
    this.catalog = catalog;
    this.callbacks = callbacks;
    this.options = { ...options };
    this.mode = "landscape";
    this.time = 0;
    this.lastKey = "";
    /** @type {Map<string, {x:number,y:number,w:number,h:number}>} */
    this.rects = new Map();
    /** @type {Map<string, Phaser.GameObjects.Zone>} */
    this.zones = new Map();
    this.view = null;
    /** @type {Map<string, Phaser.GameObjects.Text>|null} */
    this.texts = null;
    this.textsKey = "";

    this.root = scene.add.container(0, 0);
    this.panel = scene.add.graphics();
    this.art = scene.add.graphics();
    this.textLayer = scene.add.container(0, 0);
    this.status = scene.add.text(0, 0, "", textStyle(18, { font: FONTS.type, color: CSS.ink, align: "center" })).setOrigin(0.5, 0.5);
    this.root.add([this.panel, this.art, this.textLayer, this.status]);
    this.buildZones();
  }

  buildZones() {
    const make = (id, handlers) => {
      const zone = this.scene.add.zone(0, 0, 10, 10).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      for (const [event, fn] of Object.entries(handlers)) zone.on(event, fn);
      this.zones.set(id, zone);
      this.root.add(zone);
    };
    for (const drinkId of this.catalog.drinkOrder) {
      make(`drink:${drinkId}`, { pointerdown: () => this.callbacks.onDrink(drinkId) });
    }
    for (const modId of this.catalog.modifierOrder) {
      make(`mod:${modId}`, { pointerdown: () => this.callbacks.onModifier(modId) });
    }
    make("lever", { pointerdown: () => this.callbacks.onLever() });
    make("pressure", {
      pointerdown: () => this.callbacks.onPressure(true),
      pointerup: () => this.callbacks.onPressure(false),
      pointerout: () => this.callbacks.onPressure(false),
    });
    make("clean", { pointerdown: () => this.callbacks.onClean() });
  }

  /** @param {Partial<{ largeText: boolean, colorBlind: boolean, reducedMotion: boolean, keyHints: boolean }>} options */
  setOptions(options) {
    Object.assign(this.options, options);
    this.lastKey = "";
    this.texts = null;
  }

  /**
   * @param {{ x: number, y: number, w: number, h: number }} region
   * @param {"landscape"|"portrait"} mode
   */
  layout(region, mode) {
    this.mode = mode;
    const a = ARRANGEMENTS[mode];
    const scale = Math.min(region.w / a.w, region.h / a.h, mode === "portrait" ? 1.1 : 1.2);
    this.root.setScale(scale);
    this.root.setPosition(region.x + (region.w - a.w * scale) / 2, region.y + (region.h - a.h * scale) / 2);
    this.computeRects(a);
    this.panel.clear();
    drawPanel(this.panel, 0, 0, a.w, a.h, { fill: COLORS.paper, border: COLORS.brassDark, radius: 20 });
    for (const [x, y] of [[16, 16], [a.w - 16, 16], [16, a.h - 16], [a.w - 16, a.h - 16]]) drawScrew(this.panel, x, y, 6);
    this.status.setPosition(a.w / 2, a.top / 2 + 2);
    for (const [id, r] of this.rects) {
      const zone = this.zones.get(id);
      zone.setPosition(r.x, r.y);
      zone.setSize(r.w, r.h);
    }
    this.buildTexts();
    this.lastKey = "";
    if (this.view) this.render(this.view, 0);
  }

  computeRects(a) {
    this.rects.clear();
    const gridW = a.cols * a.keyW + (a.cols - 1) * a.gap;
    const x0 = (a.w - gridW) / 2;
    this.catalog.drinkOrder.forEach((id, i) => {
      const col = i % a.cols;
      const row = Math.floor(i / a.cols);
      this.rects.set(`drink:${id}`, { x: x0 + col * (a.keyW + a.gap), y: a.top + row * (a.keyH + a.gap), w: a.keyW, h: a.keyH });
    });
    const rows = Math.ceil(this.catalog.drinkOrder.length / a.cols);
    const switchY = a.top + rows * (a.keyH + a.gap) + 4;
    const n = this.catalog.modifierOrder.length;
    const switchW = (gridW - (n - 1) * a.gap) / n;
    this.catalog.modifierOrder.forEach((id, i) => {
      this.rects.set(`mod:${id}`, { x: x0 + i * (switchW + a.gap), y: switchY, w: switchW, h: a.switchH });
    });
    const bottomY = switchY + a.switchH + a.gap + 4;
    const total = a.lever + a.pressure + a.clean + 2 * a.gap;
    const scaleRow = gridW / total;
    let x = x0;
    for (const [id, w] of [["lever", a.lever], ["pressure", a.pressure], ["clean", a.clean]]) {
      const width = w * scaleRow;
      this.rects.set(id, { x, y: bottomY, w: width, h: a.bottomH });
      x += width + a.gap;
    }
  }

  /** Crea los textos de cada control (una vez por distribución u opciones). */
  buildTexts() {
    this.textLayer.removeAll(true);
    this.texts = new Map();
    const k = this.options.largeText ? 1.15 : 1;
    const portrait = this.mode === "portrait";
    const add = (id, text) => {
      this.texts.set(id, text);
      this.textLayer.add(text);
      return text;
    };

    this.catalog.drinkOrder.forEach((id, i) => {
      const r = this.rects.get(`drink:${id}`);
      const iconSize = r.h * 0.78;
      const labelX = r.x + iconSize + 12;
      const label = add(`drink:${id}`, this.scene.add.text(labelX, r.y + r.h / 2, this.catalog.drinks[id].label, textStyle(21 * k, { bold: true })));
      label.setOrigin(0, 0.5);
      fitText(label, r.x + r.w - labelX - 8, r.h - 10, (portrait ? 23 : 19) * k, 10);
      if (this.options.keyHints) add(`hint:drink:${id}`, this.hint(DRINK_KEYS[i], r.x + r.w - 6, r.y + 4));
    });

    this.catalog.modifierOrder.forEach((id) => {
      const r = this.rects.get(`mod:${id}`);
      const mod = this.catalog.modifiers[id];
      // Etiqueta corta (la misma que en las comandas) para poder usar letra grande.
      const label = add(`mod:${id}`, this.scene.add.text(r.x + 34, r.y + r.h / 2, mod.short, textStyle(24 * k, { bold: true, color: CSS.ink })));
      label.setOrigin(0, 0.5);
      fitText(label, r.w - 34 - 44, r.h - 10, (portrait ? 25 : 23) * k, 12);
      const state = add(`state:${id}`, this.scene.add.text(r.x + r.w - 24, r.y + r.h - 6, "NO", textStyle(13 * k, { bold: true, align: "center" })));
      state.setOrigin(0.5, 1);
      if (this.options.keyHints && mod.key) add(`hint:mod:${id}`, this.hint(mod.key, r.x + r.w - 6, r.y + 4));
    });

    const big = (id, x, text, sub, maxW) => {
      const r = this.rects.get(id);
      const label = add(`${id}:label`, this.scene.add.text(r.x + x, r.y + r.h / 2 - 10, text, textStyle(24 * k, { font: FONTS.display })));
      label.setOrigin(0, 0.5);
      fitText(label, maxW(r), r.h * 0.45, (portrait ? 26 : 22) * k, 11);
      const subText = add(`${id}:sub`, this.scene.add.text(r.x + x, r.y + r.h / 2 + 18, sub, textStyle(13 * k, { font: FONTS.type, color: "#6b5640" })));
      subText.setOrigin(0, 0.5);
      fitText(subText, maxW(r), 20, 13 * k, 9);
    };
    big("lever", 84, "PREPARAR", this.options.keyHints ? "Tira · Enter" : "Tira de la palanca", (r) => r.w - 92);
    this.pressureSubDefault = this.options.keyHints ? "Mantén · Espacio" : "Mantén pulsado";
    big("pressure", 96, "PRESIÓN", this.pressureSubDefault, (r) => r.w - 104);

    const rc = this.rects.get("clean");
    const clean = add("clean:label", this.scene.add.text(rc.x + rc.w / 2, rc.y + rc.h - 12, this.options.keyHints ? "Limpiar · L" : "Limpiar", textStyle(16 * k, { bold: true, align: "center" })));
    clean.setOrigin(0.5, 1);
    fitText(clean, rc.w - 12, 24, 16 * k, 9);
    this.textsKey = `${this.mode}|${JSON.stringify(this.options)}`;
  }

  hint(text, right, top) {
    return this.scene.add.text(right, top, text, textStyle(12, { font: FONTS.type, color: "#8a755c" })).setOrigin(1, 0);
  }

  /**
   * @param {ControlsView} view
   * @param {number} dtMs
   */
  render(view, dtMs) {
    this.time += dtMs;
    this.view = view;
    const pulse = view.gaugeActive && !this.options.reducedMotion ? Math.floor(this.time / 220) % 2 : 0;
    const key = JSON.stringify([
      view.phase, view.selectedDrink, view.modifiers, view.canPull, view.gaugeActive, view.gaugeZone, view.pressureHeld,
      view.canClean, Math.round(view.cleaningFraction * 40), view.status, pulse, this.mode, this.options,
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (!this.texts || this.textsKey !== `${this.mode}|${JSON.stringify(this.options)}`) this.buildTexts();

    const g = this.art;
    g.clear();
    const k = this.options.largeText ? 1.15 : 1;
    const locked = view.phase !== "idle";

    if (this.status.text !== view.status) {
      this.status.setText(view.status);
      fitText(this.status, ARRANGEMENTS[this.mode].w - 60, ARRANGEMENTS[this.mode].top - 6, 19 * k, 11);
    }

    // Teclas de bebida.
    this.catalog.drinkOrder.forEach((id) => {
      const r = this.rects.get(`drink:${id}`);
      const selected = view.selectedDrink === id;
      const dim = locked && !selected;
      this.drawKey(g, r, selected, dim);
      const iconSize = r.h * 0.78;
      drawCup(g, iconSpec(this.catalog, id), r.x + iconSize * 0.55 + 6, r.y + r.h - 6 + (selected ? 3 : 0), iconSize);
      const label = this.texts.get(`drink:${id}`);
      label.setY(r.y + r.h / 2 + (selected ? 3 : 0));
      label.setColor(selected ? CSS.ink : CSS.coffee);
      label.setAlpha(dim ? 0.5 : 1);
    });

    // Interruptores de extras.
    this.catalog.modifierOrder.forEach((id) => {
      const r = this.rects.get(`mod:${id}`);
      const on = view.modifiers.includes(id);
      this.drawSwitch(g, r, on, locked);
      drawModifierIcon(g, this.catalog.modifiers[id].icon, r.x + 18, r.y + r.h / 2, 24);
      this.texts.get(`mod:${id}`).setAlpha(locked ? 0.55 : 1);
      const state = this.texts.get(`state:${id}`);
      state.setText(on ? "SÍ" : "NO");
      state.setColor(on ? CSS.tealDark : "#7a6450");
    });

    this.drawLever(g, this.rects.get("lever"), view);
    this.drawPressure(g, this.rects.get("pressure"), view, pulse);
    this.drawClean(g, this.rects.get("clean"), view);
  }

  drawKey(g, r, selected, dim) {
    g.fillStyle(COLORS.black, 0.3);
    g.fillRoundedRect(r.x + 2, r.y + 5, r.w, r.h - 2, 12);
    g.fillStyle(selected ? COLORS.mustardDark : COLORS.paperEdge, 1);
    g.fillRoundedRect(r.x, r.y + 2, r.w, r.h - 2, 12);
    g.fillStyle(selected ? COLORS.mustard : dim ? COLORS.paperShade : COLORS.cream, 1);
    g.fillRoundedRect(r.x, r.y + (selected ? 3 : 0), r.w, r.h - 5, 12);
    g.lineStyle(selected ? 3 : 2, selected ? COLORS.ink : COLORS.brassDark, 1);
    g.strokeRoundedRect(r.x, r.y + (selected ? 3 : 0), r.w, r.h - 5, 12);
    if (selected && this.options.colorBlind) {
      g.lineStyle(2, COLORS.ink, 1);
      g.strokeRoundedRect(r.x + 5, r.y + 8, r.w - 10, r.h - 15, 9);
    }
  }

  drawSwitch(g, r, on, locked) {
    g.fillStyle(COLORS.black, 0.25);
    g.fillRoundedRect(r.x + 2, r.y + 4, r.w, r.h, 12);
    g.fillStyle(on ? COLORS.mustardLight : COLORS.cream, locked ? 0.7 : 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 12);
    g.lineStyle(on ? 3 : 2, on ? COLORS.ink : COLORS.brassDark, 1);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
    // Palanca tipo "bate" de los años 50.
    const cx = r.x + r.w - 24;
    const cy = r.y + r.h / 2 - 8;
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillCircle(cx, cy, 13);
    g.fillStyle(COLORS.chrome, 1);
    g.fillCircle(cx, cy, 10);
    const tipY = on ? cy - 18 : cy + 14;
    g.lineStyle(6, COLORS.ink, 1);
    g.lineBetween(cx, cy, cx, tipY);
    g.fillStyle(on ? COLORS.brick : COLORS.chromeDark, 1);
    g.fillCircle(cx, tipY, 6);
  }

  drawLever(g, r, view) {
    const enabled = view.canPull;
    const pulled = view.phase !== "idle";
    drawPanel(g, r.x, r.y, r.w, r.h, { fill: enabled ? COLORS.cream : COLORS.paperShade, border: COLORS.brassDark, radius: 14 });
    const px = r.x + 40;
    const py = r.y + r.h / 2 + 8;
    const angle = pulled ? 0.55 : -0.75;
    const len = Math.min(r.h * 0.55, 56);
    const tx = px + Math.cos(angle) * len;
    const ty = py + Math.sin(angle) * len;
    g.fillStyle(COLORS.chromeDark, 1);
    g.fillRoundedRect(px - 16, py - 10, 32, 24, 6);
    g.lineStyle(9, COLORS.ink, 1);
    g.lineBetween(px, py, tx, ty);
    g.lineStyle(5, COLORS.chrome, 1);
    g.lineBetween(px, py, tx, ty);
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(tx, ty, 14);
    g.fillStyle(enabled ? COLORS.brick : COLORS.chromeDark, 1);
    g.fillCircle(tx, ty, 11);
    g.fillStyle(COLORS.white, 0.5);
    g.fillCircle(tx - 4, ty - 4, 4);
    this.texts.get("lever:label").setColor(enabled ? CSS.brickDark : "#8a755c");
  }

  drawPressure(g, r, view, pulse) {
    const active = view.gaugeActive;
    // Mismo código de color que el manómetro: turquesa en la zona, ladrillo fuera.
    const zone = active ? view.gaugeZone : null;
    const zoneFill = zone === "in" ? COLORS.tealLight : zone ? 0xf2c4b4 : COLORS.mustardLight;
    drawPanel(g, r.x, r.y, r.w, r.h, { fill: active ? zoneFill : COLORS.paperShade, border: zone === "in" ? COLORS.tealDark : COLORS.brassDark, radius: 14 });
    const cx = r.x + 48;
    const cy = r.y + r.h / 2;
    const radius = Math.min(r.h * 0.36, 36);
    if (active) {
      g.fillStyle(zone === "in" ? COLORS.teal : zone ? 0xe0896c : COLORS.glow, pulse ? 0.9 : 0.5);
      g.fillCircle(cx, cy, radius + 10);
    }
    g.fillStyle(COLORS.brassDark, 1);
    g.fillCircle(cx, cy + 3, radius + 4);
    g.fillStyle(COLORS.brass, 1);
    g.fillCircle(cx, cy, radius + 4);
    const pressed = view.pressureHeld;
    g.fillStyle(active ? (pressed ? COLORS.brickDark : COLORS.brick) : COLORS.chromeDark, 1);
    g.fillCircle(cx, cy + (pressed ? 2 : 0), radius * (pressed ? 0.82 : 0.9));
    g.fillStyle(COLORS.white, pressed ? 0.15 : 0.35);
    g.fillCircle(cx - radius * 0.3, cy - radius * 0.3, radius * 0.3);
    this.texts.get("pressure:label").setColor(active ? (zone === "in" ? CSS.tealDark : CSS.brickDark) : "#8a755c");
    const sub = this.texts.get("pressure:sub");
    let subText = this.pressureSubDefault;
    if (zone === "in") subText = "¡En zona!";
    else if (zone === "below") subText = "Pulsa: sube";
    else if (zone === "above") subText = "Suelta: baja";
    if (sub.text !== subText) {
      sub.setText(subText);
      sub.setColor(zone === "in" ? CSS.tealDark : zone ? CSS.brickDark : "#6b5640");
      fitText(sub, r.w - 104, 20, 13 * (this.options.largeText ? 1.15 : 1), 9);
    }
  }

  drawClean(g, r, view) {
    const enabled = view.canClean;
    drawPanel(g, r.x, r.y, r.w, r.h, { fill: enabled ? COLORS.cream : COLORS.paperShade, border: COLORS.brassDark, radius: 14 });
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * 0.38;
    // Trapo a cuadros.
    g.fillStyle(enabled ? COLORS.white : COLORS.paperShade, 1);
    g.fillRoundedRect(cx - 20, cy - 14, 40, 28, 6);
    g.fillStyle(enabled ? COLORS.brick : COLORS.chromeDark, 0.8);
    for (let i = 0; i < 3; i++) {
      g.fillRect(cx - 20 + i * 14, cy - 14, 6, 28);
      g.fillRect(cx - 20, cy - 14 + i * 10, 40, 4);
    }
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeRoundedRect(cx - 20, cy - 14, 40, 28, 6);
    if (view.cleaningFraction > 0) {
      g.lineStyle(5, COLORS.teal, 1);
      g.beginPath();
      g.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.cleaningFraction, false);
      g.strokePath();
    }
    this.texts.get("clean:label").setColor(enabled ? CSS.ink : "#8a755c");
  }

  /** Centro de un control en coordenadas del mundo. */
  controlCenter(id) {
    const r = this.rects.get(id);
    if (!r) return null;
    const s = this.root.scaleX;
    return {
      x: this.root.x + (r.x + r.w / 2) * s,
      y: this.root.y + (r.y + r.h / 2) * s,
      radius: Math.min(Math.max(r.w, r.h) * 0.45, 90) * s,
    };
  }
}
