/**
 * Fuentes compartidas con caché (Ola 0929 · paquete A · «Clima y cosmos»).
 *
 * Una misma petición sirve a TODOS los widgets del tablero y a todas las pestañas del
 * navegador: memoria + localStorage, caducidad de al menos 15 minutos, una sola petición en
 * vuelo por fuente y argumentos, y un respiro de 5 minutos tras un fallo para no martillear a
 * la fuente. Nada aquí toca Supabase: son APIs públicas sin clave (Open-Meteo, NOAA SWPC,
 * USGS, SNAPI). Cuando otra pestaña guarda un dato nuevo, esta lo recoge del almacén sin red.
 *
 * PURO respecto a React: los hooks viven en `hooks.ts`.
 */

export const TTL_MINIMO_MS = 15 * 60_000;
export const RESPIRO_ERROR_MS = 5 * 60_000;
/** Un «reintentar» del usuario no puede disparar otra petición antes de este margen. */
export const MARGEN_FORZADO_MS = 45_000;
const PREFIJO = "starseed.clima.cache.v1:";

export interface Instantanea<T> {
    datos: T | null;
    /** Cuándo se obtuvo el dato (ms), o null si nunca. */
    en: number | null;
    cargando: boolean;
    error: string | null;
}

export interface DefinicionFuente<A, T> {
    nombre: string;
    /** Caducidad; se sube a 15 min si llega menor. */
    ttlMs: number;
    /** Clave estable de los argumentos (redondea coordenadas para compartir). */
    clave: (a: A) => string;
    cargar: (a: A, senal: AbortSignal) => Promise<T>;
    /** Guardar en localStorage (por defecto sí). */
    persistir?: boolean;
    /** Tiempo máximo de una petición (ms). */
    tiempoMaxMs?: number;
}

export interface Fuente<A, T> {
    readonly nombre: string;
    readonly ttlMs: number;
    clave(a: A): string;
    leer(a: A): Instantanea<T>;
    vigente(a: A, ahora?: number): boolean;
    obtener(a: A, opciones?: { forzar?: boolean }): Promise<T | null>;
    suscribir(a: A, oyente: () => void): () => void;
    /** Solo para pruebas: olvida memoria, errores y peticiones. */
    _vaciar(): void;
}

interface Entrada<T> { datos: T; en: number }

const VACIA: Instantanea<never> = Object.freeze({ datos: null, en: null, cargando: false, error: null });
export function instantaneaVacia<T>(): Instantanea<T> {
    return VACIA as Instantanea<T>;
}

function almacen(): Storage | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** Todas las fuentes vivas, para avisarlas cuando otra pestaña escribe. */
const registro = new Set<{ alCambiarFuera: (claveCompleta: string) => void }>();
let escuchandoOtrasPestanas = false;
function escucharOtrasPestanas() {
    if (escuchandoOtrasPestanas || typeof window === "undefined") return;
    escuchandoOtrasPestanas = true;
    window.addEventListener("storage", (e) => {
        if (!e.key || !e.key.startsWith(PREFIJO)) return;
        for (const f of registro) f.alCambiarFuera(e.key);
    });
}

export function crearFuente<A, T>(def: DefinicionFuente<A, T>): Fuente<A, T> {
    const ttlMs = Math.max(TTL_MINIMO_MS, def.ttlMs);
    const persistir = def.persistir !== false;
    const memoria = new Map<string, Entrada<T>>();
    const enVuelo = new Map<string, Promise<T | null>>();
    const errores = new Map<string, { mensaje: string; en: number }>();
    const oyentes = new Map<string, Set<() => void>>();
    const fotos = new Map<string, Instantanea<T>>();
    const leidasDelAlmacen = new Set<string>();

    const completa = (k: string) => `${PREFIJO}${def.nombre}:${k}`;

    function notificar(k: string) {
        fotos.delete(k);
        oyentes.get(k)?.forEach((o) => {
            try { o(); } catch { /* un oyente roto no tumba a los demás */ }
        });
    }

    function desdeAlmacen(k: string): Entrada<T> | null {
        if (!persistir || leidasDelAlmacen.has(k)) return null;
        leidasDelAlmacen.add(k);
        const s = almacen();
        if (!s) return null;
        try {
            const crudo = s.getItem(completa(k));
            if (!crudo) return null;
            const j = JSON.parse(crudo) as Partial<Entrada<T>>;
            if (!j || typeof j.en !== "number" || j.datos === undefined || j.datos === null) return null;
            return { datos: j.datos as T, en: j.en };
        } catch {
            return null;
        }
    }

    function entrada(k: string): Entrada<T> | null {
        const m = memoria.get(k);
        if (m) return m;
        const g = desdeAlmacen(k);
        if (g) memoria.set(k, g);
        return g;
    }

    function guardar(k: string, e: Entrada<T>) {
        memoria.set(k, e);
        if (!persistir) return;
        const s = almacen();
        if (!s) return;
        try {
            s.setItem(completa(k), JSON.stringify(e));
        } catch {
            /* almacén lleno o bloqueado: la memoria basta */
        }
    }

    const fuente: Fuente<A, T> = {
        nombre: def.nombre,
        ttlMs,
        clave: def.clave,
        leer(a) {
            const k = def.clave(a);
            const cacheada = fotos.get(k);
            if (cacheada) return cacheada;
            const e = entrada(k);
            const err = errores.get(k);
            const foto: Instantanea<T> = {
                datos: e?.datos ?? null,
                en: e?.en ?? null,
                cargando: enVuelo.has(k),
                error: err?.mensaje ?? null,
            };
            fotos.set(k, foto);
            return foto;
        },
        vigente(a, ahora = Date.now()) {
            const e = entrada(def.clave(a));
            return !!e && ahora - e.en < ttlMs;
        },
        obtener(a, opciones) {
            const k = def.clave(a);
            const volando = enVuelo.get(k);
            if (volando) return volando;
            const ahora = Date.now();
            const e = entrada(k);
            const forzar = opciones?.forzar === true && !(e && ahora - e.en < MARGEN_FORZADO_MS);
            if (!forzar) {
                if (e && ahora - e.en < ttlMs) return Promise.resolve(e.datos);
                const err = errores.get(k);
                if (err && ahora - err.en < RESPIRO_ERROR_MS) return Promise.resolve(e?.datos ?? null);
            }
            const control = typeof AbortController !== "undefined" ? new AbortController() : null;
            const reloj = control ? setTimeout(() => control.abort(), def.tiempoMaxMs ?? 15_000) : null;
            const p = def
                .cargar(a, (control?.signal ?? undefined) as AbortSignal)
                .then((datos) => {
                    guardar(k, { datos, en: Date.now() });
                    errores.delete(k);
                    return datos as T | null;
                })
                .catch((err: unknown) => {
                    const mensaje = err instanceof Error && err.message ? err.message : "La fuente no respondió";
                    errores.set(k, { mensaje, en: Date.now() });
                    return entrada(k)?.datos ?? null;
                })
                .finally(() => {
                    if (reloj) clearTimeout(reloj);
                    enVuelo.delete(k);
                    notificar(k);
                });
            enVuelo.set(k, p);
            notificar(k);
            return p;
        },
        suscribir(a, oyente) {
            escucharOtrasPestanas();
            const k = def.clave(a);
            let set = oyentes.get(k);
            if (!set) { set = new Set(); oyentes.set(k, set); }
            set.add(oyente);
            return () => { set!.delete(oyente); };
        },
        _vaciar() {
            memoria.clear();
            enVuelo.clear();
            errores.clear();
            fotos.clear();
            leidasDelAlmacen.clear();
        },
    };

    registro.add({
        alCambiarFuera(claveCompleta) {
            const pre = `${PREFIJO}${def.nombre}:`;
            if (!claveCompleta.startsWith(pre)) return;
            const k = claveCompleta.slice(pre.length);
            memoria.delete(k);
            leidasDelAlmacen.delete(k);
            notificar(k);
        },
    });

    return fuente;
}

/** Coordenada redondeada (2 decimales ≈ 1 km) para que los widgets vecinos compartan caché. */
export function claveCoordenadas(lat: number, lon: number, decimales = 2): string {
    const f = 10 ** decimales;
    return `${Math.round(lat * f) / f},${Math.round(lon * f) / f}`;
}

/** GET JSON con señal de corte; lanza con un mensaje en español si algo falla. */
export async function pedirJson(url: string, senal?: AbortSignal): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(url, { signal: senal, headers: { Accept: "application/json" } });
    } catch {
        throw new Error("Sin conexión con la fuente");
    }
    if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
    try {
        return await res.json();
    } catch {
        throw new Error("La fuente devolvió datos ilegibles");
    }
}

/** GET de texto plano (el formato de algunos productos de NOAA). */
export async function pedirTexto(url: string, senal?: AbortSignal): Promise<string> {
    let res: Response;
    try {
        res = await fetch(url, { signal: senal });
    } catch {
        throw new Error("Sin conexión con la fuente");
    }
    if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
    return res.text();
}
