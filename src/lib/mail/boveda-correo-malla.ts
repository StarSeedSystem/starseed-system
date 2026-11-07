/**
 * Bóveda de la bandeja de correos por la malla (GRP1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Los correos guardados para reenviar (y los recibidos o de relevo) se guardan CIFRADOS en este
 * aparato: AES-GCM de 256 bits con una clave NO EXTRAÍBLE que vive en IndexedDB (el navegador la
 * usa, pero ni esta página ni nadie puede leer sus bytes). Cada correo lleva su propio IV aleatorio.
 * Sin IndexedDB o sin WebCrypto (pestaña privada estricta, navegador viejo) no se finge: la bandeja
 * vive solo en la memoria de esta pestaña y `cifrado` lo dice (`false`) para enseñarlo.
 * Sin `node:*`: lo importa el cliente.
 */

import type { CorreoMalla } from "./correo-malla";

export interface AlmacenCorreoMalla {
    /** true si lo guardado queda cifrado en disco; false si solo vive en esta pestaña. */
    cifrado(): boolean;
    cargar(): Promise<CorreoMalla[]>;
    guardar(c: CorreoMalla): Promise<boolean>;
    borrar(id: string): Promise<void>;
}

export interface RegistroCifrado {
    id: string;
    iv: Uint8Array<ArrayBuffer>;
    ct: ArrayBuffer;
}

/** Cifra un correo con la clave (AES-GCM, IV de 12 bytes aleatorio). */
export async function cifrarCorreo(clave: CryptoKey, c: CorreoMalla, sutil: SubtleCrypto = crypto.subtle): Promise<RegistroCifrado> {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const datos = new TextEncoder().encode(JSON.stringify(c));
    const ct = await sutil.encrypt({ name: "AES-GCM", iv }, clave, datos);
    return { id: c.id, iv, ct };
}

/** Descifra un registro; null si la clave no es la suya o está dañado. */
export async function descifrarCorreo(clave: CryptoKey, r: RegistroCifrado, sutil: SubtleCrypto = crypto.subtle): Promise<CorreoMalla | null> {
    try {
        const claro = await sutil.decrypt({ name: "AES-GCM", iv: r.iv }, clave, r.ct);
        const c = JSON.parse(new TextDecoder().decode(claro)) as CorreoMalla;
        return c && typeof c === "object" && c.id === r.id ? c : null;
    } catch {
        return null;
    }
}

/** Clave nueva no extraíble. */
export function nuevaClave(sutil: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
    return sutil.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
}

/** Bandeja solo en memoria (sin IndexedDB o en pruebas). */
export function almacenEnMemoria(): AlmacenCorreoMalla {
    const m = new Map<string, CorreoMalla>();
    return {
        cifrado: () => false,
        cargar: async () => Array.from(m.values()),
        guardar: async (c) => {
            m.set(c.id, c);
            return true;
        },
        borrar: async (id) => {
            m.delete(id);
        },
    };
}

const BD = "starseed-correo-malla";
const VERSION = 1;
const CLAVES = "claves";
const CORREOS = "correos";

function pedir<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((ok, mal) => {
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
    });
}

function abrirBd(): Promise<IDBDatabase> {
    return new Promise((ok, mal) => {
        const r = indexedDB.open(BD, VERSION);
        r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains(CLAVES)) db.createObjectStore(CLAVES);
            if (!db.objectStoreNames.contains(CORREOS)) db.createObjectStore(CORREOS, { keyPath: "id" });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
    });
}

/**
 * La bandeja cifrada en IndexedDB. Si no se puede abrir, cae a memoria (y `cifrado()` lo dice).
 * Nunca lanza.
 */
export function almacenCifrado(): AlmacenCorreoMalla {
    const memoria = almacenEnMemoria();
    let listo: Promise<{ db: IDBDatabase; clave: CryptoKey } | null> | null = null;
    let enDisco = false;
    const preparar = () => {
        listo ??= (async () => {
            try {
                if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return null;
                const db = await abrirBd();
                const tx = db.transaction(CLAVES, "readwrite");
                const almacen = tx.objectStore(CLAVES);
                let clave = (await pedir(almacen.get("k1"))) as CryptoKey | undefined;
                if (!clave) {
                    clave = await nuevaClave();
                    const tx2 = db.transaction(CLAVES, "readwrite");
                    await pedir(tx2.objectStore(CLAVES).put(clave, "k1"));
                    // Si otra pestaña la creó a la vez, gana la que quedó guardada.
                    const tx3 = db.transaction(CLAVES, "readonly");
                    clave = ((await pedir(tx3.objectStore(CLAVES).get("k1"))) as CryptoKey | undefined) ?? clave;
                }
                enDisco = true;
                return { db, clave };
            } catch {
                return null;
            }
        })();
        return listo;
    };
    return {
        cifrado: () => enDisco,
        async cargar() {
            const p = await preparar();
            if (!p) return memoria.cargar();
            try {
                const regs = (await pedir(p.db.transaction(CORREOS, "readonly").objectStore(CORREOS).getAll())) as RegistroCifrado[];
                const out: CorreoMalla[] = [];
                for (const r of regs) {
                    const c = await descifrarCorreo(p.clave, r);
                    if (c) out.push(c);
                }
                return out;
            } catch {
                return memoria.cargar();
            }
        },
        async guardar(c) {
            const p = await preparar();
            if (!p) return memoria.guardar(c);
            try {
                const reg = await cifrarCorreo(p.clave, c);
                await pedir(p.db.transaction(CORREOS, "readwrite").objectStore(CORREOS).put(reg));
                return true;
            } catch {
                return memoria.guardar(c);
            }
        },
        async borrar(id) {
            const p = await preparar();
            if (!p) return memoria.borrar(id);
            try {
                await pedir(p.db.transaction(CORREOS, "readwrite").objectStore(CORREOS).delete(id));
            } catch {
                await memoria.borrar(id);
            }
        },
    };
}
