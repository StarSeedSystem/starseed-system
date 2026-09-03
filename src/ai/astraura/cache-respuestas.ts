/**
 * (Ola 223) Caché LRU en memoria de respuestas repetidas del router de Astraura.
 * Evita gastar cuota en llamadas idénticas (mismo mensajes+modelo+temperature).
 * Solo lectura/escritura en memoria: SSR-safe y defensiva (nunca lanza).
 * Clave = djb2(JSON.stringify({messages, model, temperature})) en hex.
 * TTL 10 min, máx. 60 entradas (las más antiguas/usadas menos se expulsan).
 */

export const CACHE_MAX_ENTRADAS = 60;
export const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  texto: string;
  expira: number;
}

const memoria = new Map<string, CacheEntry>();

/** djb2 sobre el string, devuelto en hex (estable entre llamadas). */
function djb2Hex(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Clave estable de la caché para una petición concreta. */
export function claveCache(
  messages: unknown,
  model: string,
  temperature?: number,
): string {
  try {
    return djb2Hex(JSON.stringify({ messages, model, temperature }));
  } catch {
    return "";
  }
}

/** Lee una respuesta cacheada (null si no existe o expiró; NUNCA errores ni vacías). */
export function leerCache(clave: string): string | null {
  if (!clave) return null;
  try {
    const e = memoria.get(clave);
    if (!e) return null;
    if (Date.now() > e.expira) {
      memoria.delete(clave);
      return null;
    }
    // LRU: refresca posición en el Map.
    memoria.delete(clave);
    memoria.set(clave, e);
    return e.texto;
  } catch {
    return null;
  }
}

/** Guarda una respuesta válida. No cachea cadenas vacías. */
export function guardarCache(clave: string, respuesta: string): void {
  if (!clave || !respuesta || !respuesta.trim()) return;
  try {
    memoria.set(clave, { texto: respuesta, expira: Date.now() + CACHE_TTL_MS });
    while (memoria.size > CACHE_MAX_ENTRADAS) {
      const masAntigua = memoria.keys().next().value;
      if (masAntigua === undefined) break;
      memoria.delete(masAntigua);
    }
  } catch { /* defensivo */ }
}
