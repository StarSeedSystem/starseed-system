/**
 * CORS de `/api/mando/*` para MetaGenesis desde otras neuronas (2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 * La consola de /metagenesis servida por Vercel lee el motor de la Mac por el túnel: es OTRO
 * origen, así que el navegador pregunta antes (OPTIONS) y solo lee la respuesta si el motor
 * dice que ese origen puede. Reglas:
 *   · Solo los orígenes del OS: `https://starseed-os.vercel.app` y `http://localhost:9002`
 *     (más los de `METAGENESIS_ORIGENES_EXTRA`, separados por comas, si algún día hay dominio
 *     propio). Nunca `*`.
 *   · Se permite la cabecera `Authorization` (el token de la sesión) y `Content-Type`.
 *   · SIN credenciales entre orígenes: no hay `Access-Control-Allow-Credentials`, así que las
 *     cookies no viajan; la sesión va solo en el token, que el guardián verifica.
 *   · A una petición del mismo origen (la propia Mac) no se le toca nada.
 * Puro sobre `Request`/`Response` (sin Node): lo usa `middleware.ts` (runtime edge).
 * Pruebas: `__tests__/cors-mando.test.ts`. SOP: architecture/metagenesis-remoto-tunel.md
 */

export const ORIGENES_OS = ["https://starseed-os.vercel.app", "http://localhost:9002"] as const;

const METODOS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CABECERAS = "Authorization, Content-Type";

function esRuta(pathname: string): boolean {
    return /^\/api\/mando(\/|$)/.test(pathname);
}

/** Orígenes admitidos: los del OS y los extra válidos (https, o http solo para localhost). */
export function origenesPermitidos(extra: string | undefined = process.env.METAGENESIS_ORIGENES_EXTRA): string[] {
    const lista: string[] = [...ORIGENES_OS];
    for (const crudo of (extra ?? "").split(",")) {
        const o = crudo.trim().replace(/\/+$/, "");
        if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(o) || /^http:\/\/localhost:\d{2,5}$/i.test(o)) {
            if (!lista.includes(o.toLowerCase())) lista.push(o.toLowerCase());
        }
    }
    return lista;
}

/** El origen de la petición si es de OTRO origen y está admitido; si no, null. */
function origenCruzadoAdmitido(req: Request, lista: string[]): string | null {
    const origen = req.headers.get("origin");
    if (!origen) return null;
    let propio = "";
    try {
        propio = new URL(req.url).origin;
    } catch {
        return null;
    }
    if (origen === propio) return null;
    return lista.includes(origen.toLowerCase()) ? origen : null;
}

function rutaDe(req: Request): string {
    try {
        return new URL(req.url).pathname;
    } catch {
        return "";
    }
}

/** Cabeceras CORS para un origen admitido (sin credenciales). */
export function cabecerasCors(origen: string): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": origen,
        "Access-Control-Allow-Methods": METODOS,
        "Access-Control-Allow-Headers": CABECERAS,
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
    };
}

/**
 * Respuesta a la pregunta previa (OPTIONS con `Access-Control-Request-Method`) de `/api/mando/*`:
 * 204 con las cabeceras si el origen está admitido; 403 sin ellas si no. Null si no es una
 * pregunta previa del mando (sigue el camino normal).
 */
export function preflightCorsMando(req: Request, lista: string[] = origenesPermitidos()): Response | null {
    if (req.method !== "OPTIONS" || !esRuta(rutaDe(req))) return null;
    if (!req.headers.get("access-control-request-method") || !req.headers.get("origin")) return null;
    const origen = origenCruzadoAdmitido(req, lista);
    if (!origen) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response(null, { status: 204, headers: cabecerasCors(origen) });
}

/** Añade las cabeceras CORS a la respuesta de `/api/mando/*` si el origen cruzado está admitido. */
export function aplicarCorsMando<R extends Response>(req: Request, res: R, lista: string[] = origenesPermitidos()): R {
    if (!esRuta(rutaDe(req))) return res;
    const origen = origenCruzadoAdmitido(req, lista);
    if (!origen) return res;
    for (const [k, v] of Object.entries(cabecerasCors(origen))) {
        if (k === "Vary") res.headers.append("Vary", v);
        else res.headers.set(k, v);
    }
    return res;
}
