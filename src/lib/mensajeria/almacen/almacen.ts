/**
 * Almacén local de los mensajes de la malla (MSJ1108C · F1 de `architecture/red-sin-dependencias.md`).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Un registro por mensaje, con clave = id del mensaje (el mismo en los dos extremos), en IndexedDB
 * (App nativa y navegador). Sustituye a la bandeja única en localStorage (`starseed.mensajeria.malla.v1`):
 * allí cabían ~5 MB y se reescribía entera en cada mensaje; aquí se guarda solo lo que cambia y no hay
 * tope de historial. La interfaz `AlmacenMensajes` tiene dos implementaciones: IndexedDB y memoria
 * (pruebas y navegadores sin IndexedDB).
 */

import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";

export interface RegistroMensaje {
    /** Clave primaria: id del mensaje. */
    id: string;
    /** Conversación (`dm:<hilo>`, `n:<neurona>`, `c:<cuenta>`). */
    clave: string;
    /** Reloj lógico híbrido con el que se ordena entre aparatos. */
    hlc: string;
    /** Epoch ms de llegada o de envío en este aparato. */
    at: number;
    autor: { uid?: string; neurona?: string };
    dir: "sale" | "entra";
    /** El mensaje completo (vía, estado, recibos, adjuntos, cita, formato, ediciones). */
    m: MensajeMalla;
    /** Epoch ms en que el servidor de la cuenta tuvo la copia (subida idempotente hecha). */
    subido?: number;
    /** Lápida: quitado de este aparato por la persona. No vuelve aunque la copia vieja reaparezca. */
    lapida?: boolean;
}

export interface AlmacenMensajes {
    todos(): Promise<RegistroMensaje[]>;
    obtener(id: string): Promise<RegistroMensaje | undefined>;
    poner(registros: RegistroMensaje[]): Promise<void>;
    meta<T = unknown>(clave: string): Promise<T | undefined>;
    ponerMeta(clave: string, valor: unknown): Promise<void>;
}

/** Quién escribió el mensaje, para el índice del registro. */
export function autorDe(m: MensajeMalla, miUid: string | null, miNeurona: string): RegistroMensaje["autor"] {
    if (m.dir === "sale") return { uid: miUid ?? undefined, neurona: miNeurona || undefined };
    return { uid: m.deUid, neurona: m.deNeurona };
}

export function registroDe(m: MensajeMalla, hlc: string, autor: RegistroMensaje["autor"], previo?: RegistroMensaje): RegistroMensaje {
    return {
        id: m.id,
        clave: m.clave,
        hlc: previo?.hlc ?? m.hlc ?? hlc,
        at: m.at,
        autor: previo?.autor ?? autor,
        dir: m.dir,
        m,
        ...(previo?.subido ? { subido: previo.subido } : {}),
        ...(previo?.lapida ? { lapida: true } : {}),
    };
}

/* ═══════════════════════════ Memoria ═══════════════════════════ */

export function crearAlmacenMemoria(): AlmacenMensajes {
    const regs = new Map<string, RegistroMensaje>();
    const metas = new Map<string, unknown>();
    return {
        async todos() {
            return Array.from(regs.values()).map((r) => structuredCloneSeguro(r));
        },
        async obtener(id) {
            const r = regs.get(id);
            return r ? structuredCloneSeguro(r) : undefined;
        },
        async poner(registros) {
            for (const r of registros) regs.set(r.id, structuredCloneSeguro(r));
        },
        async meta<T>(clave: string) {
            return metas.get(clave) as T | undefined;
        },
        async ponerMeta(clave, valor) {
            metas.set(clave, valor);
        },
    };
}

function structuredCloneSeguro<T>(x: T): T {
    try {
        return JSON.parse(JSON.stringify(x)) as T;
    } catch {
        return x;
    }
}

/* ═══════════════════════════ IndexedDB ═══════════════════════════ */

export const NOMBRE_BD = "starseed-mensajeria-malla";
const VERSION_BD = 1;
const TIENDA_MENSAJES = "mensajes";
const TIENDA_META = "meta";

function pedir<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((ok, mal) => {
        req.onsuccess = () => ok(req.result);
        req.onerror = () => mal(req.error);
    });
}

function terminar(tx: IDBTransaction): Promise<void> {
    return new Promise((ok, mal) => {
        tx.oncomplete = () => ok();
        tx.onerror = () => mal(tx.error);
        tx.onabort = () => mal(tx.error);
    });
}

/** Abre (o crea) la base. Lanza si no hay IndexedDB: el llamador cae a localStorage. */
export function abrirAlmacenIdb(fabrica?: IDBFactory): Promise<AlmacenMensajes> {
    const idb = fabrica ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!idb) return Promise.reject(new Error("sin IndexedDB"));
    return new Promise((ok, mal) => {
        const abrir = idb.open(NOMBRE_BD, VERSION_BD);
        abrir.onupgradeneeded = () => {
            const bd = abrir.result;
            if (!bd.objectStoreNames.contains(TIENDA_MENSAJES)) {
                const t = bd.createObjectStore(TIENDA_MENSAJES, { keyPath: "id" });
                t.createIndex("clave", "clave", { unique: false });
            }
            if (!bd.objectStoreNames.contains(TIENDA_META)) bd.createObjectStore(TIENDA_META, { keyPath: "k" });
        };
        abrir.onerror = () => mal(abrir.error);
        abrir.onblocked = () => mal(new Error("base bloqueada"));
        abrir.onsuccess = () => {
            const bd = abrir.result;
            ok({
                async todos() {
                    const tx = bd.transaction(TIENDA_MENSAJES, "readonly");
                    return (await pedir(tx.objectStore(TIENDA_MENSAJES).getAll())) as RegistroMensaje[];
                },
                async obtener(id) {
                    const tx = bd.transaction(TIENDA_MENSAJES, "readonly");
                    return (await pedir(tx.objectStore(TIENDA_MENSAJES).get(id))) as RegistroMensaje | undefined;
                },
                async poner(registros) {
                    if (!registros.length) return;
                    const tx = bd.transaction(TIENDA_MENSAJES, "readwrite");
                    const t = tx.objectStore(TIENDA_MENSAJES);
                    for (const r of registros) t.put(r);
                    await terminar(tx);
                },
                async meta<T>(clave: string) {
                    const tx = bd.transaction(TIENDA_META, "readonly");
                    const fila = (await pedir(tx.objectStore(TIENDA_META).get(clave))) as { k: string; v: T } | undefined;
                    return fila?.v;
                },
                async ponerMeta(clave, valor) {
                    const tx = bd.transaction(TIENDA_META, "readwrite");
                    tx.objectStore(TIENDA_META).put({ k: clave, v: valor });
                    await terminar(tx);
                },
            });
        };
    });
}
