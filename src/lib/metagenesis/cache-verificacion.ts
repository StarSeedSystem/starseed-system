/**
 * Memoria corta de tokens ya verificados por el guardián de `/api/mando/*` (2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ: con MetaGenesis usado desde otra neurona, CADA lectura de la consola llega al motor
 * con `Authorization: Bearer` y el guardián hacía dos llamadas a Supabase (verificar el token y
 * `es_metagenesis()`). Con ~30 paneles sondeando eso son decenas de miles de peticiones al día,
 * y el presupuesto diario del proyecto es de 25.000 (vigia_consumo.py). Aquí se recuerda el
 * resultado como mucho 60 s y nunca más allá de la caducidad del propio token.
 *
 * SEGURIDAD: la clave es la HUELLA sha256 del token (nunca el token), en memoria del proceso,
 * acotada a 64 entradas; solo se recuerdan respuestas claras (miembro sí/no), nunca un fallo
 * del medio (red, 5xx, límite de peticiones).
 *
 * (2026-10-20 · COL1012Md) Genesis publicado en el A1 recibe tráfico de internet: un token con forma
 * rara, caducado o rechazado por Supabase no puede costar una llamada de verificación en CADA
 * petición (el presupuesto diario es de 25.000). `defectoDelToken` los descarta sin llamar a nadie, y
 * la misma memoria, creada con una vida de 10 s, recuerda el rechazo claro de Supabase.
 * LÍMITE: un JWT falso bien formado, con `exp` futuro y distinto cada vez, no lo atrapa nada de aquí; lo
 * frena el guardián por IP (`FALLOS_POR_IP`), y repartido entre muchas IPs solo lo cerraría verificar la
 * firma en local.
 * La sesión por cookie se recuerda igual que un Bearer (`huellaSesionPorCookie`, 60 s): es el camino de un miembro
 * en el navegador y, sin memoria, cada lectura de la consola costaría dos peticiones y el freno por IP lo dejaría fuera.
 * Puro salvo `huellaToken` (Web Crypto, sin `node:*`). Pruebas: `__tests__/cache-verificacion.test.ts`.
 */

export interface Verificacion {
    usuario: string;
    miembro: boolean;
}

/** Los tres tramos de un JWT son base64url sin relleno, ninguno vacío. */
const FORMA_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Decodifica el tramo central (el contenido) de un JWT sin verificar la firma; null si no es un objeto JSON. */
function contenidoDelToken(token: string): Record<string, unknown> | null {
    if (!FORMA_JWT.test(token)) return null;
    try {
        const b64 = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
        const relleno = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const texto = typeof atob === "function" ? atob(relleno) : "";
        const valor: unknown = JSON.parse(texto);
        return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** Caducidad (`exp`, en segundos) de un JWT sin verificarlo; null si no se puede leer. */
export function expDelToken(token: string): number | null {
    const exp = contenidoDelToken(token)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
}

/**
 * Lo que se ve de un token SIN llamar a nadie. `"malformado"`: no tiene forma de JWT o su contenido no es
 * un objeto JSON, así que Supabase no lo aceptaría nunca. `"caducado"`: su `exp` ya pasó. `null`: nada que
 * objetar a simple vista (la firma y la cuenta las decide Supabase). Un token sin `exp` legible no se
 * considera caducado: lo decide Supabase, una vez, y su respuesta se recuerda.
 */
export function defectoDelToken(token: string, ahoraMs: number = Date.now()): "malformado" | "caducado" | null {
    const contenido = contenidoDelToken(token);
    if (!contenido) return "malformado";
    const exp = contenido.exp;
    if (typeof exp === "number" && Number.isFinite(exp) && exp * 1000 <= ahoraMs) return "caducado";
    return null;
}

/** Huella sha256 (hex) del token: lo único que se usa como clave. */
export async function huellaToken(token: string): Promise<string> {
    const datos = new TextEncoder().encode(token);
    const resumen = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nombre de una cookie de sesión de Supabase (`sb-<proyecto>-auth-token`) o de uno de sus trozos (`….0`, `….1`…). */
const COOKIE_DE_SESION = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Huella de la sesión que llega por COOKIE (el navegador en `genesis.<host>`, el camino principal en el A1):
 * sha256 de las cookies de sesión de Supabase y de sus trozos, ordenadas por nombre, con el prefijo `cookie:`
 * para que nunca choque con la huella de un Bearer. Cualquier otra cookie (analítica, preferencias) se ignora:
 * que cambie no tira la memoria. null si la cabecera no trae ninguna cookie de sesión. Como en los tokens, lo
 * único que se guarda es la huella, nunca el valor. (Revisión de COL1012Md-d1: sin esto, un miembro con cookie
 * costaba dos peticiones a Supabase por lectura y, con su IP frenada, recibía 429 aunque fuese quien dice ser.)
 */
export async function huellaSesionPorCookie(cabeceraCookie: string | null): Promise<string | null> {
    if (!cabeceraCookie) return null;
    const trozos: string[] = [];
    for (const par of cabeceraCookie.split(";")) {
        const i = par.indexOf("=");
        if (i <= 0) continue;
        const nombre = par.slice(0, i).trim();
        if (COOKIE_DE_SESION.test(nombre)) trozos.push(`${nombre}=${par.slice(i + 1).trim()}`);
    }
    if (trozos.length === 0) return null;
    trozos.sort();
    return `cookie:${await huellaToken(trozos.join("\n"))}`;
}

/**
 * Memoria corta por huella. `V` es lo que se recuerda: por defecto una verificación (miembro sí/no, 60 s);
 * el guardián crea otra, con 10 s, para los rechazos claros de Supabase.
 */
export function crearCacheVerificaciones<V = Verificacion>(opciones: { ttlMs?: number; max?: number; ahora?: () => number } = {}) {
    const ttlMs = opciones.ttlMs ?? 60_000;
    const max = Math.max(1, opciones.max ?? 64);
    const ahora = opciones.ahora ?? (() => Date.now());
    const mapa = new Map<string, { hasta: number; v: V }>();

    return {
        leer(huella: string): V | null {
            const e = mapa.get(huella);
            if (!e) return null;
            if (ahora() >= e.hasta) {
                mapa.delete(huella);
                return null;
            }
            return e.v;
        },
        /** Recuerda el resultado hasta `ttlMs` o hasta que caduque el token (lo que llegue antes). */
        guardar(huella: string, v: V, expSegundos: number | null): void {
            const t = ahora();
            const hasta = Math.min(t + ttlMs, expSegundos ? expSegundos * 1000 : t + ttlMs);
            if (hasta <= t) return;
            mapa.delete(huella);
            mapa.set(huella, { hasta, v });
            while (mapa.size > max) {
                const primera = mapa.keys().next().value;
                if (primera === undefined) break;
                mapa.delete(primera);
            }
        },
        tamano(): number {
            return mapa.size;
        },
    };
}
