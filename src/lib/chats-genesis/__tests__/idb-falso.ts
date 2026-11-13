/**
 * IndexedDB de mentira para las pruebas de la firma del aparato (el repo no tiene `fake-indexeddb`).
 *
 * Solo lo que usa firma-aparato.ts: `open` con `onupgradeneeded`, `createObjectStore` sin keyPath,
 * transacciones con `get`/`put`/`delete`, `oncomplete`/`onabort` y `abort()`. Imita lo que importa:
 *  · los valores se copian con `structuredClone` (una `CryptoKey` se guarda como objeto, como en el navegador);
 *  · las transacciones van UNA DETRÁS DE OTRA (en el navegador, las readwrite sobre el mismo almacén
 *    no se solapan) y lo escrito solo se ve tras `oncomplete`;
 *  · cada petición contesta en otra vuelta del bucle (asíncrona), como en el navegador;
 *  · varias fábricas sobre el mismo `Respaldo` son varias pestañas (o una recarga) del mismo sitio.
 */

type Almacenes = Map<string, Map<string, unknown>>;

export interface Respaldo {
    bases: Map<string, { version: number; almacenes: Almacenes }>;
    cola: TxFalsa[];
    enCurso: TxFalsa | null;
    /** Registro de lo que pasó, para las pruebas: «inicio:readwrite», «fin:readwrite»… */
    diario: string[];
}

export function crearRespaldo(): Respaldo {
    return { bases: new Map(), cola: [], enCurso: null, diario: [] };
}

const tarde = (f: () => void) => setTimeout(f, 0);

class PeticionFalsa {
    result: unknown = undefined;
    error: unknown = null;
    onsuccess: ((ev?: unknown) => void) | null = null;
    onerror: ((ev?: unknown) => void) | null = null;
}

class TxFalsa {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    error: unknown = null;
    private pendientes: (() => void)[] = [];
    private abortada = false;
    private terminada = false;
    private copia: Map<string, unknown> | null = null;
    constructor(private respaldo: Respaldo, private base: { almacenes: Almacenes }, private nombre: string, readonly modo: string) {}

    objectStore(n: string) {
        if (n !== this.nombre) throw new Error("almacén fuera de la transacción");
        const pedir = (hacer: (datos: Map<string, unknown>) => unknown) => {
            if (this.terminada) throw new Error("TransactionInactiveError");
            const p = new PeticionFalsa();
            this.pendientes.push(() => {
                p.result = hacer(this.copia!);
                p.onsuccess?.({ target: p });
            });
            return p;
        };
        return {
            get: (k: string) => pedir((d) => (d.has(k) ? structuredClone(d.get(k)) : undefined)),
            put: (v: unknown, k: string) => {
                if (this.modo !== "readwrite") throw new Error("ReadOnlyError");
                return pedir((d) => (d.set(k, structuredClone(v)), k));
            },
            delete: (k: string) => {
                if (this.modo !== "readwrite") throw new Error("ReadOnlyError");
                return pedir((d) => void d.delete(k));
            },
        };
    }

    abort() {
        if (this.terminada) throw new Error("InvalidStateError");
        this.abortada = true;
    }

    empezar() {
        this.respaldo.diario.push(`inicio:${this.modo}`);
        this.copia = new Map(this.base.almacenes.get(this.nombre));
        const paso = () => {
            if (this.abortada) {
                this.terminada = true;
                this.respaldo.diario.push(`abortada:${this.modo}`);
                tarde(() => {
                    this.onabort?.();
                    this.siguiente();
                });
                return;
            }
            const op = this.pendientes.shift();
            if (!op) {
                this.terminada = true;
                if (this.modo === "readwrite") this.base.almacenes.set(this.nombre, this.copia!);
                this.respaldo.diario.push(`fin:${this.modo}`);
                tarde(() => {
                    this.oncomplete?.();
                    this.siguiente();
                });
                return;
            }
            tarde(() => {
                op();
                paso();
            });
        };
        paso();
    }

    private siguiente() {
        this.respaldo.enCurso = null;
        avanzar(this.respaldo);
    }
}

function avanzar(r: Respaldo) {
    if (r.enCurso) return;
    const t = r.cola.shift();
    if (!t) return;
    r.enCurso = t;
    t.empezar();
}

/** Una fábrica `indexedDB` sobre un respaldo (una pestaña). `romper` hace fallar `open` (ventana privada). */
export function crearIdbFalso(respaldo: Respaldo = crearRespaldo(), op: { romper?: boolean } = {}): IDBFactory {
    const fabrica = {
        open(nombre: string, version = 1) {
            const req = new PeticionFalsa() as PeticionFalsa & { onupgradeneeded: (() => void) | null; onblocked: (() => void) | null };
            req.onupgradeneeded = null;
            req.onblocked = null;
            tarde(() => {
                if (op.romper) {
                    req.error = new Error("InvalidStateError");
                    req.onerror?.();
                    return;
                }
                let base = respaldo.bases.get(nombre);
                const nueva = !base || base.version < version;
                if (!base) {
                    base = { version, almacenes: new Map() };
                    respaldo.bases.set(nombre, base);
                }
                const b = base;
                const db = {
                    onversionchange: null as null | (() => void),
                    objectStoreNames: { contains: (n: string) => b.almacenes.has(n) },
                    createObjectStore: (n: string) => {
                        b.almacenes.set(n, new Map());
                        return {};
                    },
                    transaction: (n: string, modo: string = "readonly") => {
                        if (!b.almacenes.has(n)) throw new Error("NotFoundError");
                        const t = new TxFalsa(respaldo, b, n, modo);
                        respaldo.cola.push(t);
                        tarde(() => avanzar(respaldo));
                        return t;
                    },
                    close: () => undefined,
                };
                req.result = db;
                if (nueva) {
                    b.version = version;
                    req.onupgradeneeded?.();
                }
                req.onsuccess?.();
            });
            return req;
        },
    };
    return fabrica as unknown as IDBFactory;
}

/** Almacén `localStorage` de mentira. */
export function crearMarcaFalsa(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}
