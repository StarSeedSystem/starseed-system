/**
 * `?next=` seguro para después de iniciar sesión — PURO.
 *
 * Tras entrar (contraseña, enlace por correo o callback OAuth) se vuelve a donde la persona iba
 * (p. ej. `/llamada/<id>` o `/vivo/<id>?t=…`), pero SOLO si es una ruta de este mismo OS:
 *
 *  · empieza por «/» y no por «//» ni «/\» (eso sería otra web con el esquema implícito);
 *  · sin barras invertidas, caracteres de control ni espacios al principio;
 *  · no apunta a `/api…` ni `/auth…` (ni a `/login`, que haría un bucle);
 *  · como mucho 512 caracteres;
 *  · se decodifica UNA vez (lo que llega de `URLSearchParams.get` ya viene decodificado; una
 *    segunda decodificación destapa trucos como `%2F%2Fotra.web`), y se valida y normaliza con
 *    `new URL(valor, origenFicticio)`: si el origen cambia, se rechaza. Las exclusiones se miran
 *    sobre la ruta YA normalizada (`/a/../api/x` → `/api/x` → rechazada).
 *
 * Cualquier cosa rara → `porDefecto`.
 */

export const LARGO_MAX_SIGUIENTE = 512;

const ORIGEN_FICTICIO = "https://starseed.invalid";
const PROHIBIDAS = ["/api", "/auth", "/login"];

function rutaProhibida(ruta: string): boolean {
    const r = ruta.toLowerCase();
    return PROHIBIDAS.some((p) => r === p || r.startsWith(`${p}/`));
}

/** Devuelve una ruta interna segura (path + query + hash) o `porDefecto`. */
export function siguienteSeguro(valor: unknown, porDefecto = "/"): string {
    if (typeof valor !== "string") return porDefecto;
    if (!valor || valor.length > LARGO_MAX_SIGUIENTE * 3) return porDefecto;
    let decodificado: string;
    try {
        decodificado = decodeURIComponent(valor);
    } catch {
        return porDefecto;
    }
    if (!decodificado || decodificado.length > LARGO_MAX_SIGUIENTE) return porDefecto;
    // Solo rutas absolutas del propio sitio.
    if (!decodificado.startsWith("/")) return porDefecto;
    if (decodificado.startsWith("//")) return porDefecto;
    if (decodificado.includes("\\")) return porDefecto;
    if (/[\u0000-\u001f\u007f]/.test(decodificado)) return porDefecto;
    let url: URL;
    try {
        url = new URL(decodificado, ORIGEN_FICTICIO);
    } catch {
        return porDefecto;
    }
    if (url.origin !== ORIGEN_FICTICIO) return porDefecto;
    // Tras normalizar, la ruta tampoco puede empezar por «//» (p. ej. «/.//otra.web»).
    if (url.pathname.startsWith("//")) return porDefecto;
    if (rutaProhibida(url.pathname)) return porDefecto;
    const resultado = `${url.pathname}${url.search}${url.hash}`;
    if (resultado.length > LARGO_MAX_SIGUIENTE) return porDefecto;
    return resultado;
}

/**
 * El `?next=` de una búsqueda (`location.search` o `URLSearchParams`), ya validado.
 * `porDefecto` si no hay o no es seguro.
 */
export function siguienteDeBusqueda(busqueda: string | URLSearchParams | null | undefined, porDefecto = "/"): string {
    if (!busqueda) return porDefecto;
    try {
        const params = typeof busqueda === "string" ? new URLSearchParams(busqueda) : busqueda;
        return siguienteSeguro(params.get("next"), porDefecto);
    } catch {
        return porDefecto;
    }
}

/** ¿Hay un `?next=` válido en la búsqueda? (para no tocar flujos que no lo traen). */
export function haySiguiente(busqueda: string | URLSearchParams | null | undefined): boolean {
    const centinela = "\u0000sin-siguiente";
    return siguienteDeBusqueda(busqueda, centinela) !== centinela;
}
