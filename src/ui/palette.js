// Paleta y tipografía de Barra Sepia (cafetería de los años 50, dibujo de los 30).

export const COLORS = Object.freeze({
  wall: 0x2a1d15,
  wallStripe: 0x31231a,
  wainscot: 0x5a3a24,
  wainscotLine: 0x6e4a2f,
  counter: 0x7a4f2e,
  counterTop: 0x9c6a3e,
  ink: 0x2b1d14,
  paper: 0xf3e6c9,
  paperShade: 0xe2cfa6,
  paperEdge: 0xc4aa7c,
  mustard: 0xd9a634,
  mustardDark: 0xa87a1c,
  mustardLight: 0xf2cd6f,
  teal: 0x4f8a83,
  tealDark: 0x2f5c56,
  tealLight: 0x86b8ae,
  brick: 0xb04a32,
  brickDark: 0x7d3121,
  brass: 0xc8a25a,
  brassDark: 0x8c6c2f,
  brassLight: 0xeed69a,
  chrome: 0xdcd8cc,
  chromeDark: 0x8f8a7c,
  chromeLight: 0xf8f6ee,
  cream: 0xf7eedb,
  white: 0xfffaf0,
  black: 0x1a120d,
  glow: 0xffd77a,
  steam: 0xfff8ea,
  clay: 0xa65a35,
  clayDark: 0x6f3a20,
  decaf: 0x4f8a5a,
});

export const CSS = Object.freeze({
  ink: "#2b1d14",
  paper: "#f3e6c9",
  cream: "#f7eedb",
  brick: "#b04a32",
  brickDark: "#7d3121",
  mustard: "#d9a634",
  mustardDark: "#a87a1c",
  teal: "#4f8a83",
  tealDark: "#2f5c56",
  brass: "#c8a25a",
  brassLight: "#eed69a",
  coffee: "#4a2f1d",
  white: "#fffaf0",
});

export const FONTS = Object.freeze({
  display: '"Rye", "Georgia", serif',
  type: '"Special Elite", "Courier New", monospace',
  body: '"Libre Baskerville", "Georgia", serif',
});

/** @param {string} hex "#rrggbb" */
export function hexToNum(hex) {
  return parseInt(hex.slice(1), 16);
}

/**
 * Mezcla dos colores numéricos.
 * @param {number} a
 * @param {number} b
 * @param {number} t 0..1
 */
export function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
