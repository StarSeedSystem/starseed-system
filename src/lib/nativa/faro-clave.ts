/*
 * faro-clave — la clave de faro de una cuenta (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §3.1 (y native/src-tauri/src/faro.rs).
 *
 * 32 bytes aleatorios por CUENTA (no por aparato): con ella las neuronas de la misma cuenta se
 * reconocen en la red local por HMAC sin decir quiénes son a nadie más. Se guarda en los ajustes
 * PRIVADOS de la cuenta (RLS por dueño) y cada neurona la recibe al iniciar sesión. Nunca viaja en
 * un faro, nunca va a un log. Puro: el almacén y el azar se inyectan.
 */

export const CLAVE_AJUSTE_FARO = "faro_clave_v1";

export interface AlmacenClave {
  leer(): Promise<string | null>;
  /** Escribe solo si no había otra (otra neurona pudo crearla a la vez). Devuelve la que queda. */
  escribirSiFalta(clave: string): Promise<string>;
}

export function esClaveFaro(x: unknown): x is string {
  return typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
}

export function hexDe(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function claveNueva(aleatorio: (n: Uint8Array) => Uint8Array = (n) => crypto.getRandomValues(n)): string {
  const b = aleatorio(new Uint8Array(32));
  if (b.length !== 32 || b.every((x) => x === 0)) throw new Error("Sin azar del sistema: no se crea una clave de faro.");
  return hexDe(b);
}

/**
 * La clave de la cuenta: la que ya hay, o una nueva. Si dos neuronas la crean a la vez, gana la
 * que se escribió primero (`escribirSiFalta`) y las dos acaban con la misma.
 */
export async function obtenerOCrearClaveFaro(
  almacen: AlmacenClave,
  aleatorio?: (n: Uint8Array) => Uint8Array,
): Promise<{ ok: true; clave: string; nueva: boolean } | { ok: false; motivo: string }> {
  try {
    const actual = (await almacen.leer())?.toLowerCase() ?? null;
    if (esClaveFaro(actual)) return { ok: true, clave: actual, nueva: false };
    const propuesta = claveNueva(aleatorio);
    const queda = (await almacen.escribirSiFalta(propuesta)).toLowerCase();
    if (!esClaveFaro(queda)) return { ok: false, motivo: "El ajuste de la cuenta guardó una clave de faro no válida." };
    return { ok: true, clave: queda, nueva: queda === propuesta };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo leer la clave de faro de la cuenta." };
  }
}
