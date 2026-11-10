// Ajustes y progreso del jugador en localStorage, con respaldo en memoria.
// En el visor de Claude el almacenamiento puede fallar; el juego sigue igual.

const KEY = "barra-sepia:v1";

/**
 * @typedef {Object} Settings
 * @property {number} musicVolume    0..1
 * @property {boolean} musicOn       Música encendida (los efectos no dependen de esto).
 * @property {"auto"|"swing"|"piano"} musicTrack  Pista: automática (piano en Calma y práctica), swing o piano jazz.
 * @property {number} sfxVolume      0..1
 * @property {boolean} muted
 * @property {boolean} reducedMotion
 * @property {boolean} colorBlind
 * @property {boolean} largeText
 * @property {number} sessionMinutes 5..8
 * @property {boolean} calm
 */

/**
 * @typedef {Object} Progress
 * @property {number} lastLevel
 * @property {boolean} practiced   Completó la práctica guiada.
 */

function prefersReducedMotion() {
  try {
    return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** @returns {Settings} */
export function defaultSettings() {
  return {
    musicVolume: 0.5,
    musicOn: true,
    musicTrack: "auto",
    sfxVolume: 0.7,
    muted: false,
    reducedMotion: prefersReducedMotion(),
    colorBlind: false,
    largeText: false,
    sessionMinutes: 5,
    calm: false,
  };
}

function clamp01(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/**
 * @param {any} raw
 * @returns {{ settings: Settings, progress: Progress }}
 */
export function normalizeState(raw) {
  const d = defaultSettings();
  const s = raw && typeof raw === "object" && raw.settings ? raw.settings : {};
  const p = raw && typeof raw === "object" && raw.progress ? raw.progress : {};
  const minutes = Number.isInteger(s.sessionMinutes) ? Math.min(8, Math.max(5, s.sessionMinutes)) : d.sessionMinutes;
  return {
    settings: {
      musicVolume: clamp01(s.musicVolume, d.musicVolume),
      musicOn: typeof s.musicOn === "boolean" ? s.musicOn : d.musicOn,
      musicTrack: ["auto", "swing", "piano"].includes(s.musicTrack) ? s.musicTrack : d.musicTrack,
      sfxVolume: clamp01(s.sfxVolume, d.sfxVolume),
      muted: typeof s.muted === "boolean" ? s.muted : d.muted,
      reducedMotion: typeof s.reducedMotion === "boolean" ? s.reducedMotion : d.reducedMotion,
      colorBlind: typeof s.colorBlind === "boolean" ? s.colorBlind : d.colorBlind,
      largeText: typeof s.largeText === "boolean" ? s.largeText : d.largeText,
      sessionMinutes: minutes,
      calm: typeof s.calm === "boolean" ? s.calm : d.calm,
    },
    progress: {
      lastLevel: Number.isInteger(p.lastLevel) && p.lastLevel >= 1 ? p.lastLevel : 1,
      practiced: p.practiced === true,
    },
  };
}

export function createSettingsStore() {
  let memory = null;
  let persistent = true;
  let state;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    state = normalizeState(raw ? JSON.parse(raw) : null);
    if (!globalThis.localStorage) persistent = false;
  } catch {
    persistent = false;
    state = normalizeState(memory);
  }

  function save() {
    memory = state;
    if (!persistent) return;
    try {
      globalThis.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      persistent = false;
    }
  }

  return {
    get settings() {
      return { ...state.settings };
    },
    get progress() {
      return { ...state.progress };
    },
    get persistent() {
      return persistent;
    },
    /** @param {Partial<Settings>} patch */
    updateSettings(patch) {
      state = normalizeState({ settings: { ...state.settings, ...patch }, progress: state.progress });
      save();
      return { ...state.settings };
    },
    /** @param {Partial<Progress>} patch */
    updateProgress(patch) {
      state = normalizeState({ settings: state.settings, progress: { ...state.progress, ...patch } });
      save();
    },
  };
}
