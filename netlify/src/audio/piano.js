// Pista "Piano jazz": trío de piano de café de los años 50, generado con Web Audio.
// Mano izquierda en stride (bajo en 1 y 3, acorde en 2 y 4), melodía en corcheas con
// swing sobre las notas del acorde, escobillas suaves. Sin archivos de audio.

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 16 compases en Si bemol: dos vueltas de I–vi–ii–V y un puente de dominantes.
// root: nota grave; fifth: quinta grave; voicing: acorde de la mano izquierda;
// tones: notas para la melodía (registro medio-agudo).
const BB = { root: 46, fifth: 53, voicing: [57, 62, 65], tones: [70, 74, 77, 81, 82] }; // Bbmaj7
const GM = { root: 43, fifth: 50, voicing: [58, 62, 65], tones: [67, 70, 74, 77, 79] }; // Gm7
const CM = { root: 48, fifth: 55, voicing: [58, 63, 67], tones: [70, 72, 75, 79, 82] }; // Cm7
const F7 = { root: 41, fifth: 48, voicing: [57, 63, 65], tones: [69, 72, 75, 77, 81] }; // F7
const D7 = { root: 50, fifth: 45, voicing: [57, 60, 66], tones: [69, 72, 74, 78, 81] }; // D7
const G7 = { root: 43, fifth: 50, voicing: [59, 65, 67], tones: [67, 71, 74, 77, 79] }; // G7
const C7 = { root: 48, fifth: 43, voicing: [58, 64, 67], tones: [70, 72, 76, 79, 82] }; // C7

export const PIANO_FORM = Object.freeze([BB, GM, CM, F7, BB, GM, CM, F7, D7, D7, G7, G7, C7, C7, F7, F7]);

// Frases de la mano derecha: por compás, 8 corcheas (índice en `tones`, o null = silencio).
// Se alternan frases con más notas y otras con aire, para que la música respire.
const PHRASES = [
  [2, null, 1, 2, 3, null, 2, null],
  [4, 3, 2, null, 1, null, null, null],
  [null, 1, 2, 3, 4, null, 3, 2],
  [1, null, null, null, 0, null, null, null],
  [3, 2, 3, 4, null, 2, null, 1],
  [2, null, null, 1, 0, null, 1, null],
  [null, null, 2, 3, 4, 3, 2, 1],
  [0, null, null, null, null, null, null, null],
];

export class PianoTrio {
  /** @param {{ ctx: AudioContext, musicGain: GainNode, noise: AudioBuffer }} engine  Con el contexto ya creado. */
  constructor(engine) {
    this.engine = engine;
    // Volumen propio del trío, equilibrado con la pista de swing.
    this.bus = engine.ctx.createGain();
    this.bus.gain.value = 0.28;
    this.bus.connect(engine.musicGain);
  }

  /**
   * Programa un tiempo (negra) de la pista.
   * @param {number} beat  Tiempo absoluto desde que empezó la música.
   * @param {number} t     Instante (segundos de AudioContext).
   * @param {number} beatLen Duración de una negra en segundos.
   */
  playBeat(beat, t, beatLen) {
    const barIndex = Math.floor(beat / 4);
    const bar = PIANO_FORM[barIndex % PIANO_FORM.length];
    const pos = beat % 4;
    const swing = beatLen * (2 / 3);

    // Mano izquierda (stride): bajo en 1 y 3, acorde en 2 y 4.
    if (pos === 0) this.note(bar.root, t, beatLen * 1.6, 0.55);
    else if (pos === 2) this.note(bar.fifth, t, beatLen * 1.6, 0.45);
    else for (const m of bar.voicing) this.note(m, t, beatLen * 0.8, 0.22);

    // Mano derecha: dos corcheas por tiempo, la segunda retrasada (swing).
    const phrase = PHRASES[barIndex % PHRASES.length];
    for (const [k, offset] of [[0, 0], [1, swing]]) {
      const idx = phrase[pos * 2 + k];
      if (idx == null) continue;
      const accent = k === 0 ? 1 : 0.8;
      this.note(bar.tones[idx], t + offset, beatLen * (k === 0 ? 0.9 : 0.6), 0.32 * accent);
    }

    // Escobillas: barrido suave en 2 y 4, toque corto en 1 y 3.
    this.brush(t, pos % 2 === 1 ? beatLen * 0.6 : 0.06, pos % 2 === 1 ? 0.05 : 0.025);
  }

  /**
   * Nota de piano por síntesis aditiva: golpe del martillo, armónicos que se apagan
   * a distinta velocidad, dos cuerdas levemente desafinadas y un filtro que se cierra.
   */
  note(midi, t, dur, velocity) {
    const { ctx } = this.engine;
    const freq = midiToHz(midi);
    const out = ctx.createGain();
    out.gain.value = velocity;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(Math.min(12000, freq * 8), t);
    tone.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), t + Math.min(1.2, dur));
    tone.connect(out).connect(this.bus);

    const release = t + dur + 0.25;
    const partials = [
      [1, 0.6, 1.0],
      [1.0009, 0.4, 1.0], // segunda cuerda, apenas desafinada
      [2, 0.28, 0.7],
      [3, 0.12, 0.45],
      [4, 0.06, 0.3],
    ];
    for (const [mult, amp, sustain] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      // Las notas graves sostienen más; los armónicos altos se apagan antes.
      const decay = Math.max(0.25, (1.6 - midi / 80) * sustain * 1.4);
      g.gain.exponentialRampToValueAtTime(amp * 0.25, t + Math.min(dur, decay));
      g.gain.exponentialRampToValueAtTime(0.0001, release);
      osc.connect(g).connect(tone);
      osc.start(t);
      osc.stop(release + 0.05);
    }

    // Golpe del martillo: ruido muy corto y filtrado.
    const hammer = ctx.createBufferSource();
    hammer.buffer = this.engine.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(9000, freq * 5);
    band.Q.value = 1.2;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.12, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    hammer.connect(band).connect(hg).connect(out);
    hammer.start(t, Math.random() * 0.5, 0.03);
  }

  brush(t, dur, level) {
    const { ctx, noise } = this.engine;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.08, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
}
