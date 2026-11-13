/**
 * Chats de Genesis · la clave de este aparato y la firma de cada entrada (contrato GEN1114 §3.2,
 * §3.3, §3.4, §3.6 y §8.4).
 *
 * Sin `node:*`. IndexedDB y WebCrypto se pueden inyectar (`configurarFirmaAparato`) para las pruebas.
 *
 * Lo que hace y lo que no:
 *  · La clave privada es ECDSA P-256 creada con `extractable: false` y se guarda COMO OBJETO
 *    `CryptoKey` en IndexedDB (`starseed-genesis-firma`, almacén `aparato`). No se puede exportar
 *    ni leer: solo se le puede pedir que firme.
 *  · Que no se pueda exportar NO impide que cualquier código que corra en esta página le pida
 *    firmas (§3.11.1). Por eso esta biblioteca solo firma lo que `enviar` le pasa con el nombre del
 *    chat que la persona tiene delante, y el aparato es de nivel «texto» mientras la Mac no diga otra
 *    cosa: desde un aparato «texto», `enviar` no firma nada `alto` (§3.6).
 *  · El contador `seq` se reserva en una transacción readwrite de IndexedDB que se CIERRA antes de
 *    firmar (crypto.subtle.sign es asíncrono y cerraría la transacción). IndexedDB ordena las
 *    transacciones readwrite sobre el mismo almacén: dos pestañas nunca reciben el mismo número.
 *  · Una clave perdida (datos del sitio borrados, IndexedDB vaciado) NUNCA se sustituye sola: se
 *    detecta con la marca de `localStorage` y se dice («empareja de nuevo»); una clave nueva siempre
 *    empieza «sin emparejar».
 */

import {
    AUD_FIRMA,
    LIMITE_ALTO_S,
    LIMITE_BAJO_S,
    MAX_CARGA_BYTES,
    MAX_NOMBRE_CHAT,
    RE_HUELLA,
    RE_ID_CHAT,
    RE_NONCE,
    destinoDeFuente,
    type CargaFirmada,
    type EntradaChat,
    type EntradaFirmada,
    type FuenteEntrada,
} from "./tipos";

// ── tipos públicos (§8.4) ────────────────────────────────────────────────────────────────────

export interface AparatoLocal {
    huella: string;
    codigo: string;
    cuenta: string;
    nombre: string;
    creado: string;
    seq: number;
    nivel: "texto" | "completo";
    estado: "sin-emparejar" | "pendiente" | "emparejado" | "revocado";
    solicitud?: number;
    desde?: string;
    vistoPorUltima?: string;
}

/** Error con un `codigo` estable para la interfaz. */
export class ErrorFirma extends Error {
    constructor(public readonly codigo: string, mensaje: string) {
        super(mensaje);
        this.name = "ErrorFirma";
    }
}

export const BD_FIRMA = "starseed-genesis-firma";
export const ALMACEN_FIRMA = "aparato";
const CLAVE_REGISTRO = "clave";
const CLAVE_SEQ = "seq";
/** Marca en `localStorage`: deja saber que HUBO una clave aunque IndexedDB se vacíe (§3.9). */
export const CLAVE_MARCA_APARATO = "starseed.chats-genesis.aparato.v1";
export const MAX_NOMBRE_APARATO = 60;
const PREFIJO_CODIGO = "starseed.genesis.emparejar.v1\n";

// ── entorno inyectable ───────────────────────────────────────────────────────────────────────

export interface AlmacenMarca {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem?(k: string): void;
}

export interface EntornoFirma {
    indexedDB: IDBFactory | null;
    subtle: SubtleCrypto | null;
    marca: AlmacenMarca | null;
    ahora: () => number;
    /** `false` si la página no está en un contexto seguro (https o localhost). */
    seguro: boolean;
}

let inyectado: Partial<EntornoFirma> = {};

/** Pruebas (o una app nativa con otro almacén): cambia lo que se use a partir de ahora. */
export function configurarFirmaAparato(e: Partial<EntornoFirma>): void {
    inyectado = { ...inyectado, ...e };
}

/** Vuelve al entorno del navegador. */
export function _reiniciarFirmaAparato(): void {
    inyectado = {};
}

function entorno(): EntornoFirma {
    const g = globalThis as unknown as {
        indexedDB?: IDBFactory;
        crypto?: { subtle?: SubtleCrypto };
        isSecureContext?: boolean;
        localStorage?: AlmacenMarca;
    };
    let marca: AlmacenMarca | null = null;
    if ("marca" in inyectado) marca = inyectado.marca ?? null;
    else {
        try {
            marca = typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
        } catch {
            marca = null;
        }
    }
    return {
        indexedDB: "indexedDB" in inyectado ? inyectado.indexedDB ?? null : g.indexedDB ?? null,
        subtle: "subtle" in inyectado ? inyectado.subtle ?? null : g.crypto?.subtle ?? null,
        marca,
        ahora: inyectado.ahora ?? (() => Date.now()),
        seguro: inyectado.seguro ?? g.isSecureContext !== false,
    };
}

// ── base64url, hex y base32 ──────────────────────────────────────────────────────────────────

export function b64url(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(s: string): Uint8Array<ArrayBuffer> {
    const limpio = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(limpio + "=".repeat((4 - (limpio.length % 4)) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function hex(bytes: Uint8Array): string {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALFABETO_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 RFC 4648 sin relleno. */
export function base32(bytes: Uint8Array): string {
    let bits = 0;
    let valor = 0;
    let out = "";
    for (const b of bytes) {
        valor = (valor << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += ALFABETO_B32[(valor >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALFABETO_B32[(valor << (5 - bits)) & 31];
    return out;
}

// ── funciones puras de §3.3, §3.6 y §3.4 ─────────────────────────────────────────────────────

/**
 * Código visible de emparejar (§3.3): `base32(sha256("starseed.genesis.emparejar.v1\n" + huella +
 * "\n" + cuenta)[:8])[:12]`, agrupado 4-4-4. Ata la clave Y la cuenta. Igual que `codigo_de` de Python.
 */
export async function codigoDe(huellaHex: string, cuenta: string): Promise<string> {
    const subtle = entorno().subtle;
    if (!subtle) throw new ErrorFirma("sin-webcrypto", "Este navegador no tiene WebCrypto");
    const texto = `${PREFIJO_CODIGO}${String(huellaHex).toLowerCase()}\n${String(cuenta).trim().toLowerCase()}`;
    const d = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(texto)));
    const c = base32(d.slice(0, 8)).slice(0, 12);
    return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

/** Órdenes del puente A que solo leen (no despiertan a nadie). */
const LECTURA_A = new Set<string>(["estado", "olas", "cola", "puertas", "agentes", "ayuda"]);
/** Órdenes del puente B que solo leen. */
const LECTURA_B = new Set<string>(["estado", "ayuda"]);

/**
 * Riesgo de una entrada (§3.6), la misma tabla que `riesgo_de_entrada` de Python y `riesgoDeEntrada`
 * de la puerta. `bajo` = no despierta a ningún agente; todo lo demás (también lo desconocido), `alto`.
 */
export function riesgoDeEntrada(e: Omit<EntradaChat, "v" | "nonce" | "t">): "bajo" | "alto" {
    if (!e || typeof e !== "object") return "alto";
    const fuente = (e as { fuente?: unknown }).fuente;
    const accion = (e as { accion?: unknown }).accion;
    if (fuente === "direccion") {
        if (accion === "revocarme" || accion === "revocar-aparato") return "bajo";
        if (accion !== "decir") return "alto";
        if (e.modelo !== undefined && e.modelo !== null && e.modelo !== "") return "alto";
        const canales = e.canales as unknown;
        if (canales === undefined || canales === null) return "bajo";
        if (!Array.isArray(canales)) return "alto";
        return canales.every((c) => c === "mando") ? "bajo" : "alto";
    }
    if (fuente === "puente:hermes-avisos" || fuente === "puente:peticiones") {
        if (accion !== "orden") return "alto"; // texto suelto: va a un agente
        const nombre = e.orden && typeof e.orden === "object" ? (e.orden as { nombre?: unknown }).nombre : undefined;
        if (typeof nombre !== "string") return "alto";
        return (fuente === "puente:hermes-avisos" ? LECTURA_A : LECTURA_B).has(nombre) ? "bajo" : "alto";
    }
    return "alto";
}

/** `sub` del JWT propio, decodificado SIN verificar (es la sesión de esta misma página). */
export function cuentaDeSesion(jwt: string): string | null {
    try {
        if (typeof jwt !== "string") return null;
        const partes = jwt.split(".");
        if (partes.length < 2) return null;
        const json = new TextDecoder().decode(deB64url(partes[1]));
        const o = JSON.parse(json) as { sub?: unknown };
        return typeof o?.sub === "string" && o.sub.trim() ? o.sub.trim() : null;
    } catch {
        return null;
    }
}

/** ¿Debe la interfaz ofrecer esta entrada desde este aparato? (La Mac decide de verdad.) */
export function puedeOfrecer(a: AparatoLocal | null, e: Omit<EntradaChat, "v" | "nonce" | "t">): boolean {
    if (!a || a.estado !== "emparejado") return false;
    return riesgoDeEntrada(e) === "bajo" || a.nivel === "completo";
}

// ── IndexedDB ────────────────────────────────────────────────────────────────────────────────

interface RegistroClave {
    privada: CryptoKey;
    huella: string;
    spki: string;
    codigo: string;
    cuenta: string;
    nombre: string;
    creado: string;
    nivel: "texto" | "completo";
    estado: AparatoLocal["estado"];
    solicitud?: number;
    desde?: string;
}

function abrirBD(idb: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolver, rechazar) => {
        let req: IDBOpenDBRequest;
        try {
            req = idb.open(BD_FIRMA, 1);
        } catch (e) {
            rechazar(e);
            return;
        }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(ALMACEN_FIRMA)) db.createObjectStore(ALMACEN_FIRMA);
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => db.close();
            resolver(db);
        };
        req.onerror = () => rechazar(req.error ?? new Error("IndexedDB no abre"));
        req.onblocked = () => rechazar(new Error("IndexedDB bloqueado por otra pestaña"));
    });
}

/**
 * Una transacción entera: `trabajo` pide lo que necesite y llama a `fin(valor)`; la promesa se
 * resuelve SOLO cuando la transacción se ha confirmado (`oncomplete`), nunca antes.
 */
async function enTransaccion<T>(modo: IDBTransactionMode, trabajo: (st: IDBObjectStore, fin: (v: T) => void, abortar: (e: Error) => void) => void): Promise<T> {
    const idb = entorno().indexedDB;
    if (!idb) throw new ErrorFirma("sin-indexeddb", "Este navegador no puede guardar una clave propia");
    const db = await abrirBD(idb);
    return new Promise<T>((resolver, rechazar) => {
        let valor: T | undefined;
        let error: Error | null = null;
        let tx: IDBTransaction;
        try {
            tx = db.transaction(ALMACEN_FIRMA, modo);
        } catch (e) {
            db.close();
            rechazar(e);
            return;
        }
        tx.oncomplete = () => {
            db.close();
            if (error) rechazar(error);
            else resolver(valor as T);
        };
        tx.onerror = () => {
            db.close();
            rechazar(error ?? tx.error ?? new Error("Fallo de IndexedDB"));
        };
        tx.onabort = () => {
            db.close();
            rechazar(error ?? tx.error ?? new Error("Transacción abortada"));
        };
        try {
            trabajo(
                tx.objectStore(ALMACEN_FIRMA),
                (v) => {
                    valor = v;
                },
                (e) => {
                    error = e;
                    try {
                        tx.abort();
                    } catch {
                        /* ya terminada */
                    }
                },
            );
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            try {
                tx.abort();
            } catch {
                /* ya terminada */
            }
        }
    });
}

function esClavePrivada(x: unknown): x is CryptoKey {
    const k = x as { type?: unknown; algorithm?: { name?: unknown }; usages?: unknown } | null;
    return !!k && typeof k === "object" && k.type === "private" && k.algorithm?.name === "ECDSA" && Array.isArray(k.usages) && k.usages.includes("sign");
}

function registroValido(x: unknown): RegistroClave | null {
    const r = x as Partial<RegistroClave> | null;
    if (!r || typeof r !== "object") return null;
    if (!esClavePrivada(r.privada) || typeof r.huella !== "string" || !RE_HUELLA.test(r.huella)) return null;
    if (typeof r.cuenta !== "string" || typeof r.codigo !== "string" || typeof r.spki !== "string") return null;
    return r as RegistroClave;
}

async function leerTodo(): Promise<{ registro: unknown; seq: number }> {
    return enTransaccion<{ registro: unknown; seq: number }>("readonly", (st, fin) => {
        const r1 = st.get(CLAVE_REGISTRO);
        r1.onsuccess = () => {
            const r2 = st.get(CLAVE_SEQ);
            r2.onsuccess = () => fin({ registro: r1.result, seq: typeof r2.result === "number" ? r2.result : 0 });
        };
    });
}

/**
 * Reserva el siguiente `seq` de ESTE aparato en una transacción readwrite (lee y escribe dentro de
 * la misma) y devuelve el número solo cuando la transacción se ha confirmado. Si la clave cambió
 * entretanto (otra pestaña la olvidó o creó otra), no reserva nada.
 */
async function reservarSeq(huella: string): Promise<number> {
    return enTransaccion<number>("readwrite", (st, fin, abortar) => {
        const r1 = st.get(CLAVE_REGISTRO);
        r1.onsuccess = () => {
            const reg = registroValido(r1.result);
            if (!reg || reg.huella !== huella) {
                abortar(new ErrorFirma("clave-perdida", "La clave de este aparato ya no está"));
                return;
            }
            const r2 = st.get(CLAVE_SEQ);
            r2.onsuccess = () => {
                const previo = typeof r2.result === "number" && Number.isSafeInteger(r2.result) && r2.result >= 0 ? r2.result : 0;
                const n = previo + 1;
                st.put(n, CLAVE_SEQ);
                fin(n);
            };
        };
    });
}

// ── marca en localStorage ────────────────────────────────────────────────────────────────────

interface Marca {
    huella: string;
    nombre: string;
    cuenta: string;
    creado: string;
    estado: AparatoLocal["estado"];
    vistoPorUltima: string | null;
}

function leerMarca(): Marca | null {
    try {
        const crudo = entorno().marca?.getItem(CLAVE_MARCA_APARATO);
        if (!crudo) return null;
        const m = JSON.parse(crudo) as Partial<Marca>;
        if (!m || typeof m.huella !== "string" || !RE_HUELLA.test(m.huella)) return null;
        return {
            huella: m.huella,
            nombre: typeof m.nombre === "string" ? m.nombre : "",
            cuenta: typeof m.cuenta === "string" ? m.cuenta : "",
            creado: typeof m.creado === "string" ? m.creado : "",
            estado: m.estado === "pendiente" || m.estado === "emparejado" || m.estado === "revocado" ? m.estado : "sin-emparejar",
            vistoPorUltima: typeof m.vistoPorUltima === "string" ? m.vistoPorUltima : null,
        };
    } catch {
        return null;
    }
}

function escribirMarca(r: RegistroClave): void {
    try {
        const m: Marca = { huella: r.huella, nombre: r.nombre, cuenta: r.cuenta, creado: r.creado, estado: r.estado, vistoPorUltima: new Date(entorno().ahora()).toISOString() };
        entorno().marca?.setItem(CLAVE_MARCA_APARATO, JSON.stringify(m));
    } catch {
        /* almacén lleno o bloqueado: la marca es solo para avisar */
    }
}

function borrarMarca(): void {
    try {
        const m = entorno().marca;
        if (m?.removeItem) m.removeItem(CLAVE_MARCA_APARATO);
        else m?.setItem(CLAVE_MARCA_APARATO, "");
    } catch {
        /* nada */
    }
}

function aLocal(r: RegistroClave, seq: number, visto?: string | null): AparatoLocal {
    const a: AparatoLocal = {
        huella: r.huella,
        codigo: r.codigo,
        cuenta: r.cuenta,
        nombre: r.nombre,
        creado: r.creado,
        seq,
        nivel: r.nivel === "completo" ? "completo" : "texto",
        estado: r.estado,
    };
    if (typeof r.solicitud === "number") a.solicitud = r.solicitud;
    if (typeof r.desde === "string") a.desde = r.desde;
    if (visto) a.vistoPorUltima = visto;
    return a;
}

// ── API pública (§8.4) ───────────────────────────────────────────────────────────────────────

/** ¿Puede este navegador guardar una clave propia? (Ventana privada de algunos navegadores: no.) */
export async function soporteFirma(): Promise<{ ok: true } | { ok: false; motivo: "sin-webcrypto" | "sin-indexeddb" | "contexto-inseguro" }> {
    const en = entorno();
    if (!en.seguro) return { ok: false, motivo: "contexto-inseguro" };
    if (!en.subtle || typeof en.subtle.generateKey !== "function" || typeof en.subtle.sign !== "function") return { ok: false, motivo: "sin-webcrypto" };
    if (!en.indexedDB) return { ok: false, motivo: "sin-indexeddb" };
    try {
        const db = await abrirBD(en.indexedDB);
        db.close();
        return { ok: true };
    } catch {
        return { ok: false, motivo: "sin-indexeddb" };
    }
}

/** El aparato guardado, o null si no hay clave (o se perdió: ver `claveAparatoPerdida`). Nunca lanza. */
export async function aparatoLocal(): Promise<AparatoLocal | null> {
    try {
        const { registro, seq } = await leerTodo();
        const r = registroValido(registro);
        if (!r) return null;
        escribirMarca(r);
        return aLocal(r, seq, leerMarca()?.vistoPorUltima ?? null);
    } catch {
        return null;
    }
}

/**
 * Si este aparato TUVO una clave y ya no está (datos del sitio borrados, IndexedDB vaciado o roto):
 * la huella, el nombre y la última vez que se vio. La interfaz dice «La clave de este aparato ya no
 * está (… el <vistoPorUltima>). Empareja de nuevo». Null si la clave sigue o si nunca hubo.
 */
export async function claveAparatoPerdida(): Promise<{ huella: string; nombre: string; estado: AparatoLocal["estado"]; vistoPorUltima: string | null } | null> {
    const m = leerMarca();
    if (!m) return null;
    try {
        const { registro } = await leerTodo();
        const r = registroValido(registro);
        if (r && r.huella === m.huella) return null;
        if (r) {
            escribirMarca(r); // marca vieja de otra clave: se pone al día
            return null;
        }
    } catch {
        /* sin IndexedDB: la clave tampoco se puede usar */
    }
    return { huella: m.huella, nombre: m.nombre, estado: m.estado, vistoPorUltima: m.vistoPorUltima };
}

/**
 * Crea la clave de este aparato (ECDSA P-256, `extractable: false`) y la guarda. Siempre empieza
 * «sin emparejar» y de nivel «texto». Si ya hay una clave EMPAREJADA, se niega (primero hay que
 * olvidarla): una clave nueva nunca ocupa en silencio el sitio de una emparejada.
 */
export async function crearClaveAparato(nombre: string, cuenta: string): Promise<{ aparato: AparatoLocal; spki: string }> {
    const soporte = await soporteFirma();
    if (!soporte.ok) throw new ErrorFirma(soporte.motivo, "Este navegador no puede guardar una clave propia (¿ventana privada?)");
    const n = [...String(nombre ?? "").replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, "").trim()].slice(0, MAX_NOMBRE_APARATO).join("").trim();
    if (!n) throw new ErrorFirma("nombre", "Pon un nombre a este aparato (como mucho 60 caracteres)");
    const c = typeof cuenta === "string" ? cuenta.trim() : "";
    if (!c || c.length > 100) throw new ErrorFirma("sin-cuenta", "Inicia sesión antes de emparejar este aparato");

    const previo = await leerTodo().then((x) => registroValido(x.registro)).catch(() => null);
    if (previo && previo.estado === "emparejado") {
        throw new ErrorFirma("ya-emparejado", "Este aparato ya está emparejado: olvídalo antes de crear otra clave");
    }

    const subtle = entorno().subtle!;
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])) as CryptoKeyPair;
    if (par.privateKey.extractable) throw new ErrorFirma("exportable", "La clave salió exportable: no se guarda");
    const spkiDer = new Uint8Array(await subtle.exportKey("spki", par.publicKey));
    const huella = hex(new Uint8Array(await subtle.digest("SHA-256", spkiDer)));
    const registro: RegistroClave = {
        privada: par.privateKey,
        huella,
        spki: b64url(spkiDer),
        codigo: await codigoDe(huella, c),
        cuenta: c,
        nombre: n,
        creado: new Date(entorno().ahora()).toISOString(),
        nivel: "texto",
        estado: "sin-emparejar",
    };
    await enTransaccion<void>("readwrite", (st, fin) => {
        st.put(registro, CLAVE_REGISTRO);
        st.put(0, CLAVE_SEQ);
        fin(undefined);
    });
    escribirMarca(registro);
    try {
        const nav = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean> } } }).navigator;
        void nav?.storage?.persist?.().catch(() => false);
    } catch {
        /* pedir persistencia es solo un deseo */
    }
    return { aparato: aLocal(registro, 0, null), spki: registro.spki };
}

/**
 * Cambia el estado guardado de la clave con lo que dijo la puerta (informativo: quien decide de
 * verdad es la Mac). No cambia la clave ni el contador. Devuelve el aparato, o null si no hay clave.
 */
export async function actualizarEstadoAparato(c: Partial<Pick<AparatoLocal, "estado" | "nivel" | "solicitud" | "desde">>, huella?: string): Promise<AparatoLocal | null> {
    const hecho = await enTransaccion<{ r: RegistroClave; seq: number } | null>("readwrite", (st, fin) => {
        const r1 = st.get(CLAVE_REGISTRO);
        r1.onsuccess = () => {
            const reg = registroValido(r1.result);
            if (!reg || (huella && reg.huella !== huella)) {
                fin(null);
                return;
            }
            const nuevo: RegistroClave = { ...reg };
            if (c.estado) nuevo.estado = c.estado;
            if (c.nivel) nuevo.nivel = c.nivel === "completo" ? "completo" : "texto";
            if (c.estado && c.estado !== "emparejado") nuevo.nivel = "texto";
            if (c.solicitud !== undefined) nuevo.solicitud = c.solicitud;
            if (c.desde !== undefined) nuevo.desde = c.desde;
            st.put(nuevo, CLAVE_REGISTRO);
            const r2 = st.get(CLAVE_SEQ);
            r2.onsuccess = () => fin({ r: nuevo, seq: typeof r2.result === "number" ? r2.result : 0 });
        };
    }).catch(() => null);
    if (!hecho) return null;
    escribirMarca(hecho.r);
    return aLocal(hecho.r, hecho.seq, null);
}

/**
 * Firma una entrada (§3.4). Construye la carga UNA vez, la serializa con `JSON.stringify` y firma
 * esos bytes; devuelve los mismos bytes en base64url. No mira el estado de emparejado ni el nivel
 * (eso lo hace `enviar`): sí exige que la clave sea de la misma cuenta y que el destino cuadre.
 */
export async function firmarEntrada(
    e: EntradaChat,
    ctx: { cuenta: string; destino: "mac" | "a1"; chat: string; chatNombre: string; ahora: number },
): Promise<EntradaFirmada> {
    const subtle = entorno().subtle;
    if (!subtle) throw new ErrorFirma("sin-webcrypto", "Este navegador no tiene WebCrypto");
    if (!e || typeof e !== "object" || e.v !== 1 || typeof e.nonce !== "string" || !RE_NONCE.test(e.nonce)) {
        throw new ErrorFirma("forma", "La entrada no tiene la forma de GEN1113 (v:1 y nonce)");
    }
    if (!ctx || typeof ctx.chat !== "string" || !RE_ID_CHAT.test(ctx.chat)) throw new ErrorFirma("sin-chat", "Falta el id del chat");
    const largoNombre = typeof ctx.chatNombre === "string" ? [...ctx.chatNombre].length : 0;
    if (largoNombre < 1 || largoNombre > MAX_NOMBRE_CHAT || !ctx.chatNombre.trim()) throw new ErrorFirma("sin-chat", "Falta el nombre del chat que se ve");
    if (ctx.destino !== destinoDeFuente(e.fuente as FuenteEntrada)) throw new ErrorFirma("destino", "El destino no corresponde a la fuente");
    if (!Number.isFinite(ctx.ahora)) throw new ErrorFirma("forma", "Hora no válida");

    const { registro } = await leerTodo();
    const reg = registroValido(registro);
    if (!reg) throw new ErrorFirma(leerMarca() ? "clave-perdida" : "sin-aparato", leerMarca() ? "La clave de este aparato ya no está: empareja de nuevo" : "Este aparato no tiene clave");
    if (typeof ctx.cuenta !== "string" || ctx.cuenta.trim().toLowerCase() !== reg.cuenta.trim().toLowerCase()) {
        throw new ErrorFirma("otra-cuenta", "Este aparato se emparejó con otra cuenta");
    }

    // 1) Reservar el contador: la transacción se confirma y se cierra AQUÍ, antes de firmar.
    const seq = await reservarSeq(reg.huella);
    // 2) La carga, una sola vez.
    const plazo = riesgoDeEntrada(e) === "alto" ? LIMITE_ALTO_S : LIMITE_BAJO_S;
    const carga: CargaFirmada = {
        aud: AUD_FIRMA,
        cuenta: reg.cuenta,
        aparato: reg.huella,
        seq,
        t: new Date(ctx.ahora).toISOString(),
        caduca: new Date(ctx.ahora + plazo * 1000).toISOString(),
        destino: ctx.destino,
        chat: ctx.chat,
        chatNombre: ctx.chatNombre,
        entrada: e,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    if (bytes.length > MAX_CARGA_BYTES) throw new ErrorFirma("grande", "El mensaje firmado pasa de 32 KB");
    // 3) Firmar esos mismos bytes.
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, reg.privada, bytes));
    if (firma.length !== 64) throw new ErrorFirma("firma", "La firma no salió con la forma r‖s");
    escribirMarca(reg);
    return { v: 2, carga: b64url(bytes), firma: b64url(firma), aparato: reg.huella };
}

/** La clave pública (SPKI DER en base64url) de la clave guardada, o null. Siempre se puede leer. */
export async function spkiDelAparato(): Promise<string | null> {
    try {
        const r = registroValido((await leerTodo()).registro);
        return r ? r.spki : null;
    } catch {
        return null;
    }
}

/** Borra la clave de este aparato y su marca. (Para retirarlo en la Mac, antes se envía `revocarme`.) */
export async function olvidarAparato(): Promise<void> {
    try {
        await enTransaccion<void>("readwrite", (st, fin) => {
            st.delete(CLAVE_REGISTRO);
            st.delete(CLAVE_SEQ);
            fin(undefined);
        });
    } finally {
        borrarMarca();
    }
}
