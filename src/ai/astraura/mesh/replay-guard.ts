"use client";

/**
 * StarSeed OS — GUARDA ANTI-REPLAY del feed firmado (Adenda 119).
 * ============================================================================
 * Un sobre público firmado v:2 (mesh-identity.wrapSigned) lleva `ts` (instante) y
 * `nonce` (uso único). Sin esta guarda, un atacante podía COPIAR un payload
 * firmado por X y volver a publicarlo con un id/oid nuevo: pasaba la verificación
 * de firma y aparecía como un post "verificado" y fresco de X (suplantación por
 * reinyección). La guarda rechaza:
 *   · `ts` fuera de una ventana temporal (contenido caducado o del futuro), y
 *   · un `nonce` (por firmante) ya visto en esta sesión (reinyección).
 *
 * Es RECEPTOR-side y en memoria (se reinicia al recargar): degrada `verified` a
 * false para el contenido sospechoso, nunca lo borra (no rompe contenido legítimo;
 * el duplicado exacto ya se deduplica por id aguas abajo). SSR-safe; nunca lanza.
 */

/** Ventana tolerante a desfase de reloj de pared entre neuronas (±15 min). */
const WINDOW_MS = 15 * 60_000;
/** Tope del anillo de nonces vistos (LRU aproximado por orden de inserción). */
const MAX_NONCES = 4000;

const seen = new Set<string>();

/**
 * ¿Aceptar la frescura de un sobre firmado? true = fresco (y registra el nonce);
 * false = fuera de ventana o nonce repetido (posible replay). Sin ts/nonce
 * (sobres v:0/v:1) devuelve true: la guarda no aplica y el comportamiento no cambia.
 */
export function acceptFreshness(
  fp: string | undefined,
  ts: number | undefined,
  nonce: string | undefined,
  now: number = Date.now(),
): boolean {
  if (typeof ts !== "number" || !nonce) return true; // v0/v1: no aplicable
  if (Math.abs(now - ts) > WINDOW_MS) return false; // caducado o del futuro
  const key = `${fp ?? ""}|${nonce}`;
  if (seen.has(key)) return false; // ya visto → replay
  seen.add(key);
  if (seen.size > MAX_NONCES) {
    const first = seen.values().next().value;
    if (first) seen.delete(first);
  }
  return true;
}

/** Reinicia la guarda (solo para pruebas). */
export function _resetReplayGuard(): void {
  seen.clear();
}
