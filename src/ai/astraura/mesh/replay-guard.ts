"use client";

/**
 * StarSeed OS — GUARDA ANTI-REPLAY del feed firmado (Adenda 119 · persistencia+id 122).
 * ============================================================================
 * Un sobre público firmado v:2 (mesh-identity.wrapSigned) lleva `ts` (instante) y
 * `nonce` (uso único). Sin esta guarda, un atacante podía COPIAR un payload firmado
 * por X y republicarlo con un id/oid NUEVO: pasaba la firma y aparecía como un post
 * "verificado" y fresco de X (suplantación por reinyección). La guarda:
 *   · rechaza `ts` fuera de ventana (contenido caducado o del futuro), y
 *   · ata cada `nonce` (por firmante) al ID del ítem en que se vio: un `nonce`
 *     repetido con el MISMO id es una re-entrega legítima (realtime + sondeo, o una
 *     recarga que re-baja el feed) → se acepta; con un id DISTINTO es reinyección →
 *     se rechaza. Así no se degrada contenido legítimo re-entregado (Adenda 122).
 *
 * PERSISTENCIA (Adenda 122): el mapa `nonce→{ts,id}` se guarda en safe-storage y se
 * hidrata al cargar (escritura throttled), para que una reinyección no sobreviva a
 * una recarga. La PODA es por EDAD (nunca desaloja un nonce aún dentro de ventana),
 * con un tope duro que, si todo está en ventana, desaloja el de `ts` más antiguo.
 *
 * RECEPTOR-side: degrada `verified` a false para lo sospechoso, nunca borra. SSR-safe;
 * nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

/** Ventana tolerante a desfase de reloj de pared entre neuronas (±15 min). */
const WINDOW_MS = 15 * 60_000;
/** Tope del mapa de nonces vistos. */
const MAX_NONCES = 4000;
const LS_KEY = "starseed.mesh.replay-nonces.v1";
/** Mínimo entre escrituras persistentes (evita churn de localStorage). */
const PERSIST_THROTTLE_MS = 3000;

const seen = new Map<string, { ts: number; id: string }>(); // nonceKey → {ts del sobre, id de origen}
let hydrated = false;
let lastPersist = 0;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = safeGet(LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as [string, { ts: number; id: string }][];
      if (Array.isArray(arr)) {
        for (const e of arr.slice(-MAX_NONCES)) {
          if (Array.isArray(e) && typeof e[0] === "string" && e[1] && typeof e[1].ts === "number") {
            seen.set(e[0], { ts: e[1].ts, id: String(e[1].id ?? "") });
          }
        }
      }
    }
  } catch {
    /* almacenamiento ilegible: la guarda sigue en memoria */
  }
}

function persist(now: number): void {
  if (now - lastPersist < PERSIST_THROTTLE_MS) return; // throttle de escrituras
  lastPersist = now;
  try {
    safeSet(LS_KEY, JSON.stringify([...seen]));
  } catch {
    /* sin persistencia: best-effort */
  }
}

function pruneExpired(now: number): void {
  for (const [k, v] of seen) if (Math.abs(now - v.ts) > WINDOW_MS) seen.delete(k);
}

function evictOldest(): void {
  let ok: string | undefined;
  let ot = Infinity;
  for (const [k, v] of seen) if (v.ts < ot) { ot = v.ts; ok = k; }
  if (ok !== undefined) seen.delete(ok); // el de ts más antiguo (más cerca de caer de la ventana)
}

/**
 * ¿Aceptar la frescura de un sobre firmado? `id` = identificador ESTABLE del ítem
 * (id de fila / oid). true = fresco, o re-entrega del MISMO id (registra el nonce);
 * false = fuera de ventana, o mismo nonce con id DISTINTO (replay). Sin ts/nonce
 * (sobres v:0/v:1) devuelve true: la guarda no aplica.
 */
export function acceptFreshness(
  fp: string | undefined,
  ts: number | undefined,
  nonce: string | undefined,
  id: string | undefined,
  now: number = Date.now(),
): boolean {
  if (typeof ts !== "number" || !nonce) return true; // v0/v1: no aplicable
  hydrate();
  if (Math.abs(now - ts) > WINDOW_MS) return false; // caducado o del futuro
  const key = `${fp ?? ""}|${nonce}`;
  const prev = seen.get(key);
  if (prev) return !!id && prev.id === id; // mismo id = re-entrega legítima; distinto = replay
  if (seen.size >= MAX_NONCES) pruneExpired(now); // poda por edad ANTES del tope
  seen.set(key, { ts, id: id ?? "" });
  if (seen.size > MAX_NONCES) evictOldest(); // tope duro: desaloja el de ts más antiguo
  persist(now);
  return true;
}

/** Reinicia la guarda (solo para pruebas). */
export function _resetReplayGuard(): void {
  seen.clear();
  hydrated = false;
  lastPersist = 0;
  try {
    safeSet(LS_KEY, "");
  } catch {
    /* */
  }
}
