// Guía de la práctica: tarjeta con la instrucción del momento y manos de guante
// blanco (al estilo de los dibujos de los años 30) que señalan los controles.

import { COLORS, CSS, FONTS } from "./palette.js";
import { drawPanel, fitText, textStyle } from "./draw.js";

const MAX_POINTERS = 2;

export class CoachView {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ reducedMotion: boolean, largeText: boolean }} options
   */
  constructor(scene, options) {
    this.scene = scene;
    this.options = { ...options };
    this.time = 0;
    this.visible = false;
    this.lastKey = "";
    this.anchor = { x: 640, y: 120, maxW: 520, textScale: 1 };

    this.card = scene.add.container(0, 0).setDepth(520).setVisible(false);
    this.cardBg = scene.add.graphics();
    this.title = scene.add.text(0, 0, "", textStyle(15, { font: FONTS.type, color: CSS.tealDark }));
    this.body = scene.add.text(0, 0, "", textStyle(21, { color: CSS.ink }));
    this.card.add([this.cardBg, this.title, this.body]);

    this.rings = scene.add.graphics().setDepth(530);
    /** @type {Phaser.GameObjects.Graphics[]} */
    this.hands = [];
    for (let i = 0; i < MAX_POINTERS; i++) {
      const hand = scene.add.graphics().setDepth(540).setVisible(false);
      drawGlove(hand);
      this.hands.push(hand);
    }
    this.targets = [];
    this.height = 0;
  }

  /** @param {Partial<{ reducedMotion: boolean, largeText: boolean }>} options */
  setOptions(options) {
    Object.assign(this.options, options);
    this.lastKey = "";
  }

  setAnchor(x, y, maxW, textScale = 1) {
    this.anchor = { x, y, maxW, textScale };
    this.lastKey = "";
  }

  /**
   * @param {{ title: string, text: string, tone?: "good"|"bad"|"info" } | null} message
   * @param {Array<{ x: number, y: number, radius?: number, scale?: number } | null>} targets Puntos del mundo.
   * @param {number} dtMs
   */
  update(message, targets, dtMs) {
    this.time += dtMs;
    if (!message) {
      this.hide();
      return;
    }
    this.visible = true;
    const key = `${message.title}|${message.text}|${message.tone}|${JSON.stringify(this.anchor)}|${JSON.stringify(this.options)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderCard(message);
    }
    this.card.setVisible(true);
    this.targets = targets.filter(Boolean);
    this.renderPointers();
  }

  renderCard(message) {
    const k = (this.options.largeText ? 1.15 : 1) * this.anchor.textScale;
    const pad = 16;
    const maxW = this.anchor.maxW;
    this.title.setText(message.title.toUpperCase());
    fitText(this.title, maxW - pad * 2, 30, 15 * k, 10);
    this.body.setText(message.text);
    this.body.setLineSpacing(3);
    fitText(this.body, maxW - pad * 2, 140, 22 * k, 12);
    const w = Math.min(maxW, Math.max(this.title.width, this.body.width) + pad * 2);
    const h = this.title.height + this.body.height + pad * 2 + 6;
    this.cardBg.clear();
    const border = message.tone === "good" ? COLORS.teal : message.tone === "bad" ? COLORS.brick : COLORS.mustardDark;
    drawPanel(this.cardBg, -w / 2, 0, w, h, { fill: COLORS.cream, border, radius: 12 });
    this.title.setPosition(-w / 2 + pad, pad);
    this.body.setPosition(-w / 2 + pad, pad + this.title.height + 6);
    this.card.setPosition(this.anchor.x, this.anchor.y);
    this.height = h;
    if (!this.options.reducedMotion) {
      this.card.setScale(0.92);
      this.scene.tweens.add({ targets: this.card, scale: 1, duration: 180, ease: "Back.easeOut" });
    }
  }

  renderPointers() {
    const rm = this.options.reducedMotion;
    const height = this.scene.scale.gameSize.height;
    const g = this.rings;
    g.clear();
    const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(this.time / 180);
    this.hands.forEach((hand, i) => {
      const t = this.targets[i];
      if (!t) {
        hand.setVisible(false);
        return;
      }
      const radius = t.radius ?? 46;
      g.lineStyle(5, COLORS.glow, 0.45 + 0.45 * pulse);
      g.strokeCircle(t.x, t.y, radius + pulse * 6);
      g.lineStyle(2, COLORS.ink, 0.5);
      g.strokeCircle(t.x, t.y, radius + 4 + pulse * 6);

      // La mano llega desde abajo si el objetivo está arriba, y desde arriba si está abajo.
      const fromBelow = t.y < height * 0.4;
      const bob = rm ? 0 : Math.sin(this.time / 160 + i) * 8;
      const scale = (t.scale ?? 1) * 0.9;
      hand.setVisible(true);
      hand.setScale(scale);
      hand.setRotation(fromBelow ? 0 : Math.PI);
      const offset = radius + 12 + bob;
      hand.setPosition(t.x, fromBelow ? t.y + offset : t.y - offset);
    });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.card.setVisible(false);
    this.rings.clear();
    for (const hand of this.hands) hand.setVisible(false);
    this.lastKey = "";
  }

  /** Borde inferior de la tarjeta (para colocar otros mensajes debajo). */
  get bottom() {
    return this.visible ? this.anchor.y + this.height : this.anchor.y;
  }
}

/** Guante blanco señalando hacia arriba; la punta del dedo está en (0, 0). */
function drawGlove(g) {
  const ink = COLORS.ink;
  g.lineStyle(3, ink, 1);
  // Dedo índice.
  g.fillStyle(COLORS.white, 1);
  g.fillRoundedRect(-8, 0, 16, 44, 8);
  g.strokeRoundedRect(-8, 0, 16, 44, 8);
  // Palma con los dedos doblados.
  g.fillStyle(COLORS.white, 1);
  g.fillRoundedRect(-22, 34, 44, 38, 14);
  g.strokeRoundedRect(-22, 34, 44, 38, 14);
  g.lineStyle(2, ink, 0.7);
  g.lineBetween(-10, 42, -10, 56);
  g.lineBetween(2, 42, 2, 56);
  // Pulgar.
  g.fillStyle(COLORS.white, 1);
  g.lineStyle(3, ink, 1);
  g.fillEllipse(-24, 48, 14, 24);
  g.strokeEllipse(-24, 48, 14, 24);
  // Puño con las tres líneas típicas.
  g.fillStyle(COLORS.white, 1);
  g.fillRoundedRect(-18, 70, 36, 18, 5);
  g.strokeRoundedRect(-18, 70, 36, 18, 5);
  g.lineStyle(2, ink, 0.6);
  for (const x of [-8, 0, 8]) g.lineBetween(x, 73, x, 85);
  // Tapa la línea del dedo sobre la palma.
  g.fillStyle(COLORS.white, 1);
  g.fillRect(-6, 34, 12, 8);
}
