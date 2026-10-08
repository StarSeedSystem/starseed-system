/**
 * Servidores ICE de las llamadas.
 *
 *  · STUN públicos para descubrir la ruta directa entre dos personas.
 *  · TURN (servidor de retransmisión) para cuando la ruta directa no existe (NAT simétrico,
 *    redes de empresa, datos móviles muy cerrados). Lo entrega el SERVIDOR del OS en
 *    `GET /api/llamadas/ice` con credenciales de corta duración (Cloudflare Realtime TURN o
 *    Metered), o un TURN fijo configurado por variables de entorno.
 *
 * El cliente pide `/api/llamadas/ice` una vez por llamada (se guarda en memoria hasta que
 * caducan las credenciales) y, si falla, sigue solo con STUN. Sin TURN, dos personas tras
 * redes muy cerradas pueden no conectar: la interfaz lo dice con honestidad en vez de fingir.
 *
 * Las funciones de normalización son PURAS (las usa también el servidor, `ice-servidor.ts`).
 */

export interface EntornoTurn {
    url?: string | null;
    user?: string | null;
    cred?: string | null;
}

/** De dónde salieron los servidores ICE. */
export type FuenteIce = "cloudflare" | "metered" | "estatico" | "rest" | "stun";
export const FUENTES_ICE: readonly FuenteIce[] = ["cloudflare", "metered", "estatico", "rest", "stun"];

/** Lo que devuelve `GET /api/llamadas/ice`. `ttl` en segundos. */
export interface RespuestaIce {
    iceServers: RTCIceServer[];
    fuente: FuenteIce;
    ttl: number;
}

/** Frase que ve la persona cuando no hay TURN y un par no consigue conectar. */
export const AVISO_SIN_TURN = "Sin servidor de retransmisión: en redes muy cerradas puede no conectar.";

export const RUTA_ICE = "/api/llamadas/ice";

export const STUN_POR_DEFECTO: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
];

const RE_URL_ICE = /^(stun|stuns|turn|turns):[^\s"'<>\\]{1,300}$/i;
const MAX_SERVIDORES = 8;
const MAX_URLS = 12;
const LARGO_CREDENCIAL = 512;

export function esUrlTurn(u: string): boolean {
    return /^turns?:/i.test(u);
}

function urlsDe(s: RTCIceServer): string[] {
    const u = s.urls;
    return (Array.isArray(u) ? u : [u]).filter((x): x is string => typeof x === "string");
}

/** ¿La lista incluye algún TURN con credenciales? */
export function contieneTurn(lista: readonly RTCIceServer[] | null | undefined): boolean {
    return (lista ?? []).some((s) => urlsDe(s).some(esUrlTurn) && typeof s.username === "string" && typeof s.credential === "string");
}

function texto(v: unknown, max = LARGO_CREDENCIAL): string | null {
    return typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v) ? v : null;
}

/**
 * Convierte lo que devuelva un proveedor (o la propia API) en una lista segura de
 * `RTCIceServer`: acepta un array, `{ iceServers: [...] }`, `{ iceServers: {...} }` o un objeto
 * suelto. Solo URLs `stun:`/`turn:`/`turns:`; un TURN sin usuario y credencial se descarta
 * (RTCPeerConnection lanzaría al crearse). `quitarPuerto53`: Cloudflare advierte que los
 * navegadores bloquean el puerto 53 y hace esperar a ICE.
 */
export function normalizarIceServers(raw: unknown, opciones: { quitarPuerto53?: boolean } = {}): RTCIceServer[] {
    let lista: unknown = raw;
    if (lista && typeof lista === "object" && !Array.isArray(lista) && "iceServers" in (lista as Record<string, unknown>)) {
        lista = (lista as Record<string, unknown>).iceServers;
    }
    if (lista && typeof lista === "object" && !Array.isArray(lista)) lista = [lista];
    if (!Array.isArray(lista)) return [];
    const out: RTCIceServer[] = [];
    for (const item of lista) {
        if (out.length >= MAX_SERVIDORES) break;
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const brutas = Array.isArray(o.urls) ? o.urls : typeof o.urls === "string" ? [o.urls] : typeof o.url === "string" ? [o.url] : [];
        let urls = brutas
            .filter((u): u is string => typeof u === "string")
            .map((u) => u.trim())
            .filter((u) => RE_URL_ICE.test(u));
        if (opciones.quitarPuerto53) urls = urls.filter((u) => !/:53(?:[?/]|$)/.test(u));
        const username = texto(o.username);
        const credential = texto(o.credential);
        if (!username || !credential) urls = urls.filter((u) => !esUrlTurn(u));
        urls = Array.from(new Set(urls)).slice(0, MAX_URLS);
        if (!urls.length) continue;
        const s: RTCIceServer = { urls: urls.length === 1 ? urls[0] : urls };
        if (urls.some(esUrlTurn) && username && credential) {
            s.username = username;
            s.credential = credential;
        }
        out.push(s);
    }
    return out;
}

/** STUN por defecto + la lista dada, sin repetir URLs de STUN. */
export function unirConStun(lista: readonly RTCIceServer[]): RTCIceServer[] {
    const vistas = new Set(lista.flatMap(urlsDe).map((u) => u.toLowerCase()));
    const stun = STUN_POR_DEFECTO.filter((s) => !urlsDe(s).some((u) => vistas.has(u.toLowerCase()))).map((s) => ({ ...s }));
    return [...stun, ...lista.map((s) => ({ ...s }))];
}

/** Las referencias literales a `process.env.NEXT_PUBLIC_*` las inlinea Next en el cliente. */
export function entornoTurn(): EntornoTurn {
    return {
        url: process.env.NEXT_PUBLIC_TURN_URL ?? null,
        user: process.env.NEXT_PUBLIC_TURN_USER ?? null,
        cred: process.env.NEXT_PUBLIC_TURN_CRED ?? null,
    };
}

/** STUN + TURN fijo (si el entorno trae URL, usuario y credencial). */
export function servidoresIce(env: EntornoTurn = entornoTurn()): RTCIceServer[] {
    const urls = (env.url ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
    const fijo = urls.length ? normalizarIceServers([{ urls, username: env.user ?? undefined, credential: env.cred ?? undefined }]) : [];
    return unirConStun(fijo.filter((s) => contieneTurn([s])));
}

export function hayTurn(env: EntornoTurn = entornoTurn()): boolean {
    return contieneTurn(servidoresIce(env));
}

/* ───────────────────────────── Cliente: pedirlos al servidor ───────────────────────────── */

export interface IceCliente {
    iceServers: RTCIceServer[];
    /** ¿Hay retransmisión (TURN) disponible? */
    turn: boolean;
    fuente: FuenteIce;
}

let cacheIce: { valor: IceCliente; hasta: number } | null = null;
let enVuelo: Promise<IceCliente> | null = null;

function respaldoLocal(): IceCliente {
    const lista = servidoresIce();
    const turn = contieneTurn(lista);
    return { iceServers: lista, turn, fuente: turn ? "estatico" : "stun" };
}

/**
 * Servidores ICE para una llamada: `GET /api/llamadas/ice` (una vez; se guarda en memoria hasta
 * un minuto antes de que caduquen las credenciales). Si falla o tarda más de `timeoutMs`,
 * STUN (y el TURN fijo público si lo hubiera). Nunca lanza.
 */
export async function obtenerIceServidores(
    opciones: { fetch?: typeof fetch; ahora?: () => number; timeoutMs?: number } = {},
): Promise<IceCliente> {
    const ahora = opciones.ahora ?? Date.now;
    if (cacheIce && cacheIce.hasta > ahora()) return cacheIce.valor;
    if (enVuelo) return enVuelo;
    const f = opciones.fetch ?? (typeof fetch === "function" ? fetch : null);
    if (!f) return respaldoLocal();
    const promesa = (async (): Promise<IceCliente> => {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const tope = setTimeout(() => ctrl?.abort(), opciones.timeoutMs ?? 4000);
        try {
            const r = await f(RUTA_ICE, {
                method: "GET",
                cache: "no-store",
                credentials: "same-origin",
                headers: { accept: "application/json" },
                signal: ctrl?.signal,
            });
            if (!r.ok) return respaldoLocal();
            const j = (await r.json()) as Partial<RespuestaIce> | null;
            const lista = unirConStun(normalizarIceServers(j?.iceServers));
            const turn = contieneTurn(lista);
            const fuente: FuenteIce = FUENTES_ICE.includes(j?.fuente as FuenteIce) ? (j!.fuente as FuenteIce) : turn ? "estatico" : "stun";
            const valor: IceCliente = { iceServers: lista, turn, fuente };
            const ttl = typeof j?.ttl === "number" && Number.isFinite(j.ttl) && j.ttl > 0 ? Math.min(j.ttl, 86_400) : 300;
            cacheIce = { valor, hasta: ahora() + Math.max(0, ttl * 1000 - 60_000) };
            return valor;
        } catch {
            return respaldoLocal();
        } finally {
            clearTimeout(tope);
        }
    })();
    enVuelo = promesa;
    try {
        return await promesa;
    } finally {
        if (enVuelo === promesa) enVuelo = null;
    }
}

/** Solo pruebas. */
export function __olvidarIce(): void {
    cacheIce = null;
    enVuelo = null;
}
