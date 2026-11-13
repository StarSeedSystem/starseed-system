/**
 * Chats de Genesis · catálogo de chats canónicos y la única función que da nombre a un chat
 * (contrato GEN1114 §2.3, §2.4, §3.4 y §5.1).
 *
 * Arriba, PURO (sin red, sin `node:*`, sin React): tipos, `catalogoValido`, `nombreDeChat`,
 * `chatDeFuente` y `chatParaFirmar`. Abajo, el cliente que lee el catálogo de la puerta del A1 y
 * guarda una copia en el aparato (solo comodidad: la verdad es la puerta y, detrás, la Mac).
 *
 * El catálogo lo sirve la puerta, que no es de confianza: puede enseñar nombres falsos. Por eso
 *  · la relación fuente → chat es FIJA en el código (`chatDeFuente` exige el alias fijo);
 *  · lo que se firma lleva el id y el nombre que vio la persona, y la Mac los compara con su
 *    `canon.json` (si no cuadran, no ejecuta nada).
 */

import type { PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import { CANALES, type CanalId } from "@/lib/mando/chat-director-tipos";
import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { crearPuertaDirecta, type FetchLike } from "./puerta-chats";
import type { PuertaA1 } from "@/lib/datos/puerta-a1";
import {
    ALIAS_DE_FUENTE,
    ALIAS_GEN1113,
    ID_DIRECCION,
    PREFIJO_CANAL,
    PREFIJO_TELEGRAM,
    etiquetaProvisional,
    fuenteDeAlias,
} from "./alias-gen1113";
import { FUENTES_ESPEJO, MAX_NOMBRE_CHAT, RE_ID_CHAT, type Bandeja, type FuenteEspejo } from "./tipos";
import type { AlmacenLocal } from "./vinculos";

export { ALIAS_GEN1113 };

// ── §5.1 · tipos ─────────────────────────────────────────────────────────────────────────────

export type TipoChatCanonico = "direccion" | "canal-director" | "puente-telegram" | "astraura";
export type MedioChat =
    | "mac-direccion" | "claude" | "codex" | "hermes" | "antigravity" | "ide" | "terminal"
    | "telegram" | "a1-peticiones" | "genesis-web" | "astraura";
export type EstadoNombre = "igual" | "distinto" | "sin-comprobar" | "no-se-puede";

/** Lo que viaja (catálogo). Nada de ids nativos, tokens, rutas ni `refs`. */
export interface MedioPublico {
    medio: MedioChat;
    nombreEnMedio: string | null; // ≤ 80
    estadoNombre: EstadoNombre;
    comprobado: string | null; // ISO de la última comprobación
    huella: string | null; // ^[0-9a-f]{8}$
    usuario?: string; // "@bot", solo puentes y solo para el dueño
}

export interface ConfigChat {
    descripcion: string;
    modeloPorDefecto: string | null;
    canalesPorDefecto: CanalId[];
    personalidad: { tipo: "aurora" | "bot"; id: string } | null;
    capas: PreferenciaCapas | null;
    memoria: { activa: boolean; alcance: AlcanceMemoria };
    avisos: { silencio: boolean; resumen: "nunca" | "diario" };
    bandejas: Bandeja[];
}

export interface ContextoChat {
    instrucciones: string;
    fijados: string[];
    memorias: string[];
    resumen: { texto: string; t: string; por: string } | null;
}

export interface VersionCampo { n: number; t: string; por: string }

export interface ChatCanonicoPublico {
    v: 2;
    id: string;
    nombre: string;
    nombreProvisional: boolean;
    tipo: TipoChatCanonico;
    padre?: string;
    fuente: FuenteEspejo | null;
    alias: string[];
    medios: MedioPublico[];
    config?: ConfigChat; // fase 2
    contexto?: Pick<ContextoChat, "fijados" | "resumen">; // fase 2
    version: number;
    actualizado: string;
}

export interface CatalogoCanon { v: 2; chats: ChatCanonicoPublico[]; version: number; t: string }

export const TIPOS_CHAT: readonly TipoChatCanonico[] = ["direccion", "canal-director", "puente-telegram", "astraura"];
export const MEDIOS_CHAT: readonly MedioChat[] = [
    "mac-direccion", "claude", "codex", "hermes", "antigravity", "ide", "terminal", "telegram", "a1-peticiones", "genesis-web", "astraura",
];
export const ESTADOS_NOMBRE: readonly EstadoNombre[] = ["igual", "distinto", "sin-comprobar", "no-se-puede"];
export const MAX_ALIAS = 20;
export const MAX_MEDIOS = 16;
export const MAX_CHATS_CATALOGO = 200;
/** Copia del catálogo en el aparato (§2.2). */
export const CLAVE_CANON_LOCAL = "starseed.chats-genesis.canon.v1";
export const RUTA_CANON = "/v1/genesis/chats/canon";

// ── limpieza de textos ───────────────────────────────────────────────────────────────────────

/** Controles (C0, DEL, C1) y marcas de dirección (U+202A–202E, U+2066–2069, U+200E/F). */
const RE_CONTROLES = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g;

/** Quita controles y marcas bidi, recorta espacios y deja como mucho `max` caracteres (por punto de código). */
export function limpiarNombre(s: unknown, max = MAX_NOMBRE_CHAT): string {
    if (typeof s !== "string") return "";
    return [...s.replace(RE_CONTROLES, "").trim()].slice(0, max).join("").trim();
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function textoIso(x: unknown): string | null {
    return typeof x === "string" && x.length <= 40 && Number.isFinite(Date.parse(x)) ? x : null;
}

function medioValido(x: unknown): MedioPublico | null {
    if (!esObjeto(x)) return null;
    if (typeof x.medio !== "string" || !(MEDIOS_CHAT as readonly string[]).includes(x.medio)) return null;
    const estadoNombre = typeof x.estadoNombre === "string" && (ESTADOS_NOMBRE as readonly string[]).includes(x.estadoNombre)
        ? (x.estadoNombre as EstadoNombre)
        : "sin-comprobar";
    const nombreEnMedio = limpiarNombre(x.nombreEnMedio) || null;
    const huella = typeof x.huella === "string" && /^[0-9a-f]{8}$/.test(x.huella) ? x.huella : null;
    const m: MedioPublico = { medio: x.medio as MedioChat, nombreEnMedio, estadoNombre, comprobado: textoIso(x.comprobado), huella };
    const usuario = limpiarNombre(x.usuario, 64);
    if (usuario) m.usuario = usuario;
    return m;
}

function chatValido(x: unknown): ChatCanonicoPublico | null {
    if (!esObjeto(x)) return null;
    if (typeof x.id !== "string" || !RE_ID_CHAT.test(x.id)) return null;
    const nombre = limpiarNombre(x.nombre);
    if (!nombre) return null;
    if (typeof x.tipo !== "string" || !(TIPOS_CHAT as readonly string[]).includes(x.tipo)) return null;
    let fuente: FuenteEspejo | null = null;
    if (x.fuente !== null && x.fuente !== undefined) {
        if (typeof x.fuente !== "string" || !(FUENTES_ESPEJO as readonly string[]).includes(x.fuente)) return null;
        fuente = x.fuente as FuenteEspejo;
    }
    const alias: string[] = [];
    for (const a of Array.isArray(x.alias) ? x.alias : []) {
        const l = limpiarNombre(a);
        if (l && !alias.includes(l)) alias.push(l);
        if (alias.length >= MAX_ALIAS) break;
    }
    const medios = (Array.isArray(x.medios) ? x.medios : []).map(medioValido).filter((m): m is MedioPublico => !!m).slice(0, MAX_MEDIOS);
    const chat: ChatCanonicoPublico = {
        v: 2,
        id: x.id,
        nombre,
        // Lo que no diga claramente «no es provisional» se trata como provisional (honestidad, §10).
        nombreProvisional: x.nombreProvisional !== false,
        tipo: x.tipo as TipoChatCanonico,
        fuente,
        alias,
        medios,
        version: typeof x.version === "number" && Number.isFinite(x.version) ? x.version : 0,
        actualizado: textoIso(x.actualizado) ?? "",
    };
    if (typeof x.padre === "string" && RE_ID_CHAT.test(x.padre)) chat.padre = x.padre;
    // `config` y `contexto` son de la fase 2: aquí no se leen (no se pinta nada que no se haya validado).
    return chat;
}

/**
 * Un catálogo con forma válida (copia limpia) o null. Tolerante: un chat roto se quita y nunca lanza.
 * Pero descarta el catálogo ENTERO si hay ids o alias repetidos, o si un alias de un chat es el id
 * o el nombre de otro: entonces `nombreDeChat` sería ambiguo y lo que se ve podría no ser lo que se firma.
 */
export function catalogoValido(x: unknown): CatalogoCanon | null {
    try {
        if (!esObjeto(x) || x.v !== 2 || !Array.isArray(x.chats)) return null;
        const chats: ChatCanonicoPublico[] = [];
        for (const c of x.chats.slice(0, MAX_CHATS_CATALOGO)) {
            const v = chatValido(c);
            if (v) chats.push(v);
        }
        const ids = new Set<string>();
        for (const c of chats) {
            if (ids.has(c.id)) return null;
            ids.add(c.id);
        }
        const aliasDe = new Map<string, string>();
        for (const c of chats) {
            for (const a of c.alias) {
                if (aliasDe.has(a)) return null;
                aliasDe.set(a, c.id);
            }
        }
        for (const c of chats) {
            for (const a of c.alias) {
                const otro = chats.find((o) => o.id !== c.id && (o.id === a || o.nombre === a));
                if (otro) return null;
            }
        }
        const version = typeof x.version === "number" && Number.isFinite(x.version) ? x.version : 0;
        return { v: 2, chats, version, t: textoIso(x.t) ?? "" };
    } catch {
        return null;
    }
}

// ── la relación fija fuente → chat (§3.4) y el nombre de un chat ─────────────────────────────

/**
 * El chat de una fuente de transporte. Exige a la vez: que su `fuente` sea esa, que su `alias`
 * incluya la clave fija de transporte, que ningún otro chat la tenga y que el id tenga la forma
 * fija (`genesis` para la dirección, `telegram.*` para un puente). Si algo no cuadra, null: la
 * interfaz usa entonces el nombre provisional.
 */
export function chatDeFuente(cat: CatalogoCanon | null, f: FuenteEspejo): ChatCanonicoPublico | null {
    if (!cat || !Array.isArray(cat.chats)) return null;
    if (!(FUENTES_ESPEJO as readonly string[]).includes(f)) return null;
    const conFuente = cat.chats.filter((c) => c.fuente === f);
    const conAlias = cat.chats.filter((c) => c.alias.includes(f));
    if (conFuente.length !== 1 || conAlias.length !== 1 || conFuente[0] !== conAlias[0]) return null;
    const c = conFuente[0];
    if (f === "direccion" ? c.id !== ID_DIRECCION : !c.id.startsWith(PREFIJO_TELEGRAM)) return null;
    return c;
}

function nombreDeCanal(id: string): string | null {
    if (!id.startsWith(PREFIJO_CANAL)) return null;
    const canal = id.slice(PREFIJO_CANAL.length);
    if (canal === "mando") return null; // el canal `mando` es el propio chat `genesis`
    return CANALES.find((c) => c.id === canal)?.nombre ?? null;
}

/**
 * LA función que da nombre a un chat (sustituye a las etiquetas fijas de GEN1113). `clave` puede ser
 * el id canónico, un alias (también las etiquetas y claves de GEN1113) o una fuente de transporte.
 * Sin catálogo, o si el catálogo no tiene ese chat, devuelve la etiqueta de GEN1113 con
 * `provisional: true`, y la interfaz añade «(nombre provisional: la Mac aún no ha publicado el nombre real)».
 */
export function nombreDeChat(cat: CatalogoCanon | null, clave: string): { nombre: string; id: string | null; provisional: boolean } {
    const k = typeof clave === "string" ? clave.trim() : "";
    const fuente = fuenteDeAlias(k) ?? (k === ID_DIRECCION ? "direccion" : null);
    let chat: ChatCanonicoPublico | null = null;
    if (cat && Array.isArray(cat.chats)) {
        // Las claves de transporte van SIEMPRE por la relación fija, nunca por un alias cualquiera.
        if (fuente) chat = chatDeFuente(cat, fuente);
        else chat = cat.chats.find((c) => c.id === k) ?? (cat.chats.filter((c) => c.alias.includes(k)).length === 1 ? cat.chats.find((c) => c.alias.includes(k)) ?? null : null);
    }
    if (chat) return { nombre: chat.nombre, id: chat.id, provisional: chat.nombreProvisional };
    if (fuente) return { nombre: etiquetaProvisional(fuente), id: fuente === "direccion" ? ID_DIRECCION : null, provisional: true };
    const canal = nombreDeCanal(k);
    if (canal) return { nombre: canal, id: k, provisional: true };
    return { nombre: k || "Chat sin nombre", id: null, provisional: true };
}

/**
 * El `{id, nombre}` que se firma al escribir en una fuente (§3.4): el que la cabecera del hilo
 * enseña. `canal` es el único canal elegido en la dirección (si hay uno y no es `mando`).
 * Para un puente sin catálogo válido devuelve null: sin su id real no se puede escribir.
 */
export function chatParaFirmar(
    cat: CatalogoCanon | null,
    fuente: FuenteEspejo,
    canal?: CanalId | null,
): { id: string; nombre: string; provisional: boolean } | null {
    if (fuente === "direccion" && canal && canal !== "mando") {
        const id = `${PREFIJO_CANAL}${canal}`;
        const c = cat?.chats.find((x) => x.id === id && x.tipo === "canal-director") ?? null;
        if (c) return { id, nombre: c.nombre, provisional: c.nombreProvisional };
        const n = nombreDeCanal(id);
        return n ? { id, nombre: n, provisional: true } : null;
    }
    const c = chatDeFuente(cat, fuente);
    if (c) return { id: c.id, nombre: c.nombre, provisional: c.nombreProvisional };
    if (fuente === "direccion") return { id: ID_DIRECCION, nombre: etiquetaProvisional("direccion"), provisional: true };
    return null;
}

/** Los alias fijos de una fuente (la Mac los acepta como nombre mientras no tenga `canon.json`). */
export function aliasFijos(f: FuenteEspejo): readonly string[] {
    return ALIAS_DE_FUENTE[f] ?? [];
}

// ── copia local y cliente ────────────────────────────────────────────────────────────────────

function almacenNavegador(): AlmacenLocal | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** La copia del catálogo guardada en el aparato (o null). Síncrona, nunca lanza. */
export function leerCopiaCanon(almacen: AlmacenLocal | null = almacenNavegador()): { catalogo: CatalogoCanon; en: number } | null {
    try {
        const crudo = almacen?.getItem(CLAVE_CANON_LOCAL);
        if (!crudo) return null;
        const o = JSON.parse(crudo) as { catalogo?: unknown; en?: unknown };
        const catalogo = catalogoValido(o?.catalogo);
        if (!catalogo) return null;
        return { catalogo, en: typeof o.en === "number" ? o.en : 0 };
    } catch {
        return null;
    }
}

function guardarCopia(almacen: AlmacenLocal | null, catalogo: CatalogoCanon | null, ahora: number): void {
    try {
        if (!almacen) return;
        if (catalogo) almacen.setItem(CLAVE_CANON_LOCAL, JSON.stringify({ catalogo, en: ahora }));
        else if ("removeItem" in almacen && typeof (almacen as { removeItem?: unknown }).removeItem === "function") {
            (almacen as unknown as { removeItem(k: string): void }).removeItem(CLAVE_CANON_LOCAL);
        } else almacen.setItem(CLAVE_CANON_LOCAL, "");
    } catch {
        /* almacén lleno o bloqueado: la copia es solo comodidad */
    }
}

export type RespuestaCanon =
    | { ok: true; catalogo: CatalogoCanon | null }
    | { ok: false; estado: number; error: string; copia: CatalogoCanon | null };

export interface OpcionesClienteCanon {
    puerta?: PuertaA1;
    fetch?: FetchLike;
    almacen?: AlmacenLocal | null;
    /** Pruebas: URL base, sesión y reloj (por defecto, los mismos que el cliente de chats). */
    url?: () => Promise<string | null>;
    sesion?: () => Promise<string | null>;
    ahora?: () => number;
}

export const TIEMPO_CANON_MS = 10_000;

/**
 * Lee el catálogo de la puerta (GET con la sesión, sin cola). Bien leído, se guarda en el aparato;
 * si la puerta dice que no hay catálogo, la copia se borra (se verán los nombres provisionales).
 * Si falla, devuelve la copia que hubiera (`copia`) para seguir pintando nombres.
 */
export function crearClienteCanon(op: OpcionesClienteCanon = {}): { leer(senal?: AbortSignal): Promise<RespuestaCanon> } {
    const almacen = op.almacen !== undefined ? op.almacen : almacenNavegador();
    const ahora = op.ahora ?? (() => Date.now());
    const directa = crearPuertaDirecta({ puerta: op.puerta, fetch: op.fetch, url: op.url, sesion: op.sesion, ahora });

    async function leer(senal?: AbortSignal): Promise<RespuestaCanon> {
        const copia = () => leerCopiaCanon(almacen)?.catalogo ?? null;
        if (senal?.aborted) return { ok: false, estado: 0, error: "abortado", copia: copia() };
        const d = await directa.destino();
        if ("error" in d) return { ok: false, estado: d.estado, error: d.error, copia: copia() };
        const r = await directa.pedir(
            `${d.base}${RUTA_CANON}`,
            { method: "GET", headers: { accept: "application/json", authorization: `Bearer ${d.jwt}` } },
            TIEMPO_CANON_MS,
            senal,
        );
        if ("motivo" in r) {
            const error = r.motivo === "abortado" ? "abortado" : r.motivo === "tiempo" ? "La puerta de datos del A1 no contestó a tiempo" : "La puerta de datos del A1 no responde";
            return { ok: false, estado: 0, error, copia: copia() };
        }
        if (r.estado >= 200 && r.estado < 300) {
            const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
            if (c.catalogo === null || c.catalogo === undefined) {
                guardarCopia(almacen, null, ahora());
                return { ok: true, catalogo: null };
            }
            const catalogo = catalogoValido(c.catalogo);
            if (!catalogo) return { ok: false, estado: r.estado, error: "El catálogo de chats que llegó no es válido", copia: copia() };
            guardarCopia(almacen, catalogo, ahora());
            return { ok: true, catalogo };
        }
        // GEN1114INT · con la puerta del A1 todavía en la versión anterior, esta ruta no existe (404): es lo
        // mismo que «no hay catálogo» (se ven los nombres provisionales), no un fallo que haya que contar.
        if (r.estado === 404) return { ok: true, catalogo: copia() };
        return { ok: false, estado: r.estado, error: directa.textoError(r.cuerpo, r.estado).error, copia: copia() };
    }

    return { leer };
}
