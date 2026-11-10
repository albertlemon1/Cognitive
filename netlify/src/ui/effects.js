// Ambiente y mensajes: pared del café, grano de película, viñeta,
// tarjetas de retroalimentación y textos flotantes.

import { COLORS, CSS, FONTS } from "./palette.js";
import { drawPanel, fitText, textStyle } from "./draw.js";

export class BackdropView {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    // El fondo es estático: se dibuja una vez en una textura (un solo cuadro por frame).
    this.g = scene.make.graphics({}, false);
    this.rt = scene.add.renderTexture(0, 0, 16, 16).setOrigin(0, 0).setDepth(-10);
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} counterY Altura donde empieza el mostrador.
   */
  layout(width, height, counterY) {
    const g = this.g;
    g.clear();
    g.fillStyle(COLORS.wall, 1);
    g.fillRect(0, 0, width, height);
    // Papel tapiz a rayas.
    for (let x = 0; x < width; x += 36) {
      g.fillStyle(COLORS.wallStripe, 1);
      g.fillRect(x, 0, 14, counterY);
      g.fillStyle(0x3a2a1f, 0.6);
      g.fillCircle(x + 25, 40 + ((x / 36) % 4) * 60, 2.5);
    }
    // Zócalo de madera.
    g.fillStyle(COLORS.wainscot, 1);
    g.fillRect(0, counterY, width, height - counterY);
    g.fillStyle(COLORS.wainscotLine, 1);
    for (let x = 0; x < width; x += 90) g.fillRect(x, counterY + 10, 4, height - counterY);
    g.fillStyle(COLORS.counterTop, 1);
    g.fillRect(0, counterY - 6, width, 12);
    g.fillStyle(COLORS.brassDark, 1);
    g.fillRect(0, counterY + 6, width, 3);
    this.rt.resize(width, height);
    this.rt.clear();
    this.rt.draw(g, 0, 0);
  }
}

export class FilmView {
  /**
   * Grano de película y viñeta. Las texturas se generan con canvas una sola vez.
   * @param {Phaser.Scene} scene
   * @param {{ reducedMotion: boolean }} options
   */
  constructor(scene, options) {
    this.scene = scene;
    this.options = { ...options };
    this.frame = 0;
    if (!scene.textures.exists("barra-grain")) {
      const tex = scene.textures.createCanvas("barra-grain", 256, 256);
      const ctx = tex.getContext();
      const img = ctx.createImageData(256, 256);
      let seed = 1234567;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const v = (seed >>> 16) & 255;
        img.data[i] = v;
        img.data[i + 1] = v * 0.9;
        img.data[i + 2] = v * 0.75;
        img.data[i + 3] = v > 200 ? 34 : v < 40 ? 28 : 0;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    if (!scene.textures.exists("barra-vignette")) {
      const tex = scene.textures.createCanvas("barra-vignette", 512, 512);
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(256, 256, 120, 256, 256, 362);
      grad.addColorStop(0, "rgba(20,12,6,0)");
      grad.addColorStop(0.7, "rgba(20,12,6,0.18)");
      grad.addColorStop(1, "rgba(20,12,6,0.62)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "rgba(120, 80, 30, 0.08)";
      ctx.fillRect(0, 0, 512, 512);
      tex.refresh();
    }
    this.grain = scene.add.tileSprite(0, 0, 10, 10, "barra-grain").setOrigin(0, 0);
    this.vignette = scene.add.image(0, 0, "barra-vignette").setOrigin(0, 0);
    this.grain.setDepth(1000);
    this.vignette.setDepth(1001);
  }

  /** @param {Partial<{ reducedMotion: boolean }>} options */
  setOptions(options) {
    Object.assign(this.options, options);
  }

  layout(width, height) {
    this.grain.setSize(width, height);
    this.vignette.setDisplaySize(width, height);
  }

  update() {
    this.frame += 1;
    if (this.options.reducedMotion) return;
    if (this.frame % 3 === 0) {
      this.grain.tilePositionX = (this.frame * 37) % 256;
      this.grain.tilePositionY = (this.frame * 91) % 256;
    }
  }
}

export class FeedbackView {
  /**
   * Tarjeta de mensajes ("La máquina tose: ajusta..."), más textos flotantes.
   * @param {Phaser.Scene} scene
   * @param {{ reducedMotion: boolean, largeText: boolean }} options
   */
  constructor(scene, options) {
    this.scene = scene;
    this.options = { ...options };
    this.card = scene.add.container(0, 0).setDepth(500).setVisible(false);
    this.cardBg = scene.add.graphics();
    this.cardTitle = scene.add.text(0, 0, "", textStyle(24, { font: FONTS.display, color: CSS.brickDark }));
    this.cardBody = scene.add.text(0, 0, "", textStyle(19, { color: CSS.ink }));
    this.card.add([this.cardBg, this.cardTitle, this.cardBody]);
    this.anchor = { x: 640, y: 360, maxW: 420 };
    this.textScale = 1;
    this.hideAt = 0;
    this.time = 0;
    this.banner = null;
  }

  /** @param {Partial<{ reducedMotion: boolean, largeText: boolean }>} options */
  setOptions(options) {
    Object.assign(this.options, options);
  }

  /**
   * Punto donde aparece la tarjeta (centro superior), su ancho máximo y la escala del texto
   * (en vertical el lienzo se reduce más en pantalla, así que el texto se agranda).
   */
  setAnchor(x, y, maxW, textScale = 1) {
    this.anchor = { x, y, maxW };
    this.textScale = textScale;
  }

  /**
   * @param {{ title: string, lines: string[], tone: "bad"|"good"|"info", durationMs?: number }} message
   */
  show(message) {
    const k = (this.options.largeText ? 1.15 : 1) * this.textScale;
    const pad = 16;
    const maxW = this.anchor.maxW;
    this.cardTitle.setText(message.title);
    this.cardTitle.setColor(message.tone === "bad" ? CSS.brickDark : message.tone === "good" ? CSS.tealDark : CSS.ink);
    fitText(this.cardTitle, maxW - pad * 2, 40, 24 * k, 14);
    this.cardBody.setText(message.lines.join("\n"));
    this.cardBody.setLineSpacing(4);
    fitText(this.cardBody, maxW - pad * 2, 220, 19 * k, 12);
    const w = Math.min(maxW, Math.max(this.cardTitle.width, this.cardBody.width) + pad * 2);
    const h = this.cardTitle.height + (message.lines.length ? this.cardBody.height + 8 : 0) + pad * 2;
    this.cardBg.clear();
    drawPanel(this.cardBg, -w / 2, 0, w, h, {
      fill: COLORS.paper,
      border: message.tone === "bad" ? COLORS.brick : message.tone === "good" ? COLORS.teal : COLORS.brassDark,
      radius: 12,
    });
    this.cardTitle.setPosition(-w / 2 + pad, pad);
    this.cardBody.setPosition(-w / 2 + pad, pad + this.cardTitle.height + 8);
    this.card.setPosition(this.anchor.x, this.anchor.y);
    this.card.setVisible(true);
    this.card.setAlpha(1);
    this.hideAt = this.time + (message.durationMs ?? 4200);
    if (!this.options.reducedMotion) {
      this.card.setScale(0.85);
      this.scene.tweens.add({ targets: this.card, scale: 1, duration: 200, ease: "Back.easeOut" });
    } else {
      this.card.setScale(1);
    }
  }

  hide() {
    this.card.setVisible(false);
    this.hideAt = 0;
  }

  /** Texto que sube y se desvanece (propinas, aciertos). */
  float(text, x, y, color = CSS.cream, size = 30) {
    const label = this.scene.add
      .text(x, y, text, textStyle(size, { font: FONTS.display, color, align: "center" }))
      .setOrigin(0.5)
      .setDepth(600);
    label.setStroke(CSS.ink, 6);
    if (this.options.reducedMotion) {
      this.scene.time.delayedCall(1100, () => label.destroy());
      return;
    }
    this.scene.tweens.add({ targets: label, y: y - 70, alpha: 0, duration: 1200, ease: "Sine.easeOut", onComplete: () => label.destroy() });
  }

  update(dtMs) {
    this.time += dtMs;
    if (this.hideAt && this.time > this.hideAt) {
      this.hideAt = 0;
      if (this.options.reducedMotion) this.card.setVisible(false);
      else this.scene.tweens.add({ targets: this.card, alpha: 0, duration: 250, onComplete: () => this.card.setVisible(false) });
    }
  }
}
