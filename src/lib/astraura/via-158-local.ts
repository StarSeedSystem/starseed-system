/**
 * via-158-local.ts — Por dónde habla el navegador con la Astraura 1.58 de ESTA
 * máquina (OPD1010 · 2026-10-10). Módulo PURO (sin Node, sin `window` salvo lo
 * que se le pase), lo importan componentes de cliente.
 *
 * Medido el 2026-10-10 en la Mac (localhost:9002):
 *   · `fetch("http://127.0.0.1:8000/api/starseed/health")` desde la página →
 *     «Failed to fetch» en 2–11 ms (`net::ERR_BLOCKED_BY_CLIENT`): el navegador
 *     integrado bloquea otros puertos de localhost, y lo mismo hacen el
 *     contenido mixto de una app empaquetada y el bloqueo de red privada.
 *   · `/api/ai/astraura-158/api/starseed/health` (el puente del propio OS,
 *     mismo origen) → 200.
 * El Studio 1.58 (`astraura-158-client.ts`) hablaba SIEMPRE directo con
 * `127.0.0.1:8000`, así que enseñaba «Sin conexión con el backend: Failed to
 * fetch» con el backend vivo. El chat ya usaba el puente (`baseParaNavegador`).
 *
 * Regla: si la PÁGINA es un despliegue local y la base es de bucle local, se
 * intenta directo (así siguen funcionando las rutas que el puente no deja
 * pasar) y, ante un fallo de RED —no ante un timeout ni un HTTP de error—, se
 * repite por el puente con `?destino=local`. Si el directo ya falló por red, se
 * va primero por el puente durante 5 minutos (no se paga un fallo por llamada).
 */

import { destinoEsLocal } from "./destino-local";

/** Prefijo del puente same-origin del OS hacia el backend 1.58. */
export const PUENTE_158 = "/api/ai/astraura-158";

/** Cuánto se recuerda que el camino directo está bloqueado en este navegador. */
export const DIRECTO_BLOQUEADO_MS = 5 * 60_000;

/**
 * ¿Esta llamada puede ir por el puente del OS? Solo la fuente LOCAL, con una
 * base de bucle local y una página servida por la propia máquina (en un origen
 * público el proxy no es local y serviría la nube con la etiqueta «local»).
 */
export function puedeIrPorPuente(target: string, endpoint: string, paginaLocal: boolean): boolean {
  return target === "local" && paginaLocal && destinoEsLocal(String(endpoint ?? ""));
}

/**
 * Ruta del puente para un `path` del backend (que puede traer su `?query`):
 * `/api/memory/search?q=x` → `/api/ai/astraura-158/api/memory/search?q=x&destino=local`.
 * `destino` se sobrescribe siempre (idempotente).
 */
export function rutaPorPuente(path: string): string {
  const crudo = String(path ?? "");
  const i = crudo.indexOf("?");
  const ruta = i === -1 ? crudo : crudo.slice(0, i);
  const busqueda = i === -1 ? "" : crudo.slice(i + 1);
  const camino = ruta.startsWith("/") ? ruta : `/${ruta}`;
  const params = new URLSearchParams(busqueda);
  params.set("destino", "local");
  return `${PUENTE_158}${camino}?${params.toString()}`;
}

/**
 * ¿El error es un fallo de RED del `fetch` (bloqueo, conexión rechazada,
 * contenido mixto, CORS) y no un timeout/cancelación? Solo esos justifican
 * reintentar por otro camino al instante.
 */
export function esFalloDeRed(e: unknown): boolean {
  const nombre = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (nombre === "AbortError" || nombre === "TimeoutError" || /abort/i.test(msg)) return false;
  if (nombre === "TypeError") return true;
  return /failed to fetch|networkerror|load failed|network request failed|err_blocked/i.test(msg);
}

let bloqueadoHasta = 0;

/** Anota que el camino directo falló por red (se va por el puente un rato). */
export function marcarDirectoBloqueado(ahora: number = Date.now()): void {
  bloqueadoHasta = ahora + DIRECTO_BLOQUEADO_MS;
}

/** ¿Se recuerda el directo como bloqueado ahora mismo? */
export function directoBloqueado(ahora: number = Date.now()): boolean {
  return ahora < bloqueadoHasta;
}

/** Solo para pruebas. */
export function _reiniciarVia158(): void {
  bloqueadoHasta = 0;
}

/**
 * Orden de intentos para una llamada: URLs completas a probar una tras otra.
 * Sin puente posible → solo el directo. Con puente → directo y luego puente,
 * o solo el puente mientras el directo se recuerda bloqueado.
 */
export function intentosLlamada(
  target: string,
  endpoint: string,
  path: string,
  paginaLocal: boolean,
  ahora: number = Date.now(),
): { url: string; via: "directo" | "puente" }[] {
  const directo = { url: `${endpoint}${path}`, via: "directo" as const };
  if (!puedeIrPorPuente(target, endpoint, paginaLocal)) return [directo];
  const puente = { url: rutaPorPuente(path), via: "puente" as const };
  return directoBloqueado(ahora) ? [puente, directo] : [directo, puente];
}
