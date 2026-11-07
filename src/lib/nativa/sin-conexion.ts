/*
 * Sin conexión: trabajando en local (APP1107A, 2026-11-07) — lógica pura, sin DOM ni Node.
 * Contrato: architecture/apps-autonomas-sin-internet.md.
 *
 * La app de escritorio de StarSeed OS sirve el OS desde su propio servidor en 127.0.0.1 (uno de
 * diez puertos fijos). Ese servidor sabe si hay internet (`GET /__starseed/red`) mejor que
 * `navigator.onLine`, que dice «en línea» con cualquier Wi-Fi aunque no salga a ningún sitio.
 * Aquí se decide cuándo enseñar el aviso y qué dice; el componente es
 * src/components/nativa/aviso-sin-conexion.tsx. Lo usa también el middleware (runtime edge): nada
 * de `node:*` en este archivo.
 */

/** Los diez puertos del servidor local: los mismos que `PUERTOS` de
 *  native/src-tauri/src/servidor_local_logica.rs y que las capabilities (lo vigila una prueba). */
export const PUERTOS_SERVIDOR_LOCAL = [47610, 47611, 47612, 47613, 47614, 47615, 47616, 47617, 47618, 47619] as const;

/** Ruta del envoltorio del servidor local que dice cómo está la red. */
export const RUTA_RED = "/__starseed/red";

export type RedServidorLocal = "en-linea" | "sin-conexion" | "desconocida";

/** ¿Esta página la sirve el servidor local de la app (http://127.0.0.1:<puerto fijo>)? */
export function esServidorLocal(loc: { protocol: string; hostname: string; port: string }): boolean {
  if (loc.protocol !== "http:" || loc.hostname !== "127.0.0.1") return false;
  const p = Number(loc.port);
  return (PUERTOS_SERVIDOR_LOCAL as readonly number[]).includes(p);
}

/** Lee la respuesta de `/__starseed/red`; cualquier otra cosa → null (no se sabe). */
export function interpretarRed(json: unknown): RedServidorLocal | null {
  const red = json && typeof json === "object" ? (json as { red?: unknown }).red : undefined;
  return red === "en-linea" || red === "sin-conexion" || red === "desconocida" ? red : null;
}

/** ¿Un error de Supabase Auth es de RED (sin internet) y no de sesión? */
export function esFalloDeRed(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || error.status === 0;
}

export interface EntradaAviso {
  /** `navigator.onLine` (false = seguro que no hay red; true = no se sabe del todo). */
  navegadorEnLinea: boolean;
  /** La página la sirve el servidor local de la app. */
  enServidorLocal: boolean;
  /** Lo que dice el servidor local (null si no se ha podido preguntar). */
  redServidor: RedServidorLocal | null;
  /** La persona lo cerró (vuelve a salir si la red cambia). */
  descartado: boolean;
}

export interface Aviso {
  mostrar: boolean;
  titulo: string;
  detalle: string;
}

export const TITULO_SIN_CONEXION = "Sin conexión: trabajando en local";

export function decidirAviso(e: EntradaAviso): Aviso {
  const sinRed = !e.navegadorEnLinea || e.redServidor === "sin-conexion";
  const detalle = e.enServidorLocal
    ? "La app sigue funcionando con su propio servidor y los datos de esta neurona. Lo que vive en la nube (iniciar sesión, sincronizar, IA externa, Biblioteca remota) vuelve solo al reconectar; la malla local sigue."
    : "Lo ya abierto y lo guardado en esta neurona sigue funcionando. Lo que vive en la nube vuelve solo al reconectar.";
  return { mostrar: sinRed && !e.descartado, titulo: TITULO_SIN_CONEXION, detalle };
}
