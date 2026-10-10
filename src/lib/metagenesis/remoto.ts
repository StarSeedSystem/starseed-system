/**
 * MetaGenesis remoto — usar el motor de la Mac desde otra neurona (2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: la consola de /metagenesis abierta fuera de la Mac (Vercel, un móvil, otro ordenador)
 * manda sus lecturas y acciones `/api/mando/*` al MOTOR de la Mac, por el túnel cifrado que la
 * Mac publica en `metagenesis_motor`, con el token de la sesión en `Authorization: Bearer`.
 *
 * Este módulo es PURO (sin Supabase, sin `window`, sin Node): reescribe URLs, pone la cabecera,
 * valida la URL del motor y resume el estado de la fila. Lo usa `guardia-fetch.ts` (modo remoto)
 * y la envoltura `metagenesis-remoto.tsx`. Pruebas: `__tests__/remoto.test.ts`.
 *
 * SEGURIDAD:
 *   · El token solo se manda a una URL de motor VÁLIDA: https, sin ruta, sin usuario ni puerto,
 *     y de `*.trycloudflare.com` (o de los hosts de `NEXT_PUBLIC_METAGENESIS_MOTOR_HOSTS`), o al
 *     propio origen de la página cuando la sirve la Mac.
 *   · Entre orígenes, nunca cookies (`credentials: "omit"`): la sesión viaja solo en el token.
 *   · Solo se reescribe `/api/mando/*` del MISMO origen de la página; lo demás pasa intacto.
 * SOP: architecture/metagenesis-remoto-tunel.md
 */

/** Hosts de bucle local: la página está abierta en la propia Mac. */
const BUCLE = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Un latido más viejo que esto ya no dice que la Mac esté viva (la Mac late cada 60 s). */
export const LATIDO_VIEJO_MS = 3 * 60_000;

/** ¿La página está abierta en la propia máquina del motor (bucle local)? */
export function abiertoEnLaMac(hostname: string): boolean {
    return BUCLE.has((hostname || "").trim().toLowerCase());
}

/** ¿Es una ruta del motor (`/api/mando` o `/api/mando/…`)? */
export function esRutaDelMando(pathname: string): boolean {
    return /^\/api\/mando(\/|$)/.test(pathname);
}

/** Hosts extra admitidos como motor (variable pública, separados por comas). */
export function hostsExtraDeEntorno(valor: string | undefined): string[] {
    return (valor ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h));
}

/**
 * La URL del motor normalizada (`https://host`) si se le puede mandar un token, o null.
 * Admite: el propio origen de la página (la sirve la Mac) o https de `*.trycloudflare.com`
 * (un solo nivel) o de `hostsExtra`; sin ruta, sin consulta, sin usuario y sin puerto.
 */
export function motorUrlValida(url: unknown, opciones: { hostsExtra?: string[]; origenPagina?: string } = {}): string | null {
    if (typeof url !== "string" || !url.trim()) return null;
    let u: URL;
    try {
        u = new URL(url.trim());
    } catch {
        return null;
    }
    if (opciones.origenPagina && u.origin === opciones.origenPagina && (u.pathname === "/" || u.pathname === "")) {
        return u.origin;
    }
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
    const host = u.hostname.toLowerCase();
    const deCloudflare = /^[a-z0-9-]+\.trycloudflare\.com$/.test(host);
    const extra = (opciones.hostsExtra ?? []).includes(host);
    return deCloudflare || extra ? `https://${host}` : null;
}

/**
 * Reescribe una URL de `/api/mando/*` del origen de la página hacia el motor.
 * Devuelve null si no es del mando o es de otro origen (pasa intacta).
 */
export function reescribirUrlMando(url: string, base: string, origenPagina: string): string | null {
    let u: URL;
    try {
        u = new URL(url, `${origenPagina}/`);
    } catch {
        return null;
    }
    if (u.origin !== origenPagina || !esRutaDelMando(u.pathname)) return null;
    return `${base.replace(/\/+$/, "")}${u.pathname}${u.search}`;
}

/** Las cabeceras de la petición con el token de la sesión (sustituye cualquier Authorization). */
export function cabecerasConToken(cabeceras: HeadersInit | undefined, token: string | null): Headers {
    const h = new Headers(cabeceras);
    if (token) h.set("Authorization", `Bearer ${token}`);
    return h;
}

/** Modo remoto de Genesis: adónde van las rutas del mando y de dónde sale el token. */
export interface ModoRemoto {
    /** Origen del motor (`https://….trycloudflare.com`) o el propio origen de la página. */
    base: string;
    /** Token de acceso de la sesión de Supabase; `forzar` lo renueva. null = sin sesión. */
    token: (forzar?: boolean) => Promise<string | null>;
}

type CuerpoRepetible = BodyInit | null | undefined;

/** ¿Se puede volver a mandar este cuerpo tal cual (para el reintento tras un 401)? */
function repetible(cuerpo: CuerpoRepetible): boolean {
    if (cuerpo == null) return true;
    if (typeof cuerpo === "string") return true;
    if (typeof URLSearchParams !== "undefined" && cuerpo instanceof URLSearchParams) return true;
    if (typeof Blob !== "undefined" && cuerpo instanceof Blob) return true;
    if (typeof FormData !== "undefined" && cuerpo instanceof FormData) return true;
    if (cuerpo instanceof ArrayBuffer || ArrayBuffer.isView(cuerpo)) return true;
    return false;
}

/**
 * Envuelve `fetch`: con el modo remoto puesto, toda petición a `/api/mando/*` del origen de la
 * página va al motor con `Authorization: Bearer <token>` (y sin cookies si es otro origen). Si el
 * motor contesta 401, renueva el token y reintenta UNA vez (solo si el cuerpo se puede repetir).
 * Sin modo remoto, o para cualquier otra URL, es el `fetch` de siempre.
 */
export function crearFetchRemoto(
    original: typeof fetch,
    leerModo: () => ModoRemoto | null,
    origenPagina: () => string,
): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const modo = leerModo();
        if (!modo) return original(input, init);
        const origen = origenPagina();
        const esPeticion = typeof Request !== "undefined" && input instanceof Request;
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const destino = reescribirUrlMando(url, modo.base, origen);
        if (!destino) return original(input, init);

        // Un `Request` se desarma en un init (solo si no es GET/HEAD hace falta leer su cuerpo).
        let base: RequestInit = { ...(init ?? {}) };
        if (esPeticion) {
            const r = input as Request;
            const metodo = (init?.method ?? r.method ?? "GET").toUpperCase();
            const cuerpo = init?.body ?? (metodo === "GET" || metodo === "HEAD" ? null : await r.clone().arrayBuffer());
            base = {
                method: metodo,
                headers: init?.headers ?? r.headers,
                body: cuerpo,
                signal: init?.signal ?? r.signal,
                cache: init?.cache ?? r.cache,
            };
        }
        const otroOrigen = new URL(destino).origin !== origen;
        const enviar = (token: string | null) =>
            original(destino, {
                ...base,
                headers: cabecerasConToken(base.headers, token),
                ...(otroOrigen ? { credentials: "omit" as RequestCredentials, mode: "cors" as RequestMode } : {}),
            });

        const token = await modo.token(false);
        const r = await enviar(token);
        if (r.status !== 401 || !token || !repetible(base.body)) return r;
        const nuevo = await modo.token(true);
        if (!nuevo || nuevo === token) return r;
        return enviar(nuevo);
    }) as typeof fetch;
}

/** La fila de `metagenesis_motor` tal como la lee un miembro. */
export interface FilaMotor {
    url: string | null;
    encendido: boolean;
    ultimo_latido: string | null;
    arrancado_en: string | null;
    maquina: string | null;
    motivo: string | null;
}

/** Lo que devuelve la lectura de la fila (`motor.ts`). */
export type LecturaMotor =
    | { ok: true; fila: FilaMotor | null }
    | { ok: false; motivo: string; sinTabla?: boolean };

export interface LecturaFila {
    /** Hay URL, la Mac dice «encendido» y el latido es reciente: merece la pena sondear. */
    prometedora: boolean;
    /** Milisegundos desde el último latido; null si nunca latió. */
    latidoHaceMs: number | null;
    /** Por qué no es prometedora, en palabras (vacío si lo es). */
    motivo: string;
}

/** PURA. Qué dice la fila del motor (sin sondear: eso lo decide la sonda). */
export function leerFilaMotor(fila: FilaMotor | null, ahora: number, hostsExtra: string[] = []): LecturaFila {
    if (!fila) return { prometedora: false, latidoHaceMs: null, motivo: "La Mac aún no ha publicado su túnel." };
    const t = fila.ultimo_latido ? Date.parse(fila.ultimo_latido) : NaN;
    const latidoHaceMs = Number.isFinite(t) ? Math.max(0, ahora - t) : null;
    if (!fila.encendido || !fila.url) {
        return { prometedora: false, latidoHaceMs, motivo: fila.motivo?.trim() || "El túnel de la Mac está apagado." };
    }
    if (!motorUrlValida(fila.url, { hostsExtra })) {
        return { prometedora: false, latidoHaceMs, motivo: "La URL publicada no es de un túnel admitido." };
    }
    if (latidoHaceMs === null || latidoHaceMs > LATIDO_VIEJO_MS) {
        return { prometedora: false, latidoHaceMs, motivo: fila.motivo?.trim() || "La Mac dejó de latir." };
    }
    return { prometedora: true, latidoHaceMs, motivo: "" };
}

/** «hace 12 s», «hace 3 min», «hace 2 h», «hace 4 días»; null → «nunca». */
export function textoHace(ms: number | null): string {
    if (ms === null || !Number.isFinite(ms)) return "nunca";
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `hace ${s} s`;
    const min = Math.round(s / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
}

/** Resultado de sondear un motor con el token. */
export type SondaMotor =
    | { ok: true }
    | { ok: false; tipo: "rechazado" | "no-es-motor" | "sin-respuesta"; estado?: number };

/** PURA. Traduce el código de la sonda `GET /api/mando/latido` a un veredicto. */
export function veredictoSonda(estado: number | null): SondaMotor {
    if (estado === null) return { ok: false, tipo: "sin-respuesta" };
    if (estado >= 200 && estado < 300) return { ok: true };
    if (estado === 401 || estado === 403) return { ok: false, tipo: "rechazado", estado };
    if (estado === 404) return { ok: false, tipo: "no-es-motor", estado };
    return { ok: false, tipo: "sin-respuesta", estado };
}
