// Sonido generado con Web Audio: un combo de swing (contrabajo, platillo, acordes),
// crujido de disco y efectos de la máquina. Sin archivos de audio.

const CHORDS = [
  // ii–V–I–VI en Fa, notas MIDI: bajo caminante y acorde.
  { walk: [43, 46, 50, 52], chord: [55, 58, 62, 65] }, // Gm7
  { walk: [48, 52, 55, 58], chord: [52, 58, 60, 64] }, // C7
  { walk: [41, 45, 48, 50], chord: [53, 57, 60, 64] }, // Fmaj7
  { walk: [50, 54, 57, 49], chord: [54, 57, 60, 62] }, // D7
];

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.settings = { musicVolume: 0.5, sfxVolume: 0.7, muted: false };
    this.playing = false;
    this.tempo = 96;
    this.targetTempo = 96;
    this.nextBeatTime = 0;
    this.beat = 0;
    this.timer = null;
    this.noise = null;
  }

  /** Debe llamarse desde un gesto del usuario (toque o clic). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return true;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    // Ruido blanco reutilizable.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    this.noise = buffer;
    this.applySettings(this.settings);
    return true;
  }

  /** @param {{ musicVolume: number, sfxVolume: number, muted: boolean }} settings */
  applySettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, now, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.32, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume * 0.8, now, 0.02);
  }

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.nextBeatTime = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** @param {number} pressure 0..1 (comandas pendientes, hora punta) */
  setPressure(pressure) {
    this.targetTempo = 96 + Math.max(0, Math.min(1, pressure)) * 32;
  }

  suspend() {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  schedule() {
    if (!this.ctx || !this.playing) return;
    const ctx = this.ctx;
    // Si la pestaña estuvo dormida, no recuperar compases perdidos.
    if (this.nextBeatTime < ctx.currentTime - 0.2) this.nextBeatTime = ctx.currentTime + 0.05;
    while (this.nextBeatTime < ctx.currentTime + 0.12) {
      this.playBeat(this.beat, this.nextBeatTime);
      this.tempo += (this.targetTempo - this.tempo) * 0.05;
      this.nextBeatTime += 60 / this.tempo;
      this.beat += 1;
    }
  }

  playBeat(beat, t) {
    const bar = Math.floor(beat / 4) % CHORDS.length;
    const pos = beat % 4;
    const chord = CHORDS[bar];
    const beatLen = 60 / this.tempo;
    const swing = beatLen * (2 / 3);

    this.bass(midiToHz(chord.walk[pos]), t, beatLen * 0.9);
    // Platillo con swing: 1, 2-y, 3, 4-y.
    this.ride(t, pos % 2 === 0 ? 0.5 : 0.35);
    if (pos % 2 === 1) this.ride(t + swing, 0.25);
    // Acordes en 2 y 4 (comping suave).
    if (pos === 1 || pos === 3) this.chord(chord.chord.map(midiToHz), t, beatLen * 0.45);
    // Crujido de disco.
    if (Math.random() < 0.6) this.crackle(t + Math.random() * beatLen);
  }

  bass(freq, t, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  ride(t, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * 0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(filter).connect(gain).connect(this.musicGain);
    src.start(t, Math.random() * 0.5, 0.2);
  }

  chord(freqs, t, dur) {
    const ctx = this.ctx;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  crackle(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05 + Math.random() * 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
    src.connect(gain).connect(this.musicGain);
    src.start(t, Math.random() * 0.9, 0.012);
  }

  // --- Efectos ---------------------------------------------------------------

  /** @param {"click"|"toggle"|"lever"|"grind"|"pour"|"steam"|"ding"|"cough"|"miss"|"flip"|"level-up"|"level-down"|"clean"} name */
  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case "click":
        return this.blip(t, 520, 0.05, "square", 0.12);
      case "toggle":
        this.blip(t, 300, 0.03, "square", 0.15);
        return this.blip(t + 0.04, 420, 0.03, "square", 0.1);
      case "lever":
        this.thud(t, 90, 0.25);
        return this.hiss(t + 0.05, 0.25, 1800, 0.15);
      case "grind":
        return this.hiss(t, 0.7, 900, 0.22, 30);
      case "pour":
        return this.hiss(t, 0.5, 500, 0.12);
      case "steam":
        return this.hiss(t, 0.6, 3000, 0.18);
      case "ding":
        this.bell(t, 1318.5, 0.9);
        return this.bell(t + 0.12, 1760, 0.7);
      case "cough":
        this.hiss(t, 0.18, 400, 0.35, 12);
        return this.hiss(t + 0.26, 0.2, 350, 0.35, 12);
      case "miss":
        this.blip(t, 330, 0.18, "triangle", 0.2);
        return this.blip(t + 0.18, 247, 0.3, "triangle", 0.2);
      case "flip":
        return this.hiss(t, 0.08, 2500, 0.12);
      case "level-up":
        [523, 659, 784].forEach((f, i) => this.bell(t + i * 0.09, f, 0.5));
        return;
      case "level-down":
        [523, 440].forEach((f, i) => this.bell(t + i * 0.12, f, 0.35));
        return;
      case "clean":
        return this.hiss(t, 0.5, 4500, 0.08, 6);
      default:
        return;
    }
  }

  blip(t, freq, dur, type, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  thud(t, freq, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 2, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  hiss(t, dur, freq, level, amHz = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.03);
    gain.gain.setValueAtTime(level, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src.connect(filter);
    if (amHz > 0) {
      const am = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = amHz;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      am.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      node = node.connect(am);
    }
    node.connect(gain).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  bell(t, freq, level) {
    const ctx = this.ctx;
    for (const [mult, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level * amp * 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1 / mult);
      osc.connect(gain).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 1.2);
    }
  }
}
