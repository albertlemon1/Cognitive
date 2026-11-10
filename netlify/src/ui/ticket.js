// Comanda de papel colgada del riel. El anverso muestra la orden;
// el reverso aparece cuando la comanda se voltea (memoria de trabajo).

import { COLORS, CSS, FONTS, hexToNum } from "./palette.js";
import { drawCup, drawModifierIcon, iconSpec, fitText, textStyle } from "./draw.js";

export const TICKET_W = 220;
export const TICKET_H = 250;

/**
 * @typedef {Object} TicketOptions
 * @property {boolean} largeText
 * @property {boolean} colorBlind
 * @property {boolean} reducedMotion
 */

export class TicketView {
  /**
   * @param {Phaser.Scene} scene
   * @param {import("../core/catalog.js").Catalog} catalog
   * @param {{ id: number, drinkId: string, modifiers: string[], iconDrinkId: string }} order
   * @param {TicketOptions} options
   * @param {(id: number) => void} onTap
   */
  constructor(scene, catalog, order, options, onTap) {
    this.scene = scene;
    this.catalog = catalog;
    this.order = order;
    this.options = options;
    this.id = order.id;
    this.hidden = false;
    this.leaving = false;
    this.slot = -1;

    this.root = scene.add.container(0, 0);
    // Inclinación leve y estable por comanda: papel colgado a mano.
    this.baseAngle = ((order.id * 37) % 5 - 2) * 0.9;
    this.root.setAngle(this.baseAngle);

    this.shadow = scene.add.graphics();
    this.front = scene.add.container(0, 0);
    this.back = scene.add.container(0, 0);
    this.back.setVisible(false);
    this.overlay = scene.add.graphics();
    this.clip = scene.add.graphics();
    this.root.add([this.shadow, this.front, this.back, this.overlay, this.clip]);

    this.hit = scene.add.zone(0, TICKET_H / 2, TICKET_W, TICKET_H + 20).setInteractive({ useHandCursor: true });
    this.hit.on("pointerdown", () => onTap(this.id));
    this.root.add(this.hit);

    this.patience = null;
    this.highlight = false;
    this.build();
  }

  build() {
    const { scene, catalog, order, options } = this;
    const k = options.largeText ? 1.15 : 1;
    this.front.removeAll(true);
    this.back.removeAll(true);

    this.shadow.clear();
    this.shadow.fillStyle(COLORS.black, 0.35);
    this.shadow.fillPoints(paperOutline(6, 8), true);

    // Anverso.
    const paper = scene.add.graphics();
    paper.fillStyle(COLORS.paper, 1);
    paper.fillPoints(paperOutline(0, 0), true);
    paper.lineStyle(2, COLORS.paperEdge, 1);
    paper.strokePoints(paperOutline(0, 0), true);
    paper.lineStyle(2, COLORS.paperEdge, 1);
    for (let x = -TICKET_W / 2 + 14; x < TICKET_W / 2 - 14; x += 14) paper.lineBetween(x, 52, x + 7, 52);
    const cup = scene.add.graphics();
    drawCup(cup, iconSpec(catalog, order.iconDrinkId), -72, 134, 66);
    this.front.add([paper, cup]);

    const number = scene.add.text(-TICKET_W / 2 + 14, 14, `No. ${order.id}`, textStyle(24, { font: FONTS.type, color: CSS.brick }));
    this.front.add(number);

    const name = scene.add.text(-34, 58, catalog.drinks[order.drinkId].label, textStyle(30 * k, { font: FONTS.type, color: CSS.ink }));
    fitText(name, TICKET_W / 2 + 34 - 10, 76, 30 * k, 14);
    this.front.add(name);

    const chips = scene.add.graphics();
    this.front.add(chips);
    const rowH = 32;
    if (order.modifiers.length === 0) {
      const none = scene.add.text(-TICKET_W / 2 + 16, 150, "Sin extras", textStyle(21 * k, { color: "#7a6450" }));
      none.setFontStyle("italic");
      this.front.add(none);
    }
    order.modifiers.forEach((modId, i) => {
      const mod = catalog.modifiers[modId];
      const y = 146 + i * rowH;
      chips.fillStyle(COLORS.paperShade, 1);
      chips.fillRoundedRect(-TICKET_W / 2 + 10, y - 2, TICKET_W - 20, rowH - 4, 8);
      drawModifierIcon(chips, mod.icon, -TICKET_W / 2 + 28, y + rowH / 2 - 4, 24);
      const label = scene.add.text(-TICKET_W / 2 + 46, y + 1, mod.short, textStyle(22 * k, { bold: true }));
      fitText(label, TICKET_W - 66, rowH - 4, 22 * k, 12);
      this.front.add(label);
    });

    // Reverso.
    const backPaper = scene.add.graphics();
    backPaper.fillStyle(COLORS.paperShade, 1);
    backPaper.fillPoints(paperOutline(0, 0), true);
    backPaper.lineStyle(2, COLORS.paperEdge, 1);
    backPaper.strokePoints(paperOutline(0, 0), true);
    backPaper.lineStyle(3, COLORS.paperEdge, 0.6);
    for (let y = 14; y < TICKET_H - 30; y += 20) {
      for (let x = -TICKET_W / 2 + 12; x < TICKET_W / 2 - 22; x += 20) {
        backPaper.lineBetween(x, y + 12, x + 12, y);
      }
    }
    backPaper.fillStyle(COLORS.paper, 1);
    backPaper.fillCircle(0, 104, 56);
    backPaper.lineStyle(3, COLORS.brick, 1);
    backPaper.strokeCircle(0, 104, 56);
    const backNumber = scene.add.text(0, 104, `${order.id}`, textStyle(58, { font: FONTS.display, color: CSS.brick, align: "center" })).setOrigin(0.5);
    const backHint = scene.add.text(0, 200, "Comanda volteada", textStyle(19 * k, { font: FONTS.type, color: CSS.ink, align: "center" })).setOrigin(0.5);
    fitText(backHint, TICKET_W - 24, 30, 19 * k, 12);
    this.back.add([backPaper, backNumber, backHint]);

    // Pinza del riel.
    this.clip.clear();
    this.clip.fillStyle(COLORS.brassDark, 1);
    this.clip.fillRoundedRect(-22, -14, 44, 26, 5);
    this.clip.fillStyle(COLORS.brass, 1);
    this.clip.fillRoundedRect(-19, -12, 38, 18, 4);
    this.clip.fillStyle(COLORS.brassLight, 1);
    this.clip.fillRect(-15, -10, 30, 4);

    this.drawOverlay();
  }

  /** @param {number|null} fraction Paciencia restante (0..1) o null si no hay límite. */
  setPatience(fraction) {
    const rounded = fraction == null ? null : Math.round(fraction * 200) / 200;
    if (rounded === this.patience) return;
    this.patience = rounded;
    this.drawOverlay();
  }

  setHighlight(on) {
    if (this.highlight === on) return;
    this.highlight = on;
    this.drawOverlay();
  }

  drawOverlay() {
    const g = this.overlay;
    g.clear();
    if (this.highlight) {
      g.lineStyle(5, COLORS.glow, 0.95);
      g.strokePoints(paperOutline(0, 0), true);
    }
    if (this.patience != null) {
      // Mecha de paciencia: se consume de derecha a izquierda.
      const x = 14;
      const w = TICKET_W / 2 - 14 - x;
      const y = 22;
      g.fillStyle(COLORS.paperEdge, 1);
      g.fillRoundedRect(x, y, w, 12, 6);
      const f = this.patience;
      const color = f > 0.5 ? COLORS.teal : f > 0.25 ? COLORS.mustardDark : COLORS.brick;
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, Math.max(6, w * f), 12, 6);
      if (this.options.colorBlind) {
        g.lineStyle(2, COLORS.ink, 0.8);
        for (const mark of [0.25, 0.5]) g.lineBetween(x + w * mark, y - 3, x + w * mark, y + 15);
      }
      g.lineStyle(2, COLORS.ink, 0.6);
      g.strokeRoundedRect(x, y, w, 12, 6);
    }
  }

  /**
   * @param {boolean} hidden
   * @param {boolean} animate
   */
  setHidden(hidden, animate) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    const swap = () => {
      this.front.setVisible(!hidden);
      this.back.setVisible(hidden);
    };
    if (!animate || this.options.reducedMotion) {
      swap();
      return;
    }
    this.scene.tweens.add({
      targets: this.root,
      scaleX: 0,
      duration: 140,
      ease: "Sine.easeIn",
      onComplete: () => {
        swap();
        this.scene.tweens.add({ targets: this.root, scaleX: 1, duration: 160, ease: "Back.easeOut" });
      },
    });
  }

  /** Sello sobre la comanda (SERVIDA, PERDIDA). */
  stamp(text, color) {
    const label = this.scene.add
      .text(0, 120, text, textStyle(34, { font: FONTS.display, color, align: "center" }))
      .setOrigin(0.5)
      .setAngle(-14)
      .setAlpha(0.92);
    const ring = this.scene.add.graphics();
    ring.lineStyle(4, hexToNum(color), 0.9);
    ring.strokeRoundedRect(-label.width / 2 - 10, 120 - label.height / 2 - 6, label.width + 20, label.height + 12, 8);
    ring.setAngle(-14);
    this.root.add([ring, label]);
    if (!this.options.reducedMotion) {
      label.setScale(1.6);
      ring.setScale(1.6);
      this.scene.tweens.add({ targets: [label, ring], scale: 1, duration: 180, ease: "Back.easeOut" });
    }
  }

  shake() {
    if (this.options.reducedMotion) return;
    this.scene.tweens.add({
      targets: this.root,
      angle: { from: this.baseAngle - 5, to: this.baseAngle },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.root.setAngle(this.baseAngle),
    });
  }

  destroy() {
    this.root.destroy(true);
  }
}

/** Contorno del papel con borde inferior dentado. */
function paperOutline(dx, dy) {
  const w = TICKET_W;
  const h = TICKET_H;
  const pts = [
    { x: -w / 2 + dx, y: dy },
    { x: w / 2 + dx, y: dy },
    { x: w / 2 + dx, y: h - 14 + dy },
  ];
  const teeth = 12;
  for (let i = 1; i <= teeth; i++) {
    const x = w / 2 - (w / teeth) * i;
    pts.push({ x: x + w / teeth / 2 + dx, y: h + dy }, { x: x + dx, y: h - 14 + dy });
  }
  return pts;
}
