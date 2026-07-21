"use client";

/**
 * voice-notes.ts — NOTAS DE VOZ adjuntas a cada mensaje de Astraura (Adenda 87).
 * ============================================================================
 * Cuando un motor NEURAL da voz a una respuesta, `neural-tts.ts` emite un evento
 * `starseed:voice-note` por CADA trozo generado. Este módulo ESCUCHA ese evento
 * (una sola vez, vía `initVoiceNotesCapture()`), acumula los trozos por
 * `textHash` (el djb2 del texto normalizado — liga audio ↔ mensaje SIN ids) y los
 * guarda en IndexedDB para poder RE-REPRODUCIR el audio exacto que sonó, ya
 * anclado a su mensaje en el chat.
 *
 * ── ALMACÉN ─────────────────────────────────────────────────────────────────
 *   · IndexedDB "starseed-voice-notes" · store "notes" · key = textHash.
 *   · Registro: { textHash, chunks: Blob[], chunkCount, engine, personalityId?, at }.
 *   · Límite LRU ~40 notas (los Blobs pesan): al superarlo se borran las más
 *     viejas por `at`. La lógica pura de LRU y de orden de trozos vive en
 *     funciones exportadas y testeables (scripts/test-voice-notes.ts) SIN tocar
 *     IndexedDB real.
 *
 * ── CONTINUIDAD DE VOZ POR PERSONALIDAD (Misión 2) ──────────────────────────
 * Al capturar una nota se guarda TAMBIÉN la personalidad activa. `getLastVoiceSampleFor`
 * devuelve el trozo 0 más reciente de una personalidad: la CAPA WEB del mismo
 * principio que el daemon local, que ya clona `refs/<kind>.wav` como referencia
 * de identidad. Un motor futuro puede usar esa muestra como semilla de clonación
 * (misma voz de mensaje a mensaje) sin depender del daemon.
 *
 * ── SYNC EN CUENTA (Adenda 87-bis) ──────────────────────────────────────────
 * Cuando una nota queda COMPLETA (todos sus trozos recibidos), `persistChunk`
 * dispara `syncVoiceNote` en segundo plano (fire-and-forget): reensambla el
 * Blob, lo sube al bucket `os-files` (carpeta `voice-notes/<convId>`, vía
 * `uploadFile()` de `src/lib/files/os-files.ts`) y guarda la referencia
 * `{path,url,engine,chunkCount,at}` en `aurora_conversations.meta.voiceNotes
 * [textHash]` (vía `persistVoiceNoteRef` de `conversations.ts` — mismo patrón
 * read-modify-write que `patchCachedConversationConfig`/`writeConversationConfig`,
 * y `meta` ya baja con `fetchConversationsFromCloud`, así que leerlo de vuelta
 * no cuesta una llamada de red extra). Así CUALQUIER neurona logueada con la
 * MISMA CUENTA que abra ESE chat encuentra el audio y reproduce el MISMO
 * mensaje de voz (`getVoiceNoteCloud`), sin volver a sintetizarlo.
 *
 * ⚠️ ALCANCE: SOLO CUENTA (RLS por `user_id`, tanto en `aurora_conversations`
 * como en `os_files`). El alcance "grupo" (compartir la nota con otros
 * miembros de un chat/grupo compartido, más allá del dueño de la cuenta) NO
 * tiene modelo de datos hoy — no existe tabla ni política RLS de notas de voz
 * de grupo — así que NO se implementa: queda solo documentado aquí. Cuando
 * exista esa superficie, ese índice no puede colgar sin más de este `meta` por
 * cuenta; necesitará su propia tabla/RLS de grupo.
 *
 * Requiere sesión Supabase (sin ella, `syncVoiceNote` no hace nada: el audio
 * sigue disponible LOCAL como siempre). Fire-and-forget, defensivo, NUNCA lanza.
 *
 * SSR-safe (IndexedDB solo se toca dentro de funciones), defensivo, NUNCA lanza.
 */

import { VOICE_NOTE_EVENT, voiceTextHash } from "@/lib/aurora/tts-oss/neural-tts";
// Tipo SOLO (se borra al compilar): la forma del índice en `meta.voiceNotes`
// vive en conversations.ts (dueño del esquema de `aurora_conversations`). Sin
// ciclo real: este import se elimina en tiempo de compilación.
import type { VoiceNoteRef } from "@/lib/aurora/conversations";

// Re-exporto el hash para que la nota y el mensaje se liguen desde un único sitio.
export { voiceTextHash, VOICE_NOTE_EVENT };

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Nota de voz tal y como la ve el consumidor (trozos ya compactados y en orden). */
export interface VoiceNote {
  textHash: string;
  /** Trozos de audio EN SECUENCIA (index 0..n-1), sin huecos. */
  chunks: Blob[];
  /** Nº de trozos que el motor dijo que generaría (para saber si está completa). */
  chunkCount: number;
  /** Motor que la generó ("openvoice2", "omnivoice"…). */
  engine: string;
  /** Personalidad activa cuando se generó (continuidad de voz). */
  personalityId: string | null;
  /** Última actualización (ms epoch) — clave del LRU. */
  at: number;
}

/**
 * Registro tal y como se ALMACENA: los trozos pueden llegar prefetcheados y en
 * teoría fuera de orden, así que se guardan en un array DISPERSO (null = hueco)
 * indexado por `chunkIndex`. Se compacta solo al leer/reproducir. Guardar el
 * índice real preserva el orden entre escrituras sucesivas.
 */
interface StoredNote {
  textHash: string;
  chunks: (Blob | null)[];
  chunkCount: number;
  engine: string;
  personalityId: string | null;
  at: number;
  /**
   * Conversación de origen (Adenda 87-bis · sync en cuenta). La fija el PRIMER
   * trozo, igual que `personalityId`. null si Aurora habló sin chat activo
   * registrado (`activeAuroraChatId()`) — la nota se guarda igual, solo que
   * `persistChunk` no la ofrece a `syncVoiceNote` (no sabría dónde indexarla).
   */
  convId: string | null;
}

/** Detalle del evento `starseed:voice-note` que emite neural-tts.ts. */
interface VoiceNoteEventDetail {
  textHash: string;
  chunkIndex: number;
  chunkCount: number;
  engine: string;
  blob: Blob;
  /**
   * ⚠️ DEBE COINCIDIR con el detalle que arma `emitVoiceNote` en neural-tts.ts.
   * Conversación de Aurora activa cuando se generó este trozo (Adenda 87-bis).
   * Opcional: puede faltar si no había chat de Aurora registrado como activo.
   */
  convId?: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const DB_NAME = "starseed-voice-notes";
const DB_VERSION = 1;
const STORE = "notes";
/** Tope de notas guardadas (los Blobs pesan): LRU por `at`. */
export const VOICE_NOTES_LIMIT = 40;

// ═════════════════════════════════════════════════════════════════════════════
// LÓGICA PURA (testeable sin IndexedDB — scripts/test-voice-notes.ts)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Limpia el texto EXACTAMENTE como lo hace el engine antes de mandarlo a la cadena
 * neural (engine.ts::speak, rama `cleanChain`): quita la directiva `[[goto:…]]` y
 * los símbolos de markdown, PERO conserva la puntuación de frase (la prosodia y el
 * troceo dependen de ella). Es lo que se HASHEA para ligar la nota con el mensaje.
 *
 * ⚠️ DEBE COINCIDIR con engine.ts (misma expresión regular). Si allí cambia la
 * limpieza, cámbiala aquí también o las notas dejarán de casar con su mensaje.
 * PURO — se usa para calcular el textHash canónico de un mensaje y al regenerar.
 */
export function cleanTextForVoiceChain(text: string): string {
  const sinDirectivas = (text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "");
  // Rama del NAVEGADOR (fallback): quita también puntuación.
  const clean = sinDirectivas
    .replace(/[*_~`´#|><.,;:\-[\](){}\\/"—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Rama NEURAL: quita markdown/símbolos, conserva la puntuación de frase.
  let cleanChain = sinDirectivas
    .replace(/[*_~`´#|><[\](){}\\/"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean && !cleanChain) return "";
  if (!cleanChain) cleanChain = clean; // texto todo-símbolos: cae a la limpieza dura
  return cleanChain;
}

/**
 * Hash CANÓNICO de un mensaje para su nota de voz: aplica la misma limpieza que la
 * cadena neural y luego `voiceTextHash`. Úsalo SIEMPRE para buscar/guardar la nota
 * de un mensaje (así casa con lo que emite neural-tts al hablar y al regenerar).
 */
export function voiceNoteHashForMessage(text: string): string {
  return voiceTextHash(cleanTextForVoiceChain(text));
}

/**
 * Coloca `value` en la posición `index` de un array DISPERSO, rellenando los
 * huecos previos con `null`. Preserva el orden de los trozos aunque lleguen
 * prefetcheados o fuera de secuencia. PURO. Nunca muta la entrada.
 */
export function placeChunkInOrder<T>(
  existing: (T | null)[],
  index: number,
  value: T,
): (T | null)[] {
  const out = existing.slice();
  if (index < 0) return out;
  while (out.length <= index) out.push(null);
  out[index] = value;
  return out;
}

/** Compacta un array disperso quitando los huecos (null), conservando el orden. PURO. */
export function compactChunks<T>(chunks: (T | null)[]): T[] {
  return chunks.filter((c): c is T => c != null);
}

/**
 * Dado un conjunto de entradas { key, at } y un límite, devuelve las KEYS que hay
 * que EXPULSAR para no superar el límite: las más viejas por `at` (LRU). Devuelve
 * [] si no hay exceso. PURO — es el corazón del recorte, testeado con fixtures.
 */
export function chooseEvictions(
  entries: { key: string; at: number }[],
  limit: number,
): string[] {
  if (limit <= 0) return entries.map((e) => e.key);
  if (entries.length <= limit) return [];
  const sorted = [...entries].sort((a, b) => a.at - b.at); // más viejo primero
  return sorted.slice(0, entries.length - limit).map((e) => e.key);
}

/**
 * Aplica un trozo entrante a un registro almacenado (o crea uno nuevo). PURO: no
 * toca disco. Coloca el trozo en su índice, actualiza motor/personalidad/`at` y
 * eleva `chunkCount` al máximo observado. Reutilizado por el capturador y por los
 * tests para verificar el ensamblado de trozos.
 */
export function applyChunkToNote(
  prev: StoredNote | null,
  ev: {
    textHash: string;
    chunkIndex: number;
    chunkCount: number;
    engine: string;
    blob: Blob;
    personalityId: string | null;
    at: number;
    /** Conversación de origen del trozo (Adenda 87-bis). Puede faltar. */
    convId?: string | null;
  },
): StoredNote {
  const base: StoredNote =
    prev && prev.textHash === ev.textHash
      ? prev
      : {
          textHash: ev.textHash,
          chunks: [],
          chunkCount: 0,
          engine: ev.engine,
          personalityId: ev.personalityId,
          at: ev.at,
          convId: ev.convId ?? null,
        };
  return {
    textHash: ev.textHash,
    chunks: placeChunkInOrder(base.chunks, ev.chunkIndex, ev.blob),
    chunkCount: Math.max(base.chunkCount, ev.chunkCount, ev.chunkIndex + 1),
    engine: ev.engine || base.engine,
    // La personalidad la fija el PRIMER trozo (todos son del mismo turno).
    personalityId: base.personalityId ?? ev.personalityId,
    // La conversación la fija el PRIMER trozo, igual que la personalidad.
    convId: base.convId ?? ev.convId ?? null,
    at: Math.max(base.at, ev.at),
  };
}

/** Vista pública (compacta) de un registro almacenado. PURO. */
function toPublic(rec: StoredNote): VoiceNote {
  return {
    textHash: rec.textHash,
    chunks: compactChunks(rec.chunks),
    chunkCount: rec.chunkCount,
    engine: rec.engine,
    personalityId: rec.personalityId ?? null,
    at: rec.at,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CAPA IndexedDB (defensiva; null/no-op si no hay soporte)
// ═════════════════════════════════════════════════════════════════════════════

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIDB()) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "textHash" });
            store.createIndex("at", "at", { unique: false });
            store.createIndex("personalityId", "personalityId", { unique: false });
          }
        } catch {
          /* */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<StoredNote | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as StoredNote) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGetAll(db: IDBDatabase): Promise<StoredNote[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredNote[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function idbPut(db: IDBDatabase, rec: StoredNote): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbDelete(db: IDBDatabase, keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    if (keys.length === 0) return resolve();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const k of keys) {
        try {
          store.delete(k);
        } catch {
          /* */
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// API PÚBLICA — lectura / borrado / sync
// ═════════════════════════════════════════════════════════════════════════════

/** Nota de voz de un mensaje (por su textHash), o null si no hay audio guardado. */
export async function getVoiceNote(textHash: string): Promise<VoiceNote | null> {
  if (!textHash) return null;
  const db = await openDb();
  if (!db) return null;
  const rec = await idbGet(db, textHash);
  return rec ? toPublic(rec) : null;
}

/** ¿Hay audio guardado para este mensaje? (barato: solo lee la clave). */
export async function hasVoiceNote(textHash: string): Promise<boolean> {
  const note = await getVoiceNote(textHash);
  return !!note && note.chunks.length > 0;
}

/** Borra la nota de voz de un mensaje (p.ej. antes de regenerarla). Idempotente. */
export async function deleteVoiceNote(textHash: string): Promise<void> {
  if (!textHash) return;
  const db = await openDb();
  if (!db) return;
  await idbDelete(db, [textHash]);
}

/**
 * CONTINUIDAD DE VOZ (Misión 2). Trozo 0 (la cabeza de la locución) de la nota
 * MÁS RECIENTE de una personalidad — su "muestra" de timbre para que un motor la
 * use como referencia de clonación web. null si esa personalidad aún no ha hablado.
 */
export async function getLastVoiceSampleFor(
  personalityId: string | null | undefined,
): Promise<Blob | null> {
  if (!personalityId) return null;
  const db = await openDb();
  if (!db) return null;
  const all = await idbGetAll(db);
  const mine = all
    .filter((r) => r.personalityId === personalityId)
    .sort((a, b) => b.at - a.at);
  for (const rec of mine) {
    const head = compactChunks(rec.chunks)[0];
    if (head) return head;
  }
  return null;
}

/**
 * SINCRONIZA EN CUENTA (Adenda 87-bis) la nota de voz de `textHash`, SI ya está
 * COMPLETA (todos sus trozos recibidos): reensambla el Blob, lo sube al bucket
 * `os-files` (carpeta `voice-notes/<convId>`, vía `uploadFile()`) y guarda la
 * referencia `{path,url,engine,chunkCount,at}` en
 * `aurora_conversations.meta.voiceNotes[textHash]` (vía `persistVoiceNoteRef`
 * de `conversations.ts`) — así CUALQUIER neurona logueada con la MISMA CUENTA
 * que abra ESTE chat encuentra y reproduce el MISMO audio (`getVoiceNoteCloud`).
 *
 * La dispara automáticamente `persistChunk` en cuanto una nota se completa (no
 * hace falta invocarla a mano); queda exportada por si la UI quisiera forzar un
 * reintento.
 *
 * ── ALCANCE: SOLO CUENTA (RLS por `user_id`, en `aurora_conversations` y en
 * `os_files`) ── El alcance "grupo" NO tiene modelo de datos hoy — ver cabecera
 * del módulo — y esta función NUNCA lo sirve.
 *
 * Fire-and-forget, defensivo, NUNCA lanza. Sin sesión Supabase no hace nada (el
 * audio sigue disponible LOCAL, como siempre). Devuelve true SOLO si quedó
 * subida + indexada; false en cualquier otro caso (incompleta, sin sesión, sin
 * convId, fallo de red/subida…).
 */
export async function syncVoiceNote(textHash: string, convId: string): Promise<boolean> {
  try {
    if (!textHash || !convId || typeof window === "undefined") return false;
    const note = await getVoiceNote(textHash);
    if (!note || note.chunks.length === 0 || note.chunks.length !== note.chunkCount) {
      return false; // sin audio local, o aún incompleta: nada que subir todavía
    }

    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return false; // sin sesión: no hay cuenta a la que sincronizar

    const mime = note.chunks[0]?.type || "audio/wav";
    const ext = mime.includes("mpeg")
      ? "mp3"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("webm")
          ? "webm"
          : "wav";
    const blob = new Blob(note.chunks, { type: mime });
    const file = new File([blob], `${textHash}.${ext}`, { type: mime });

    const { uploadFile } = await import("@/lib/files/os-files");
    const uploaded = await uploadFile(file, { folder: `voice-notes/${convId}` });
    if (!uploaded.ok || !uploaded.file) return false;

    const ref: VoiceNoteRef = {
      path: uploaded.file.path,
      url: uploaded.file.url || "",
      engine: note.engine,
      chunkCount: note.chunkCount,
      at: Date.now(),
    };
    const { persistVoiceNoteRef } = await import("@/lib/aurora/conversations");
    await persistVoiceNoteRef(convId, textHash, ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * NOTA DE VOZ EN LA NUBE (Adenda 87-bis). Si ESTA neurona no tiene el audio
 * local (`getVoiceNote` → null), busca la referencia indexada en
 * `aurora_conversations.meta.voiceNotes[textHash]` —YA bajada por
 * `fetchConversationsFromCloud`/cacheada en `cachedConversations()`, SIN
 * llamada de red extra—, descarga el audio de `os-files` y lo envuelve como una
 * `VoiceNote` de UN solo trozo (el audio en la nube ya viene reensamblado por
 * `syncVoiceNote`). Cachea el resultado en IndexedDB local (idbPut) para que la
 * PRÓXIMA vez ya esté ahí sin tocar la red.
 *
 * ── ALCANCE: SOLO CUENTA ── ver `syncVoiceNote` — el alcance "grupo" no tiene
 * modelo de datos hoy y esta función nunca lo sirve.
 *
 * Defensiva, NUNCA lanza. null si no hay nota (ni local ni en la nube).
 */
export async function getVoiceNoteCloud(textHash: string, convId: string): Promise<VoiceNote | null> {
  if (!textHash || !convId) return null;
  try {
    const local = await getVoiceNote(textHash);
    if (local) return local;

    const { cachedConversations } = await import("@/lib/aurora/conversations");
    const conv = cachedConversations().find((c) => c.id === convId);
    const notes = (conv?.meta as { voiceNotes?: Record<string, VoiceNoteRef> } | null | undefined)?.voiceNotes;
    const ref = notes?.[textHash];
    if (!ref?.url) return null;

    const res = await fetch(ref.url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    const at = Number.isFinite(ref.at) ? ref.at : Date.now();
    const engine = ref.engine || "cloud";

    // Cachea local para la próxima vez (mismo formato que persistChunk).
    try {
      const db = await openDb();
      if (db) {
        await idbPut(db, {
          textHash,
          chunks: [blob],
          chunkCount: 1,
          engine,
          personalityId: null,
          at,
          convId,
        });
      }
    } catch {
      /* cachear es un bonus; el audio ya se puede devolver igual */
    }

    return { textHash, chunks: [blob], chunkCount: 1, engine, personalityId: null, at };
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CAPTURA — escucha `starseed:voice-note` una sola vez
// ═════════════════════════════════════════════════════════════════════════════

let captureInstalled = false;
/** Serializa las escrituras (read-modify-write) para evitar carreras entre trozos. */
let writeChain: Promise<void> = Promise.resolve();

/** Personalidad activa AHORA (import dinámico; mismo patrón que neural-tts). */
async function resolveActivePersonalityId(): Promise<string | null> {
  try {
    const mod = await import("@/lib/aurora/personalities");
    const profile = mod.getActivePersonality?.();
    return profile?.id ?? null;
  } catch {
    return null;
  }
}

async function persistChunk(ev: VoiceNoteEventDetail): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const personalityId = await resolveActivePersonalityId();
  const prev = await idbGet(db, ev.textHash);
  const next = applyChunkToNote(prev, {
    textHash: ev.textHash,
    chunkIndex: ev.chunkIndex,
    chunkCount: ev.chunkCount,
    engine: ev.engine,
    blob: ev.blob,
    personalityId,
    at: Date.now(),
    convId: ev.convId ?? null,
  });
  const okPut = await idbPut(db, next);
  if (!okPut) return;
  // Recorte LRU: solo hace falta comprobar cuando cerramos una locución (o de vez
  // en cuando); barato con ≤40 registros. Leemos claves+at y expulsamos el exceso.
  const all = await idbGetAll(db);
  const evict = chooseEvictions(
    all.map((r) => ({ key: r.textHash, at: r.at })),
    VOICE_NOTES_LIMIT,
  );
  if (evict.length) await idbDelete(db, evict);

  // SYNC EN CUENTA (Adenda 87-bis): en cuanto la nota queda COMPLETA (todos sus
  // trozos recibidos) y sabemos a qué conversación pertenece, la subimos e
  // indexamos en segundo plano. Fire-and-forget: nunca bloquea ni rompe la
  // captura, y `syncVoiceNote` es defensivo (sin sesión no hace nada).
  const isComplete = compactChunks(next.chunks).length === next.chunkCount && next.chunkCount > 0;
  if (isComplete && next.convId) {
    void syncVoiceNote(next.textHash, next.convId);
  }
}

/**
 * Instala (una sola vez) el capturador de notas de voz. Llamar desde el contenedor
 * del chat (chat-surface). Idempotente y SSR-safe. Devuelve una función para
 * desinstalar (útil en cleanups de efectos, aunque normalmente vive toda la sesión).
 */
export function initVoiceNotesCapture(): () => void {
  if (typeof window === "undefined") return () => {};
  if (captureInstalled) return () => {};
  captureInstalled = true;

  const handler = (e: Event) => {
    try {
      const detail = (e as CustomEvent<VoiceNoteEventDetail>).detail;
      if (!detail || !detail.textHash || !detail.blob) return;
      // Encadena para serializar el read-modify-write por si dos trozos coinciden.
      writeChain = writeChain
        .then(() => persistChunk(detail))
        .catch(() => {
          /* nunca romper la cadena de captura */
        });
    } catch {
      /* */
    }
  };

  window.addEventListener(VOICE_NOTE_EVENT, handler as EventListener);
  return () => {
    try {
      window.removeEventListener(VOICE_NOTE_EVENT, handler as EventListener);
    } catch {
      /* */
    }
    captureInstalled = false;
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REPRODUCCIÓN — trozos EN SECUENCIA con un solo controlador (play/pause/stop)
// ═════════════════════════════════════════════════════════════════════════════

export interface VoiceNotePlayback {
  /** Pausa la reproducción (conserva la posición). */
  pause(): void;
  /** Reanuda tras una pausa. */
  resume(): void;
  /** Detiene del todo y libera recursos. Idempotente. */
  stop(): void;
}

export interface PlayVoiceNoteOptions {
  onEnded?: () => void;
  onError?: (message: string) => void;
  /** Avisa al empezar cada trozo (i, total) — útil para una barra de progreso. */
  onChunk?: (index: number, total: number) => void;
}

/** Reproducción en curso (una a la vez en todo el OS). */
let activePlayback: { stop: () => void } | null = null;

/**
 * Reproduce la nota de voz de un mensaje: sus trozos EN SECUENCIA, con UN solo
 * elemento <audio> reutilizado (reasigna `src` por trozo). Corta cualquier
 * reproducción de nota anterior. Devuelve un controlador con pause/resume/stop, o
 * null si no hay nota. NUNCA lanza.
 */
export async function playVoiceNote(
  textHash: string,
  opts: PlayVoiceNoteOptions = {},
): Promise<VoiceNotePlayback | null> {
  if (typeof window === "undefined") return null;
  const note = await getVoiceNote(textHash);
  if (!note || note.chunks.length === 0) return null;

  // Una nota a la vez: corta la anterior.
  stopVoiceNotePlayback();

  const chunks = note.chunks;
  const audio = new Audio();
  let idx = 0;
  let stopped = false;
  let currentUrl: string | null = null;

  const revoke = () => {
    if (currentUrl) {
      try {
        URL.revokeObjectURL(currentUrl);
      } catch {
        /* */
      }
      currentUrl = null;
    }
  };

  const finish = (err?: string) => {
    if (stopped) return;
    stopped = true;
    revoke();
    try {
      audio.pause();
      audio.src = "";
    } catch {
      /* */
    }
    if (activePlayback === controller) activePlayback = null;
    if (err) {
      try {
        opts.onError?.(err);
      } catch {
        /* */
      }
    }
    try {
      opts.onEnded?.();
    } catch {
      /* */
    }
  };

  const playAt = (i: number) => {
    if (stopped) return;
    if (i >= chunks.length) {
      finish();
      return;
    }
    idx = i;
    revoke();
    try {
      currentUrl = URL.createObjectURL(chunks[i]);
      audio.src = currentUrl;
      try {
        opts.onChunk?.(i, chunks.length);
      } catch {
        /* */
      }
      const p = audio.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => finish("El navegador bloqueó la reproducción (requiere gesto)."));
      }
    } catch {
      finish("No se pudo reproducir la nota de voz.");
    }
  };

  audio.onended = () => {
    if (stopped) return;
    playAt(idx + 1);
  };
  audio.onerror = () => finish("Fallo al reproducir la nota de voz.");

  const controller: VoiceNotePlayback = {
    pause() {
      try {
        audio.pause();
      } catch {
        /* */
      }
    },
    resume() {
      if (stopped) return;
      try {
        const p = audio.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            /* gesto requerido */
          });
        }
      } catch {
        /* */
      }
    },
    stop() {
      finish();
    },
  };

  activePlayback = controller;
  playAt(0);
  return controller;
}

/** Corta cualquier reproducción de nota de voz en curso. Idempotente. */
export function stopVoiceNotePlayback(): void {
  try {
    activePlayback?.stop();
  } catch {
    /* */
  }
  activePlayback = null;
}

/**
 * Duración estimada de una nota (ms), midiendo los metadatos de cada trozo. Si el
 * navegador no da metadatos, cae a una estimación por tamaño (WAV PCM ≈ 88 kB/s).
 * Defensiva; 0 si no hay nota. Pensada para pintar "~Xs" en el mini reproductor.
 */
export async function getVoiceNoteDurationMs(textHash: string): Promise<number> {
  const note = await getVoiceNote(textHash);
  if (!note || note.chunks.length === 0) return 0;
  let total = 0;
  for (const blob of note.chunks) {
    total += await blobDurationMs(blob);
  }
  return Math.round(total);
}

/** Duración (ms) de un Blob de audio vía metadatos; estimación por tamaño si falla. */
function blobDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return resolve(estimateBytesMs(blob));
    }
    let url: string | null = null;
    const done = (ms: number) => {
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* */
        }
      }
      resolve(ms);
    };
    try {
      url = URL.createObjectURL(blob);
      const a = new Audio();
      a.preload = "metadata";
      const killer = setTimeout(() => done(estimateBytesMs(blob)), 4000);
      a.onloadedmetadata = () => {
        clearTimeout(killer);
        const d = a.duration;
        done(Number.isFinite(d) && d > 0 ? d * 1000 : estimateBytesMs(blob));
      };
      a.onerror = () => {
        clearTimeout(killer);
        done(estimateBytesMs(blob));
      };
      a.src = url;
    } catch {
      done(estimateBytesMs(blob));
    }
  });
}

/** Estimación tosca de duración por tamaño (WAV PCM 44.1 kHz 16-bit mono ≈ 88 kB/s). */
function estimateBytesMs(blob: Blob): number {
  const bytesPerSecond = 88_200;
  return blob.size > 44 ? ((blob.size - 44) / bytesPerSecond) * 1000 : 0;
}
