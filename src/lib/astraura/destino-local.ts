/**
 * destino-local.ts — Detector puro de destino de neurona local (Ola 278 · OS4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Comparte la idea de `puerta-local.ts`, pero es un módulo SIN servidor: no toca
 * `process.env` ni arranca Next, así el test de vitest puede importarlo limpio.
 * Distingue la neurona local de Astraura 1.58-bit (`127.0.0.1` / `localhost` /
 * `[::1]`) de cualquier host de la nube.
 */

/** Hosts que identifican la neurona local de Astraura 1.58-bit. */
const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Extrae el host sin puerto y en minúsculas:
 * `http://127.0.0.1:8000` → `127.0.0.1`; `http://[::1]:8000` → `[::1]`.
 * Devuelve null si la base no tiene host aprovechable.
 */
function hostDeBase(base: string): string | null {
  const limpio = base.trim().toLowerCase();
  const trasProto = limpio.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  if (!trasProto) return null;
  // IPv6 con corchetes: `[::1]` o `[::1]:8000`.
  if (trasProto.startsWith("[")) {
    const cierre = trasProto.indexOf("]");
    return cierre === -1 ? trasProto : trasProto.slice(0, cierre + 1);
  }
  return trasProto.split(":")[0] ?? null;
}

/**
 * Cierto si la base del destino apunta a la neurona local de Astraura 1.58-bit
 * (`127.0.0.1`, `localhost` o `[::1]`), con o sin puerto. Cualquier otro host
 * (la nube, una IP de la LAN) devuelve false.
 */
export function destinoEsLocal(base: string): boolean {
  const host = hostDeBase(base);
  return host !== null && HOSTS_LOCALES.has(host);
}