// Dibujo vectorial compartido: recipientes, iconos de modificadores y utilidades de texto.
// Todo se dibuja con Phaser.GameObjects.Graphics; no hay imágenes.

import { COLORS, FONTS, hexToNum } from "./palette.js";

/**
 * @typedef {Object} CupSpec
 * @property {string} vessel        demitasse | cup | glass | tall | jar | togo
 * @property {Array<{color: number, amount: number}>} layers   De abajo hacia arriba; suma ≤ 1.
 * @property {string[]} toppings    dust | heart | dome | ice | stick | sugar
 * @property {number} [dustColor]
 * @property {string|null} mark     decaf
 * @property {boolean} lid
 * @property {{ amp: number, phase: number }} [wave]  Ondulación de la superficie (líquido en movimiento).
 * @property {number} [heartScale]  Avance del dibujo del corazón (0..1).
 */

const VESSELS = {
  // top/bottom: anchos relativos al tamaño; h: alto del cuerpo; saucer: platito; handle: asa.
  demitasse: { top: 0.62, bottom: 0.46, h: 0.46, saucer: true, handle: true, body: COLORS.white, glass: false },
  cup: { top: 0.8, bottom: 0.56, h: 0.56, saucer: true, handle: true, body: COLORS.white, glass: false },
  glass: { top: 0.56, bottom: 0.48, h: 0.7, saucer: false, handle: false, body: 0xe9f0ec, glass: true },
  tall: { top: 0.5, bottom: 0.42, h: 0.92, saucer: false, handle: false, body: 0xe9f0ec, glass: true },
  jar: { top: 0.62, bottom: 0.52, h: 0.66, saucer: false, handle: true, body: COLORS.clay, glass: false, round: true },
  togo: { top: 0.6, bottom: 0.44, h: 0.84, saucer: false, handle: false, body: COLORS.cream, glass: false },
};

/** Geometría del recipiente: útil para colocar vapor, chorros y coberturas. */
export function vesselGeometry(vessel, cx, baseY, size) {
  const v = VESSELS[vessel] ?? VESSELS.cup;
  const h = v.h * size;
  const saucerH = v.saucer ? size * 0.06 : 0;
  const bottomY = baseY - saucerH;
  const topY = bottomY - h;
  return {
    v,
    cx,
    topY,
    bottomY,
    h,
    topW: v.top * size,
    bottomW: v.bottom * size,
    saucerH,
  };
}

function sliceAt(geo, f) {
  // Ancho interior a una fracción f (0 = fondo, 1 = borde) de la altura.
  const inset = geo.v.glass ? 0.86 : 0.88;
  const w = (geo.bottomW + (geo.topW - geo.bottomW) * f) * inset;
  const y = geo.bottomY - geo.h * 0.06 - (geo.h * 0.9) * f;
  return { w, y };
}

/**
 * Dibuja un recipiente con su contenido.
 * @param {Phaser.GameObjects.Graphics} g
 * @param {CupSpec} spec
 * @param {number} cx
 * @param {number} baseY   Base apoyada (incluye el platito).
 * @param {number} size
 */
export function drawCup(g, spec, cx, baseY, size) {
  const vessel = spec.vessel in VESSELS ? spec.vessel : "cup";
  const geo = vesselGeometry(vessel, cx, baseY, size);
  const { v, topY, bottomY, topW, bottomW } = geo;
  const line = Math.max(1.5, size * 0.035);

  // Platito.
  if (v.saucer) {
    g.fillStyle(COLORS.black, 0.25);
    g.fillEllipse(cx, baseY - geo.saucerH * 0.2, topW * 1.5, geo.saucerH * 1.8);
    g.fillStyle(COLORS.white, 1);
    g.fillEllipse(cx, baseY - geo.saucerH * 0.6, topW * 1.45, geo.saucerH * 1.6);
    g.lineStyle(line * 0.8, COLORS.ink, 1);
    g.strokeEllipse(cx, baseY - geo.saucerH * 0.6, topW * 1.45, geo.saucerH * 1.6);
  } else {
    g.fillStyle(COLORS.black, 0.22);
    g.fillEllipse(cx, bottomY + size * 0.02, bottomW * 1.3, size * 0.07);
  }

  // Asa.
  if (v.handle) {
    const hx = cx + (topW + bottomW) / 4 + size * 0.02;
    const hy = topY + geo.h * 0.45;
    g.lineStyle(size * 0.07, COLORS.ink, 1);
    g.strokeCircle(hx + size * 0.06, hy, size * 0.1);
    g.lineStyle(size * 0.045, v.body, 1);
    g.strokeCircle(hx + size * 0.06, hy, size * 0.1);
  }

  const outline = [
    { x: cx - topW / 2, y: topY },
    { x: cx + topW / 2, y: topY },
    { x: cx + bottomW / 2, y: bottomY },
    { x: cx - bottomW / 2, y: bottomY },
  ];

  // Cuerpo.
  if (v.round) {
    g.fillStyle(v.body, 1);
    g.fillEllipse(cx, (topY + bottomY) / 2 + geo.h * 0.05, topW * 1.12, geo.h * 1.05);
    g.fillStyle(COLORS.clayDark, 1);
    g.fillRect(cx - topW / 2, topY - size * 0.02, topW, size * 0.06);
  } else {
    g.fillStyle(v.body, v.glass ? 0.55 : 1);
    g.fillPoints(outline, true);
  }

  // Contenido por capas. La capa de arriba puede ondular (líquido cayendo).
  let level = 0;
  spec.layers.forEach((layer, index) => {
    const f0 = Math.min(1, level);
    const f1 = Math.min(1, level + layer.amount);
    level = f1;
    if (f1 <= f0) return;
    const a = sliceAt(geo, f0);
    const b = sliceAt(geo, f1);
    g.fillStyle(layer.color, 1);
    const points = [
      { x: cx - a.w / 2, y: a.y },
      { x: cx + a.w / 2, y: a.y },
    ];
    if (spec.wave && index === spec.layers.length - 1) {
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const edge = i === 0 || i === n ? 0.3 : 1;
        points.push({ x: cx + b.w / 2 - b.w * t, y: b.y + Math.sin(spec.wave.phase + t * 7) * spec.wave.amp * edge });
      }
    } else {
      points.push({ x: cx + b.w / 2, y: b.y }, { x: cx - b.w / 2, y: b.y });
    }
    g.fillPoints(points, true);
  });
  const surface = sliceAt(geo, Math.max(0.02, level));

  // Coberturas.
  for (const topping of spec.toppings) {
    drawTopping(g, topping, cx, surface, geo, size, spec);
  }

  // Vaso de papel: faja.
  if (vessel === "togo") {
    const a = sliceAt(geo, 0.32);
    const b = sliceAt(geo, 0.62);
    g.fillStyle(COLORS.mustard, 1);
    g.fillPoints(
      [
        { x: cx - a.w / 2 - 2, y: a.y },
        { x: cx + a.w / 2 + 2, y: a.y },
        { x: cx + b.w / 2 + 2, y: b.y },
        { x: cx - b.w / 2 - 2, y: b.y },
      ],
      true,
    );
  }

  // Marca de descafeinado: banda verde.
  if (spec.mark === "decaf") {
    const a = sliceAt(geo, 0.72);
    const b = sliceAt(geo, 0.9);
    g.fillStyle(COLORS.decaf, 1);
    g.fillPoints(
      [
        { x: cx - a.w / 2 - 1, y: a.y },
        { x: cx + a.w / 2 + 1, y: a.y },
        { x: cx + b.w / 2 + 1, y: b.y },
        { x: cx - b.w / 2 - 1, y: b.y },
      ],
      true,
    );
  }

  // Contorno.
  g.lineStyle(line, COLORS.ink, 1);
  if (v.round) {
    g.strokeEllipse(cx, (topY + bottomY) / 2 + geo.h * 0.05, topW * 1.12, geo.h * 1.05);
  } else {
    g.strokePoints(outline, true);
  }
  if (v.glass) {
    g.lineStyle(line * 0.8, COLORS.white, 0.7);
    g.lineBetween(cx - topW * 0.32, topY + geo.h * 0.12, cx - bottomW * 0.3, bottomY - geo.h * 0.15);
  }

  if (spec.lid) {
    g.fillStyle(COLORS.chromeLight, 1);
    g.fillRoundedRect(cx - topW * 0.56, topY - size * 0.08, topW * 1.12, size * 0.1, size * 0.03);
    g.fillRect(cx - topW * 0.4, topY - size * 0.13, topW * 0.8, size * 0.06);
    g.lineStyle(line * 0.8, COLORS.ink, 1);
    g.strokeRoundedRect(cx - topW * 0.56, topY - size * 0.08, topW * 1.12, size * 0.1, size * 0.03);
    g.strokeRect(cx - topW * 0.4, topY - size * 0.13, topW * 0.8, size * 0.06);
  }
  return { ...geo, surfaceY: surface.y, surfaceW: surface.w };
}

function drawTopping(g, topping, cx, surface, geo, size, spec) {
  const w = surface.w;
  const y = surface.y;
  switch (topping) {
    case "dust": {
      g.fillStyle(spec.dustColor ?? 0x5a3420, 1);
      for (let i = 0; i < 9; i++) {
        const t = (i * 0.618) % 1;
        g.fillCircle(cx - w * 0.38 + w * 0.76 * t, y + size * 0.012 + ((i * 7) % 3) * size * 0.012, size * 0.018);
      }
      break;
    }
    case "heart": {
      const r = size * 0.05 * (spec.heartScale ?? 1);
      if (r <= 0.2) break;
      g.fillStyle(COLORS.white, 1);
      g.fillCircle(cx - r * 0.7, y + r * 0.8, r);
      g.fillCircle(cx + r * 0.7, y + r * 0.8, r);
      g.fillTriangle(cx - r * 1.65, y + r * 1.15, cx + r * 1.65, y + r * 1.15, cx, y + r * 2.9);
      break;
    }
    case "dome": {
      g.fillStyle(COLORS.white, 1);
      g.fillEllipse(cx, y, w * 0.95, size * 0.2);
      g.fillCircle(cx, y - size * 0.08, size * 0.06);
      g.lineStyle(Math.max(1, size * 0.02), COLORS.paperEdge, 1);
      g.strokeEllipse(cx, y, w * 0.95, size * 0.2);
      break;
    }
    case "ice": {
      g.fillStyle(0xdff1f2, 0.9);
      g.lineStyle(Math.max(1, size * 0.018), 0x7fb3b9, 1);
      for (const [dx, dy] of [[-0.12, 0.05], [0.08, 0.02], [-0.02, 0.14]]) {
        g.fillRect(cx + dx * size - size * 0.06, y + dy * size, size * 0.12, size * 0.12);
        g.strokeRect(cx + dx * size - size * 0.06, y + dy * size, size * 0.12, size * 0.12);
      }
      break;
    }
    case "stick": {
      g.fillStyle(0x8a4a22, 1);
      g.fillPoints(
        [
          { x: cx + w * 0.1, y: y + size * 0.05 },
          { x: cx + w * 0.22, y: y + size * 0.05 },
          { x: cx + w * 0.62, y: y - size * 0.3 },
          { x: cx + w * 0.5, y: y - size * 0.32 },
        ],
        true,
      );
      break;
    }
    case "sugar": {
      g.fillStyle(COLORS.white, 1);
      g.fillRect(cx - w * 0.25, y - size * 0.02, size * 0.1, size * 0.08);
      g.lineStyle(Math.max(1, size * 0.015), COLORS.paperEdge, 1);
      g.strokeRect(cx - w * 0.25, y - size * 0.02, size * 0.1, size * 0.08);
      break;
    }
    default:
      break;
  }
}

/**
 * Convierte el icono de una bebida del catálogo en un CupSpec lleno.
 * @param {import("../core/catalog.js").Catalog} catalog
 * @param {string} drinkId
 * @param {{ togo?: boolean }} [options]
 * @returns {CupSpec}
 */
export function iconSpec(catalog, drinkId, options = {}) {
  const drink = catalog.drinks[drinkId];
  const icon = drink.icon;
  const n = Math.max(1, icon.layers.length);
  const fullness = icon.topping === "dome" ? 0.78 : 0.86;
  const layers = icon.layers.map((name) => ({ color: hexToNum(catalog.fills[name]), amount: fullness / n }));
  const toppings = icon.topping ? [icon.topping] : [];
  let dustColor;
  if (icon.topping === "dust") {
    const dustStep = drink.steps.map((s) => catalog.steps[s]).find((s) => s.visual === "dust");
    if (dustStep?.color) dustColor = hexToNum(dustStep.color);
  }
  return {
    vessel: options.togo ? "togo" : icon.vessel,
    layers,
    toppings,
    dustColor,
    mark: icon.mark,
    lid: !!options.togo,
  };
}

/**
 * Icono de modificador centrado en (cx, cy).
 * @param {Phaser.GameObjects.Graphics} g
 * @param {string} icon cube | double | oat | lid
 */
export function drawModifierIcon(g, icon, cx, cy, size, ink = COLORS.ink) {
  const s = size;
  const line = Math.max(1.5, s * 0.08);
  g.lineStyle(line, ink, 1);
  switch (icon) {
    case "cube": {
      // Terrón de azúcar en perspectiva.
      const a = s * 0.32;
      const top = [
        { x: cx - a, y: cy - a * 0.35 },
        { x: cx, y: cy - a * 0.85 },
        { x: cx + a, y: cy - a * 0.35 },
        { x: cx, y: cy + a * 0.15 },
      ];
      g.fillStyle(COLORS.white, 1);
      g.fillPoints(top, true);
      g.fillStyle(COLORS.paperShade, 1);
      g.fillPoints([top[0], top[3], { x: cx, y: cy + a * 1.05 }, { x: cx - a, y: cy + a * 0.55 }], true);
      g.fillStyle(0xe9dcc0, 1);
      g.fillPoints([top[3], top[2], { x: cx + a, y: cy + a * 0.55 }, { x: cx, y: cy + a * 1.05 }], true);
      g.strokePoints([top[0], top[1], top[2], { x: cx + a, y: cy + a * 0.55 }, { x: cx, y: cy + a * 1.05 }, { x: cx - a, y: cy + a * 0.55 }], true);
      g.lineBetween(top[0].x, top[0].y, top[3].x, top[3].y);
      g.lineBetween(top[3].x, top[3].y, top[2].x, top[2].y);
      g.lineBetween(top[3].x, top[3].y, cx, cy + a * 1.05);
      break;
    }
    case "double": {
      // Dos granos de café.
      for (const dx of [-0.2, 0.2]) {
        const x = cx + dx * s;
        g.fillStyle(0x5a3420, 1);
        g.fillEllipse(x, cy, s * 0.34, s * 0.5);
        g.strokeEllipse(x, cy, s * 0.34, s * 0.5);
        g.lineStyle(line * 0.8, COLORS.paper, 1);
        g.lineBetween(x - s * 0.04, cy - s * 0.18, x + s * 0.04, cy + s * 0.18);
        g.lineStyle(line, ink, 1);
      }
      break;
    }
    case "oat": {
      // Espiga de avena.
      g.lineBetween(cx, cy + s * 0.42, cx, cy - s * 0.4);
      g.fillStyle(0xd8bf8c, 1);
      for (const [dx, dy, flip] of [[-0.14, -0.22, -1], [0.14, -0.08, 1], [-0.14, 0.06, -1], [0.14, 0.2, 1]]) {
        const x = cx + dx * s;
        const y = cy + dy * s;
        g.fillEllipse(x, y, s * 0.22, s * 0.13);
        g.strokeEllipse(x, y, s * 0.22, s * 0.13);
        void flip;
      }
      break;
    }
    case "lid": {
      // Vaso para llevar con tapa.
      const top = s * 0.5;
      const bottom = s * 0.36;
      const h = s * 0.62;
      const y0 = cy - h / 2 + s * 0.08;
      g.fillStyle(COLORS.cream, 1);
      const pts = [
        { x: cx - top / 2, y: y0 },
        { x: cx + top / 2, y: y0 },
        { x: cx + bottom / 2, y: y0 + h },
        { x: cx - bottom / 2, y: y0 + h },
      ];
      g.fillPoints(pts, true);
      g.fillStyle(COLORS.mustard, 1);
      g.fillRect(cx - top * 0.44, y0 + h * 0.35, top * 0.88, h * 0.28);
      g.strokePoints(pts, true);
      g.fillStyle(COLORS.chromeLight, 1);
      g.fillRoundedRect(cx - top * 0.6, y0 - s * 0.12, top * 1.2, s * 0.13, s * 0.04);
      g.strokeRoundedRect(cx - top * 0.6, y0 - s * 0.12, top * 1.2, s * 0.13, s * 0.04);
      break;
    }
    default: {
      g.fillStyle(COLORS.mustard, 1);
      g.fillCircle(cx, cy, s * 0.3);
      g.strokeCircle(cx, cy, s * 0.3);
    }
  }
}

/** Tornillo de latón decorativo. */
export function drawScrew(g, x, y, r) {
  g.fillStyle(COLORS.brassDark, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(COLORS.brass, 1);
  g.fillCircle(x - r * 0.15, y - r * 0.15, r * 0.78);
  g.lineStyle(Math.max(1, r * 0.3), COLORS.brassDark, 1);
  g.lineBetween(x - r * 0.55, y + r * 0.35, x + r * 0.55, y - r * 0.35);
}

/** Panel con bisel, al estilo de un cartel esmaltado. */
export function drawPanel(g, x, y, w, h, { fill = COLORS.paper, border = COLORS.brassDark, radius = 14, shadow = true, bevel = true } = {}) {
  if (shadow) {
    g.fillStyle(COLORS.black, 0.35);
    g.fillRoundedRect(x + 4, y + 6, w, h, radius);
  }
  g.fillStyle(border, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x + 4, y + 4, w - 8, h - 8, Math.max(2, radius - 3));
  if (bevel) {
    g.fillStyle(COLORS.white, 0.28);
    g.fillRect(x + radius, y + 7, w - radius * 2, Math.max(2, Math.min(5, h * 0.06)));
  }
}

/**
 * Ajusta el tamaño de un texto para que quepa en un rectángulo.
 * @param {Phaser.GameObjects.Text} text
 * @param {number} maxW
 * @param {number} maxH
 * @param {number} baseSize
 * @param {number} [minSize]
 */
export function fitText(text, maxW, maxH, baseSize, minSize = 9) {
  // Wrap básico: no parte palabras; si una palabra no cabe, el ancho excede y se achica la fuente.
  let size = Math.round(baseSize);
  text.setWordWrapWidth(maxW, false);
  text.setFontSize(size);
  while (size > minSize && (text.width > maxW + 0.5 || text.height > maxH + 0.5)) {
    size -= 1;
    text.setFontSize(size);
  }
  return size;
}

/** Estilo de texto base. */
export function textStyle(size, { font = FONTS.body, color = "#2b1d14", bold = false, align = "left" } = {}) {
  return {
    fontFamily: font,
    fontSize: `${Math.round(size)}px`,
    fontStyle: bold ? "bold" : "normal",
    color,
    align,
  };
}

