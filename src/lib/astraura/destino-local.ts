/**
 * destino-local.ts — Detector puro de destino de neurona local (Ola 278 · OS4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Comparte la idea de `puerta-local.ts`, pero es un módulo SIN servidor: no toca
 * `process.env` ni arranca Next, así el test de vitest puede importarlo limpio.
 * Distingue la neurona local de Astraura 1.58-bit (`127.0.0.1` / `localhost` /
 * `[::1]`) de cualquier host de la nube.
 *
 * (G1 · 2026-09-26) Además de la base del BACKEND, hace falta saber si la
 * PÁGINA misma (el origen que sirve el OS, `window.location`) es un despliegue
 * local (Mac en `localhost:9002`) o uno público (Vercel, `starseed-os.vercel.app`)
 * — la misma distinción que hace el servidor con `esDespliegueLocal()` en
 * `puerta-local.ts`, pero leída desde el propio navegador. Antes `baseParaNavegador`
 * enrutaba CUALQUIER base de bucle local por el proxy del OS sin mirar esto: en
 * un origen público, `?destino=local` no llega a la neurona ajena — el proxy
 * (`esDespliegueLocal` del lado servidor) nunca es local ahí y sirve la NUBE en
 * su lugar, así que «local» pasaba a significar «lo que responda la nube» sin
 * avisar a nadie. `paginaEsLocal()` es lo que permite distinguir los dos casos.
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

/** Sufijos/nombres de host que identifican un ORIGEN de página local (misma regla que `puerta-local.ts`). */
const HOSTS_PAGINA_LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Quita el puerto de un hostname (`localhost:9002` → `localhost`) y lo pasa a
 * minúsculas. Devuelve null si viene vacío. Pura: no lee `window`.
 */
function hostnameSinPuerto(hostname: string | null | undefined): string | null {
  const limpio = String(hostname ?? "").trim().toLowerCase();
  if (!limpio) return null;
  if (limpio.startsWith("[")) {
    const cierre = limpio.indexOf("]");
    return cierre === -1 ? limpio : limpio.slice(0, cierre + 1);
  }
  return limpio.split(":")[0] ?? null;
}

/**
 * ¿Un hostname de PÁGINA (no de backend) es un despliegue local? Localhost,
 * 127.0.0.1, [::1] o cualquier host terminado en `.local`, con o sin puerto.
 * Misma regla que `esDespliegueLocal()` del servidor (`puerta-local.ts`), para
 * que el navegador y el proxy estén de acuerdo en qué es "esta máquina". Pura
 * y exportada para poder probarla sin `window`.
 */
export function hostnameEsLocal(hostname: string | null | undefined): boolean {
  const host = hostnameSinPuerto(hostname);
  if (!host) return false;
  return HOSTS_PAGINA_LOCAL.has(host) || host.endsWith(".local");
}

/**
 * ¿La PÁGINA que corre ahora mismo (`window.location.hostname`) es un
 * despliegue local? En SSR o sin `window.location` disponible, devuelve
 * `false` (el caso seguro: no enrutar como si fuera esta máquina cuando no se
 * sabe). Nunca lanza.
 */
export function paginaEsLocal(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return hostnameEsLocal(window.location?.hostname);
  } catch {
    return false;
  }
}