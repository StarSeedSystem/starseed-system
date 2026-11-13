/**
 * Chats de Genesis · cliente web de la puerta de datos del A1 (GEN1113C, contrato §5 y §7.2).
 *
 * Sin `node:*`. Habla con las rutas `/v1/genesis/chats/*` de la puerta con la sesión de Supabase en
 * `Authorization: Bearer` y sin cookies. Tres reglas que no se negocian:
 *  · `enviar` NUNCA usa la cola local del adaptador (`operar` encola los POST cuando la puerta falla):
 *    una orden no puede salir más tarde a espaldas de quien la escribió. Si falla, `ok: false` y la
 *    interfaz conserva el borrador.
 *  · `feed` hace la espera larga (≤ 25 s) con un tiempo máximo ≥ 30 s y se puede abortar: devuelve
 *    `{ok:false, estado:0, error:"abortado"}` sin lanzar y sin dejar temporizadores vivos.
 *  · No hay respaldo por Supabase ni por el túnel (decisión D4): si la puerta no está, se dice.
 * `acuses` va por `puertaA1().operar` (GET sin cola), como pide el contrato.
 */

import { puertaA1, type PuertaA1 } from "@/lib/datos/puerta-a1";
import { leerUrlGuardada, urlPuertaValida, type AlmacenPuerta } from "@/lib/datos/puerta-a1-tipos";
import { estadoEspejo } from "./estado-espejo";
import {
    ACCIONES_ENTRADA,
    FUENTES_ENTRADA,
    FUENTES_ESPEJO,
    LIMITE_TEXTO_ENTRADA,
    type EntradaChat,
    type RegistroEspejo,
} from "./tipos";

export { estadoEspejo };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RespuestaFeed =
    | { ok: true; registros: RegistroEspejo[]; cursor: number; latido: { t: string; de: "mac" | "a1" } | null }
    | { ok: false; estado: 401 | 403 | 503 | 0; error: string };

export type RespuestaEnviar = { ok: true; id: number } | { ok: false; estado: number; codigo?: string; error: string };

export interface ClienteChatsGenesis {
    feed(f: { fuente: string; desde?: number; esperar?: number; limite?: number }, senal?: AbortSignal): Promise<RespuestaFeed>;
    enviar(e: Omit<EntradaChat, "v" | "nonce" | "t">): Promise<RespuestaEnviar>;
    acuses(ids: number[]): Promise<Record<number, { estado: string; detalle?: string; t: string }>>;
}

export const RUTA = "/v1/genesis/chats";
export const ESPERA_MAX_S = 25;
export const LIMITE_FEED_MAX = 500;
/** Tiempo máximo de una petición de feed con espera larga (contrato: ≥ 30 s). */
export const TIEMPO_FEED_LARGO_MS = 30_000;
export const TIEMPO_FEED_CORTO_MS = 10_000;
export const TIEMPO_ENVIAR_MS = 15_000;
export const ACUSES_POR_PETICION = 50;

export interface OpcionesClienteChats {
    puerta?: PuertaA1;
    fetch?: FetchLike;
    ahora?: () => number;
    /** URL base de la puerta. Por defecto, la misma que usa el adaptador (variable pública o fila `os_puerta_datos`). */
    url?: () => Promise<string | null>;
    /** JWT de la sesión. Por defecto, la sesión guardada del cliente único de Supabase (sin red). */
    sesion?: () => Promise<string | null>;
    /** Generador del nonce (pruebas). Por defecto, 16 bytes de `crypto.getRandomValues`. */
    nonce?: () => string;
}

/** 128 bits aleatorios en base64url (22 caracteres). Sin generador seguro, lanza: nunca `Math.random`. */
export function nonceSeguro(): string {
    const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
    if (!c?.getRandomValues) throw new Error("Este aparato no tiene un generador aleatorio seguro");
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function almacenNavegador(): AlmacenPuerta | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function entero(x: unknown, min: number, max: number): number | undefined {
    if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
    return Math.min(max, Math.max(min, Math.floor(x)));
}

const MENSAJES: Record<number, string> = {
    400: "La puerta no aceptó la forma del mensaje",
    401: "Inicia sesión para ver los chats de Genesis",
    403: "Tu cuenta no tiene acceso a MetaGenesis",
    409: "Ese mensaje ya había llegado a la puerta",
    429: "Demasiados mensajes seguidos: espera un minuto",
    503: "No se pudo comprobar tu permiso; no se envió nada",
};
const SOLO_DUENO = "Esta orden solo la puede dar un dueño de MetaGenesis";
/** Los `codigo` estables de la puerta (GEN1113A) traducidos para la interfaz (§4.5). */
const POR_CODIGO: Record<string, string> = {
    "sin-sesion": MENSAJES[401],
    "no-miembro": MENSAJES[403],
    "solo-dueno": SOLO_DUENO,
    "rol-sin-comprobar": MENSAJES[503],
    limite: MENSAJES[429],
    "nonce-repetido": MENSAJES[409],
    grande: "El mensaje pasa de 16 KB",
};

type Pedido = { estado: number; cuerpo: unknown } | { motivo: "abortado" | "tiempo" | "red" };

export function crearClienteChatsGenesis(op: OpcionesClienteChats = {}): ClienteChatsGenesis {
    const puerta = op.puerta ?? puertaA1();
    const pedirFetch: FetchLike = op.fetch ?? ((i, init) => fetch(i, init));
    const ahora = op.ahora ?? (() => Date.now());
    const nonce = op.nonce ?? nonceSeguro;

    async function urlBase(): Promise<string | null> {
        if (op.url) return urlPuertaValida(await op.url());
        const env = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PUERTA_DATOS_URL : undefined;
        if (env) return urlPuertaValida(env);
        // `configurada()` resuelve la URL como el adaptador (y la deja guardada en el aparato).
        if (!(await puerta.configurada())) return null;
        return leerUrlGuardada(almacenNavegador(), ahora())?.url ?? null;
    }

    async function sesion(): Promise<string | null> {
        try {
            if (op.sesion) return await op.sesion();
            const sb = (await import("@/utils/supabase/client")).createClient();
            const { data } = await sb.auth.getSession();
            return data.session?.access_token ?? null;
        } catch {
            return null;
        }
    }

    /** A dónde y con qué sesión; o por qué no se puede. */
    async function destino(): Promise<{ base: string; jwt: string } | { estado: 0 | 401; error: string }> {
        if (puerta.modo() === "apagada") return { estado: 0, error: "La puerta de datos está apagada en este aparato (Ajustes)" };
        const base = await urlBase().catch(() => null);
        if (!base) return { estado: 0, error: "La puerta de datos del A1 no está configurada o no se pudo leer su dirección" };
        const jwt = await sesion();
        if (!jwt) return { estado: 401, error: MENSAJES[401] };
        return { base, jwt };
    }

    /** Una petición directa con tiempo máximo y aborto. Lee el cuerpo dentro del mismo plazo. */
    async function pedir(url: string, init: RequestInit, ms: number, senal?: AbortSignal): Promise<Pedido> {
        if (senal?.aborted) return { motivo: "abortado" };
        const ctrl = new AbortController();
        let porTiempo = false;
        const t = setTimeout(() => {
            porTiempo = true;
            ctrl.abort();
        }, ms);
        const alAbortar = () => ctrl.abort();
        senal?.addEventListener("abort", alAbortar, { once: true });
        const cortada = new Promise<never>((_, rechazar) => {
            ctrl.signal.addEventListener("abort", () => rechazar(new Error("abortada")), { once: true });
        });
        try {
            const leer = (async () => {
                const r = await pedirFetch(url, { ...init, signal: ctrl.signal, cache: "no-store", credentials: "omit" });
                let cuerpo: unknown = null;
                try {
                    cuerpo = await r.json();
                } catch {
                    cuerpo = null;
                }
                return { estado: r.status, cuerpo };
            })();
            return await Promise.race([leer, cortada]);
        } catch {
            return { motivo: senal?.aborted ? "abortado" : porTiempo ? "tiempo" : "red" };
        } finally {
            clearTimeout(t);
            senal?.removeEventListener("abort", alAbortar);
        }
    }

    function textoError(cuerpo: unknown, estado: number): { error: string; codigo?: string } {
        const c = esObjeto(cuerpo) ? cuerpo : {};
        const codigo = typeof c.codigo === "string" ? c.codigo.slice(0, 40) : undefined;
        const delServidor = typeof c.error === "string" && c.error.trim() ? c.error.slice(0, 300) : undefined;
        const error = (codigo && POR_CODIGO[codigo]) || delServidor || MENSAJES[estado] || `La puerta respondió ${estado}`;
        return codigo ? { error, codigo } : { error };
    }

    async function feed(f: { fuente: string; desde?: number; esperar?: number; limite?: number }, senal?: AbortSignal): Promise<RespuestaFeed> {
        if (senal?.aborted) return { ok: false, estado: 0, error: "abortado" };
        if (!(FUENTES_ESPEJO as readonly string[]).includes(f.fuente)) return { ok: false, estado: 0, error: "Fuente de chat desconocida" };
        const d = await destino();
        if ("error" in d) return { ok: false, estado: d.estado, error: d.error };
        const esperar = entero(f.esperar, 0, ESPERA_MAX_S) ?? 0;
        const desde = entero(f.desde, 0, Number.MAX_SAFE_INTEGER);
        const limite = entero(f.limite, 1, LIMITE_FEED_MAX);
        const q = new URLSearchParams({ fuente: f.fuente });
        if (desde !== undefined) q.set("desde", String(desde));
        if (limite !== undefined) q.set("limite", String(limite));
        if (esperar > 0) q.set("esperar", String(esperar));
        const ms = esperar > 0 ? Math.max(TIEMPO_FEED_LARGO_MS, (esperar + 5) * 1000) : TIEMPO_FEED_CORTO_MS;
        const r = await pedir(
            `${d.base}${RUTA}/feed?${q.toString()}`,
            { method: "GET", headers: { accept: "application/json", authorization: `Bearer ${d.jwt}` } },
            ms,
            senal,
        );
        if ("motivo" in r) {
            const error = r.motivo === "abortado" ? "abortado" : r.motivo === "tiempo" ? "La puerta de datos del A1 no contestó a tiempo" : "La puerta de datos del A1 no responde";
            return { ok: false, estado: 0, error };
        }
        if (r.estado >= 200 && r.estado < 300) {
            const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
            const registros = (Array.isArray(c.registros) ? c.registros : []).filter(
                (x): x is RegistroEspejo => esObjeto(x) && typeof x.id === "string" && typeof x.t === "string",
            );
            const cursor = typeof c.cursor === "number" && Number.isFinite(c.cursor) ? c.cursor : desde ?? 0;
            const l = esObjeto(c.latido) ? c.latido : null;
            const latido = l && typeof l.t === "string" && (l.de === "mac" || l.de === "a1") ? { t: l.t, de: l.de as "mac" | "a1" } : null;
            return { ok: true, registros, cursor, latido };
        }
        const estado = r.estado === 401 || r.estado === 403 || r.estado === 503 ? r.estado : 0;
        const { error } = textoError(r.cuerpo, r.estado);
        return { ok: false, estado, error };
    }

    async function enviar(e: Omit<EntradaChat, "v" | "nonce" | "t">): Promise<RespuestaEnviar> {
        const forma = (error: string): RespuestaEnviar => ({ ok: false, estado: 400, codigo: "forma", error });
        if (!esObjeto(e) || !(FUENTES_ENTRADA as readonly string[]).includes(e.fuente)) return forma("Ese chat no admite mensajes");
        if (!(ACCIONES_ENTRADA as readonly string[]).includes(e.accion)) return forma("Acción no válida");
        if (e.texto !== undefined && (typeof e.texto !== "string" || e.texto.length > LIMITE_TEXTO_ENTRADA)) {
            return forma(`El texto pasa de ${LIMITE_TEXTO_ENTRADA} caracteres`);
        }
        let n: string;
        try {
            n = nonce();
        } catch (x) {
            return { ok: false, estado: 0, error: x instanceof Error ? x.message : "Sin generador seguro" };
        }
        // Solo los campos del contrato: `cuenta` y `rol` los pone la puerta, nunca el cuerpo.
        const cuerpo: EntradaChat = { v: 1, nonce: n, t: new Date(ahora()).toISOString(), fuente: e.fuente, accion: e.accion };
        if (e.texto !== undefined) cuerpo.texto = e.texto;
        if (e.modelo !== undefined) cuerpo.modelo = e.modelo;
        if (e.canales !== undefined) cuerpo.canales = e.canales;
        if (e.respondeA !== undefined) cuerpo.respondeA = e.respondeA;
        if (e.reenviar !== undefined) cuerpo.reenviar = e.reenviar;
        if (e.orden !== undefined) cuerpo.orden = e.orden;

        const d = await destino();
        if ("error" in d) return { ok: false, estado: d.estado, error: d.error };
        // Petición DIRECTA, una sola vez: nada de `puerta.operar`, nada de cola local.
        const r = await pedir(
            `${d.base}${RUTA}/entrada`,
            {
                method: "POST",
                headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${d.jwt}` },
                body: JSON.stringify(cuerpo),
            },
            TIEMPO_ENVIAR_MS,
        );
        if ("motivo" in r) {
            const error = r.motivo === "tiempo"
                ? "La puerta del A1 no contestó a tiempo: puede que no se haya enviado"
                : "No se envió: la puerta de datos del A1 no responde";
            return { ok: false, estado: 0, error };
        }
        if (r.estado >= 200 && r.estado < 300) {
            const id = esObjeto(r.cuerpo) ? Number(r.cuerpo.id) : NaN;
            if (Number.isInteger(id) && id > 0) return { ok: true, id };
            return { ok: false, estado: r.estado, codigo: "sin-id", error: "La puerta contestó sin el número de la entrada" };
        }
        return { ok: false, estado: r.estado, ...textoError(r.cuerpo, r.estado) };
    }

    async function acuses(ids: number[]): Promise<Record<number, { estado: string; detalle?: string; t: string }>> {
        const fuera: Record<number, { estado: string; detalle?: string; t: string }> = {};
        const limpios = [...new Set((Array.isArray(ids) ? ids : []).filter((n) => Number.isInteger(n) && n > 0))];
        for (let i = 0; i < limpios.length; i += ACUSES_POR_PETICION) {
            const tanda = limpios.slice(i, i + ACUSES_POR_PETICION);
            const r = await puerta
                .operar<{ acuses?: unknown }>({ metodo: "GET", ruta: `${RUTA}/acuses?ids=${tanda.join(",")}`, conSesion: true, timeoutMs: TIEMPO_FEED_CORTO_MS })
                .catch(() => null);
            const lista = r && r.via === "puerta" && esObjeto(r.datos) && Array.isArray(r.datos.acuses) ? r.datos.acuses : [];
            for (const a of lista) {
                if (!esObjeto(a) || typeof a.estado !== "string") continue;
                const id = Number(a.id);
                if (!tanda.includes(id)) continue;
                fuera[id] = typeof a.detalle === "string"
                    ? { estado: a.estado, detalle: a.detalle.slice(0, 300), t: typeof a.t === "string" ? a.t : "" }
                    : { estado: a.estado, t: typeof a.t === "string" ? a.t : "" };
            }
        }
        return fuera;
    }

    return { feed, enviar, acuses };
}
