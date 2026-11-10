// Barra superior: letrero de neón, nivel, reloj, propinas y pausa.

import { COLORS, CSS, FONTS } from "./palette.js";
import { textStyle, fitText } from "./draw.js";

export class HudView {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onPause: () => void, onMusic: () => void }} callbacks
   * @param {{ reducedMotion: boolean, largeText: boolean, musicOn?: boolean }} options
   */
  constructor(scene, callbacks, options) {
    this.scene = scene;
    this.options = { ...options };
    this.time = 0;
    this.root = scene.add.container(0, 0);
    this.bg = scene.add.graphics();
    this.sign = scene.add.text(0, 0, "Barra Sepia", textStyle(34, { font: FONTS.display, color: "#ffd77a" })).setOrigin(0, 0.5);
    this.sign.setShadow(0, 0, "#ff9a3c", 12, true, true);
    this.info = scene.add.text(0, 0, "", textStyle(20, { font: FONTS.type, color: CSS.cream })).setOrigin(1, 0.5);
    this.pauseArt = scene.add.graphics();
    this.pauseZone = scene.add.zone(0, 0, 56, 48).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.pauseZone.on("pointerdown", () => callbacks.onPause());
    // Botón de música (encender / apagar), junto a la pausa.
    this.musicOn = options.musicOn !== false;
    this.musicArt = scene.add.graphics();
    this.musicZone = scene.add.zone(0, 0, 56, 48).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.musicZone.on("pointerdown", () => callbacks.onMusic());
    this.root.add([this.bg, this.sign, this.info, this.pauseArt, this.pauseZone, this.musicArt, this.musicZone]);
    this.width = 1280;
    this.height = 60;
    this.lastInfo = "";
  }

  /** @param {Partial<{ reducedMotion: boolean, largeText: boolean }>} options */
  setOptions(options) {
    Object.assign(this.options, options);
    this.lastInfo = "";
  }

  layout(width, height) {
    this.width = width;
    this.height = height;
    const g = this.bg;
    g.clear();
    g.fillStyle(COLORS.black, 0.55);
    g.fillRect(0, 0, width, height);
    g.fillStyle(COLORS.brassDark, 1);
    g.fillRect(0, height - 4, width, 4);
    g.fillStyle(COLORS.brass, 1);
    g.fillRect(0, height - 4, width, 2);

    this.sign.setPosition(18, height / 2);
    fitText(this.sign, width * 0.42, height - 8, Math.min(36, height * 0.62), 16);

    const size = Math.min(52, height - 10);
    const px = width - size - 12;
    const py = (height - size) / 2 - 1;
    this.pauseZone.setPosition(px, py);
    this.pauseZone.setSize(size, size);
    const p = this.pauseArt;
    p.clear();
    p.fillStyle(COLORS.brassDark, 1);
    p.fillCircle(px + size / 2, py + size / 2 + 2, size / 2);
    p.fillStyle(COLORS.brass, 1);
    p.fillCircle(px + size / 2, py + size / 2, size / 2);
    p.fillStyle(COLORS.ink, 1);
    p.fillRoundedRect(px + size * 0.32, py + size * 0.28, size * 0.12, size * 0.44, 2);
    p.fillRoundedRect(px + size * 0.56, py + size * 0.28, size * 0.12, size * 0.44, 2);

    const mx = px - size - 12;
    this.musicZone.setPosition(mx, py);
    this.musicZone.setSize(size, size);
    this.musicBox = { x: mx, y: py, size };
    this.drawMusic();

    this.info.setPosition(mx - 16, height / 2);
    this.infoMaxW = mx - 16 - (this.sign.x + this.sign.width + 24);
    this.lastInfo = "";
  }

  /**
   * @param {{ level: number, remainingMs: number, tips: number, mode: string } | null} state
   * @param {number} dtMs
   */
  update(state, dtMs) {
    this.time += dtMs;
    if (!this.options.reducedMotion) {
      // Parpadeo ocasional del neón.
      const flicker = Math.sin(this.time / 97) * Math.sin(this.time / 1531) > 0.92 ? 0.55 : 1;
      this.sign.setAlpha(flicker);
    } else {
      this.sign.setAlpha(1);
    }
    let text = "";
    if (state) {
      const secs = Math.ceil(state.remainingMs / 1000);
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const mode = state.mode === "calma" ? " · Calma" : "";
      text =
        state.mode === "practica"
          ? `Práctica guiada   Propinas ${state.tips}`
          : `Nivel ${state.level}${mode}   ${clock}   Propinas ${state.tips}`;
    }
    if (text !== this.lastInfo) {
      this.lastInfo = text;
      this.info.setText(text);
      fitText(this.info, Math.max(80, this.infoMaxW ?? 400), this.height * 0.5, Math.min(22, this.height * 0.4) * (this.options.largeText ? 1.1 : 1), 10);
    }
  }

  /** @param {boolean} on */
  setMusicOn(on) {
    if (this.musicOn === on) return;
    this.musicOn = on;
    this.drawMusic();
  }

  drawMusic() {
    if (!this.musicBox) return;
    const { x, y, size } = this.musicBox;
    const g = this.musicArt;
    const cx = x + size / 2;
    const cy = y + size / 2;
    g.clear();
    g.fillStyle(COLORS.brassDark, 1);
    g.fillCircle(cx, cy + 2, size / 2);
    g.fillStyle(this.musicOn ? COLORS.brass : COLORS.chromeDark, 1);
    g.fillCircle(cx, cy, size / 2);
    // Corchea.
    const s = size / 52;
    g.fillStyle(COLORS.ink, 1);
    g.fillEllipse(cx - 5 * s, cy + 9 * s, 13 * s, 10 * s);
    g.fillRect(cx + 0.5 * s, cy - 13 * s, 3 * s, 22 * s);
    g.fillTriangle(cx + 3 * s, cy - 13 * s, cx + 3 * s, cy - 3 * s, cx + 12 * s, cy - 4 * s);
    if (!this.musicOn) {
      // Tachada: música apagada.
      g.lineStyle(4 * s, COLORS.brick, 1);
      g.lineBetween(cx - 14 * s, cy + 14 * s, cx + 14 * s, cy - 14 * s);
    }
  }

  musicCenter() {
    return { x: this.musicZone.x + this.musicZone.width / 2, y: this.musicZone.y + this.musicZone.height / 2 };
  }

  pauseCenter() {
    return { x: this.pauseZone.x + this.pauseZone.width / 2, y: this.pauseZone.y + this.pauseZone.height / 2 };
  }
}
