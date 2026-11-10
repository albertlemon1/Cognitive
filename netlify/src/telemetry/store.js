// Historial de sesiones: IndexedDB local primero, con respaldo en memoria.

import { TELEMETRY_TYPES } from "../core/stats.js";

const DB_NAME = "barra-sepia";
const DB_VERSION = 1;
const STORE = "sessions";

/**
 * @typedef {Object} SessionRecord
 * @property {string} id
 * @property {string} startedAt      ISO 8601
 * @property {number} seed
 * @property {string} levelId
 * @property {"normal"|"calma"} mode
 * @property {number} durationMs
 * @property {number} endLevel
 * @property {import("../core/stats.js").SessionSummary} summary
 * @property {Array<Record<string, any>>} events
 */

/**
 * Filtra el registro de una sesión para guardarlo.
 * @param {Array<Record<string, any>>} log
 */
export function telemetryEvents(log) {
  const allowed = new Set(TELEMETRY_TYPES);
  return log.filter((e) => allowed.has(e.type));
}

function memoryStore() {
  /** @type {SessionRecord[]} */
  const records = [];
  return {
    persistent: false,
    async saveSession(record) {
      const i = records.findIndex((r) => r.id === record.id);
      if (i >= 0) records[i] = record;
      else records.push(record);
    },
    async listSessions(limit = 50) {
      return records.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-limit);
    },
  };
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Abre el almacén. Nunca rechaza: si IndexedDB no está disponible, usa memoria.
 * @param {{ timeoutMs?: number }} [options]
 */
export async function openStore(options = {}) {
  const idb = globalThis.indexedDB;
  if (!idb) return memoryStore();
  try {
    const db = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("IndexedDB no respondió")), options.timeoutMs ?? 2000);
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timer);
        reject(new Error("IndexedDB bloqueada"));
      };
    });
    const fallback = memoryStore();
    let broken = false;
    return {
      persistent: true,
      async saveSession(record) {
        if (broken) return fallback.saveSession(record);
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(record);
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
        } catch {
          broken = true;
          await fallback.saveSession(record);
        }
      },
      async listSessions(limit = 50) {
        if (broken) return fallback.listSessions(limit);
        try {
          const tx = db.transaction(STORE, "readonly");
          const all = await promisify(tx.objectStore(STORE).index("startedAt").getAll());
          return all.slice(-limit);
        } catch {
          broken = true;
          return fallback.listSessions(limit);
        }
      },
    };
  } catch {
    return memoryStore();
  }
}
