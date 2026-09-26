/**
 * Recarga por versión nueva (2026-09-26).
 *
 * Cuando se publica o se reconstruye el OS, los trozos de JavaScript cambian de nombre. Una
 * pestaña que ya estaba abierta sigue con el mapa viejo: al navegar pide un trozo que ya no
 * existe (404) y la página cae en «Algo no salió como esperábamos». Medido en el Mando de
 * localhost justo después de reconstruirlo: `/agent` mostraba el panel de error hasta
 * recargar a mano. Aquí se reconoce ese error y se recarga sola, UNA vez por minuto como
 * mucho, para que un trozo que falla por otra causa no entre en bucle.
 */

const PATRON =
    /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** PURA: ¿este error es de un trozo de una versión que ya no se sirve? */
export function esErrorDeVersionNueva(e: unknown): boolean {
    if (e == null) return false;
    const texto = e instanceof Error ? `${e.name} ${e.message}` : typeof e === "string" ? e : "";
    return PATRON.test(texto);
}

export const CLAVE_RECARGA = "starseed.recarga-version.v1";
export const MARGEN_RECARGA_MS = 60_000;

/** Recarga la página si no se recargó por esto en el último minuto. Devuelve si recargó. */
export function recargarPorVersionNueva(
    ahora: number = Date.now(),
    almacen: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined" ? window.sessionStorage : null,
    recargar: () => void = () => window.location.reload(),
): boolean {
    if (!almacen) return false;
    try {
        const previa = Number(almacen.getItem(CLAVE_RECARGA) || 0);
        if (Number.isFinite(previa) && ahora - previa < MARGEN_RECARGA_MS) return false;
        almacen.setItem(CLAVE_RECARGA, String(ahora));
    } catch {
        return false;
    }
    recargar();
    return true;
}
