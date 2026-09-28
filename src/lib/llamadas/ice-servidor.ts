/**
 * Servidores ICE desde el SERVIDOR (lo usa `GET /api/llamadas/ice`).
 *
 * Orden de preferencia (el primero configurado que responda con un TURN válido gana):
 *   1. Cloudflare Realtime TURN — `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN`.
 *      POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers
 *      (Bearer, cuerpo `{"ttl":86400}`) → credenciales de corta duración por petición.
 *   2. Metered — `METERED_TURN_DOMAIN` + `METERED_TURN_API_KEY`.
 *      GET https://<dominio>/api/v1/turn/credentials?apiKey=…
 *   3. TURN fijo — `TURN_URL`/`TURN_USER`/`TURN_CRED` (solo servidor) o sus equivalentes
 *      `NEXT_PUBLIC_TURN_*`.
 *   4. Solo STUN públicos.
 * Siempre se añaden los STUN públicos.
 *
 * Secretos: los tokens de Cloudflare y la clave de Metered solo viajan del servidor al
 * proveedor; al navegador llegan únicamente las URLs y el usuario/credencial temporales que
 * necesita. Nunca se registran (los avisos de fallo dicen solo el proveedor y el código HTTP).
 *
 * Sin `"use server"` ni APIs de Node: funciones puras con `fetch` inyectable (probadas con
 * dobles en `__tests__/ice-servidor.test.ts`).
 */
import { contieneTurn, normalizarIceServers, servidoresIce, STUN_POR_DEFECTO, unirConStun, type FuenteIce, type RespuestaIce } from "@/lib/llamadas/ice";

/** Vida de las credenciales pedidas a Cloudflare (una llamada larga cabe de sobra). */
export const TTL_CLOUDFLARE_S = 86_400;
/** Cuánto puede guardarlas el navegador cuando el proveedor no dice caducidad. */
export const TTL_METERED_S = 3_600;
export const TTL_ESTATICO_S = 3_600;
/** Solo STUN: poco rato, por si el TURN vuelve pronto. */
export const TTL_STUN_S = 300;

export const URL_CLOUDFLARE_TURN = "https://rtc.live.cloudflare.com/v1/turn/keys";

export interface EntornoIceServidor {
    cloudflareKeyId?: string | null;
    cloudflareToken?: string | null;
    meteredDominio?: string | null;
    meteredApiKey?: string | null;
    turnUrl?: string | null;
    turnUser?: string | null;
    turnCred?: string | null;
}

type Env = Record<string, string | undefined>;

function limpio(v: string | undefined | null): string | null {
    const s = (v ?? "").trim();
    return s ? s : null;
}

/** Lee solo los NOMBRES de variable acordados (ver `architecture/llamadas-turn-y-canales-privados.md`). */
export function entornoIceServidor(env: Env = process.env as Env): EntornoIceServidor {
    return {
        cloudflareKeyId: limpio(env.CLOUDFLARE_TURN_KEY_ID),
        cloudflareToken: limpio(env.CLOUDFLARE_TURN_KEY_API_TOKEN),
        meteredDominio: limpio(env.METERED_TURN_DOMAIN),
        meteredApiKey: limpio(env.METERED_TURN_API_KEY),
        turnUrl: limpio(env.TURN_URL) ?? limpio(env.NEXT_PUBLIC_TURN_URL),
        turnUser: limpio(env.TURN_USER) ?? limpio(env.NEXT_PUBLIC_TURN_USER),
        turnCred: limpio(env.TURN_CRED) ?? limpio(env.NEXT_PUBLIC_TURN_CRED),
    };
}

export type ProveedorIce =
    | { tipo: "cloudflare"; keyId: string; token: string }
    | { tipo: "metered"; dominio: string; apiKey: string }
    | { tipo: "estatico"; url: string; user: string; cred: string };

const RE_ID_CLAVE = /^[A-Za-z0-9_-]{6,128}$/;
/** Un nombre de host normal (sin esquema, puerto, ruta ni credenciales). */
const RE_DOMINIO = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Proveedores configurados y completos, en orden de preferencia. */
export function proveedoresIce(env: EntornoIceServidor): ProveedorIce[] {
    const lista: ProveedorIce[] = [];
    if (env.cloudflareKeyId && env.cloudflareToken && RE_ID_CLAVE.test(env.cloudflareKeyId)) {
        lista.push({ tipo: "cloudflare", keyId: env.cloudflareKeyId, token: env.cloudflareToken });
    }
    if (env.meteredDominio && env.meteredApiKey && RE_DOMINIO.test(env.meteredDominio)) {
        lista.push({ tipo: "metered", dominio: env.meteredDominio.toLowerCase(), apiKey: env.meteredApiKey });
    }
    if (env.turnUrl && env.turnUser && env.turnCred) {
        lista.push({ tipo: "estatico", url: env.turnUrl, user: env.turnUser, cred: env.turnCred });
    }
    return lista;
}

/** El proveedor que se intentará primero (o null: solo STUN). */
export function elegirProveedor(env: EntornoIceServidor): ProveedorIce | null {
    return proveedoresIce(env)[0] ?? null;
}

export function urlCloudflare(keyId: string): string {
    return `${URL_CLOUDFLARE_TURN}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
}

export function urlMetered(dominio: string, apiKey: string): string {
    return `https://${dominio}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
}

/** Respuesta final: STUN públicos + lo del proveedor. */
export function respuestaIce(lista: RTCIceServer[], fuente: FuenteIce, ttl: number): RespuestaIce {
    return { iceServers: unirConStun(lista), fuente, ttl };
}

export function soloStun(): RespuestaIce {
    return { iceServers: STUN_POR_DEFECTO.map((s) => ({ ...s })), fuente: "stun", ttl: TTL_STUN_S };
}

type Fetch = typeof fetch;

async function conTope(f: Fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const t = setTimeout(() => ctrl?.abort(), ms);
    try {
        return await f(url, { ...init, cache: "no-store", signal: ctrl?.signal });
    } finally {
        clearTimeout(t);
    }
}

function avisar(tipo: ProveedorIce["tipo"], detalle: string, registrar: (m: string) => void) {
    // Solo proveedor y estado: jamás URLs con clave ni cabeceras.
    try {
        registrar(`[llamadas/ice] ${tipo}: ${detalle}; se prueba la siguiente opción.`);
    } catch {
        /* noop */
    }
}

/** Pide credenciales a UN proveedor. null si no dio un TURN utilizable. */
export async function pedirAProveedor(
    p: ProveedorIce,
    opciones: { fetch?: Fetch; timeoutMs?: number; registrar?: (m: string) => void } = {},
): Promise<RespuestaIce | null> {
    const f = opciones.fetch ?? (typeof fetch === "function" ? fetch : null);
    const ms = opciones.timeoutMs ?? 5000;
    const registrar = opciones.registrar ?? ((m: string) => console.warn(m));
    if (p.tipo === "estatico") {
        const lista = servidoresIce({ url: p.url, user: p.user, cred: p.cred });
        return contieneTurn(lista) ? { iceServers: lista, fuente: "estatico", ttl: TTL_ESTATICO_S } : null;
    }
    if (!f) return null;
    try {
        if (p.tipo === "cloudflare") {
            const r = await conTope(
                f,
                urlCloudflare(p.keyId),
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ ttl: TTL_CLOUDFLARE_S }),
                },
                ms,
            );
            if (!r.ok) {
                avisar(p.tipo, `respondió ${r.status}`, registrar);
                return null;
            }
            const lista = normalizarIceServers(await r.json(), { quitarPuerto53: true });
            if (!contieneTurn(lista)) {
                avisar(p.tipo, "respuesta sin TURN", registrar);
                return null;
            }
            return respuestaIce(lista, "cloudflare", TTL_CLOUDFLARE_S);
        }
        const r = await conTope(f, urlMetered(p.dominio, p.apiKey), { method: "GET", headers: { Accept: "application/json" } }, ms);
        if (!r.ok) {
            avisar(p.tipo, `respondió ${r.status}`, registrar);
            return null;
        }
        const lista = normalizarIceServers(await r.json());
        if (!contieneTurn(lista)) {
            avisar(p.tipo, "respuesta sin TURN", registrar);
            return null;
        }
        return respuestaIce(lista, "metered", TTL_METERED_S);
    } catch (e) {
        const nombre = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "error";
        avisar(p.tipo, nombre === "AbortError" ? "sin respuesta a tiempo" : "no se pudo contactar", registrar);
        return null;
    }
}

/**
 * Servidores ICE para el navegador: prueba los proveedores configurados en orden y, si ninguno
 * da un TURN, devuelve solo STUN. Nunca lanza.
 */
export async function generarIceServidor(
    env: EntornoIceServidor,
    opciones: { fetch?: Fetch; timeoutMs?: number; registrar?: (m: string) => void } = {},
): Promise<RespuestaIce> {
    for (const p of proveedoresIce(env)) {
        const r = await pedirAProveedor(p, opciones);
        if (r) return r;
    }
    return soloStun();
}

/**
 * ¿La petición viene de otra web? Los navegadores mandan `Sec-Fetch-Site`; si dice
 * «cross-site» (o el `Origin` no es este host) no se regalan credenciales TURN a terceros.
 */
export function peticionDeOtroSitio(cabeceras: Pick<Headers, "get">): boolean {
    const sitio = (cabeceras.get("sec-fetch-site") ?? "").toLowerCase();
    if (sitio === "cross-site") return true;
    const origen = cabeceras.get("origin");
    const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
    if (origen && host) {
        try {
            return new URL(origen).host.toLowerCase() !== host.split(",")[0].trim().toLowerCase();
        } catch {
            return true;
        }
    }
    return false;
}
