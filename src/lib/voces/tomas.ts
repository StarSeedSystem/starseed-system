"use client";

/**
 * TOMAS DE VOZ (Ola 249 · motor de voces v2 — patrón Voicebox adaptado al navegador)
 * ─────────────────────────────────────────────────────────────────────────────
 * Historial local de síntesis del Estudio de Voces. Cada «toma» es un registro
 * de una generación de voz con su estado en vivo (en-cola → sintetizando →
 * lista/error) y su LINaje: cuando una toma se «repite», nace una hija que
 * apunta a su padre con `padreId` y `version + 1`, de modo que se puede
 * reconstruir la cadena de variaciones de una misma frase (hasta 5 generaciones).
 *
 * Todo vive en `localStorage` (clave `starseed.voces.tomas.v1`), con un tope de
 * 40 tomas (las más nuevas primero) para no crecer sin fin en una Mac de 8 GB.
 * Es SSR-safe (no toca `window` sin comprobar antes) y nunca lanza: cualquier
 * fallo de almacenamiento se traga y devuelve un valor vacío en lugar de romper
 * el panel.
 *
 * El bus de refresco es un `CustomEvent` sobre `window` (`starseed:tomas`): la
 * interfaz se suscribe con `suscribirTomas(cb)` y se repinta sin estado global.
 */

/** Estado de una toma en la cola de generación. */
export type EstadoToma = "en-cola" | "sintetizando" | "lista" | "error";

/** Una toma de voz: un intento (generación) de síntesis. */
export interface Toma {
    /** Identificador único (crypto.randomUUID o respaldo). */
    id: string;
    /** Marca de tiempo ISO 8601, crea el orden en el historial. */
    t: string;
    /** Texto sintetizado. */
    texto: string;
    /** Identificador del timbre (id de `timbres.ts` o propio). */
    timbreId: string;
    /** Nivel de calidad usado (estudio/alta/ligera/minima). */
    nivel: string;
    /** Motor que sintetizó (o iba a sintetizar) esta toma. */
    motor: string;
    /** Tiempo de síntesis en segundos, o null si no se llegó a medir. */
    segundosSintesis: number | null;
    /** Duración del audio en milisegundos, o null si no se conoce. */
    duracionMs: number | null;
    /** Estado actual de la toma dentro de la cola. */
    estado: EstadoToma;
    /** Mensaje de error legible, solo presente cuando `estado === "error"`. */
    error?: string;
    /** Id de la toma padre (si esta es una repetición/variación). */
    padreId?: string | null;
    /** Generación dentro del linaje: la primera es 1, cada repetición suma 1. */
    version: number;
}

/** Tope de tomas guardadas en localStorage (las más nuevas primero). */
const MAX_TOMAS = 40;

/** Límite de generaciones que `linajeDe` reconstruye hacia atrás. */
const MAX_LINAJE = 5;

/** Clave de localStorage donde vive el historial de tomas. */
const CLAVE = "starseed.voces.tomas.v1";

/** Nombre del evento global que dispara el almacén en cada cambio. */
const EVENTO = "starseed:tomas";

/** Datos mínimos para crear una toma nueva (el resto se completa aquí). */
export interface NuevaToma {
    texto: string;
    timbreId: string;
    nivel: string;
    motor: string;
    /** Estado inicial; "en-cola" por defecto (patrón de cola asíncrona). */
    estado?: EstadoToma;
    /** Id del padre si esta toma es una repetición. */
    padreId?: string | null;
    /** Generación; si no se indica y hay padre, se suma 1 a la del padre. */
    version?: number;
}

/** Parche parcial para actualizar una toma existente. */
export type ParcheToma = Partial<Omit<Toma, "id">>;

/** Genera un identificador único con `crypto.randomUUID` o un respaldo robusto. */
function nuevoId(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {
        /* sin crypto global */
    }
    // Respaldo para entornos sin `crypto.randomUUID` (tests con node antiguo o
    // navegadores que no lo exponen): marca de tiempo + aleatorio.
    return `toma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lee las tomas de localStorage. SSR-safe y tolerante: nunca lanza. */
function leer(): Toma[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(CLAVE);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(arr)) return [];
        // Filtra entradas no-objeto para no devolver basura si el dato se corrompió.
        return arr.filter((x): x is Toma => typeof x === "object" && x !== null);
    } catch {
        return [];
    }
}

/** Escribe la lista en localStorage aplicando el tope de 40 (más nuevas primero). */
function escribir(lista: Toma[]): void {
    if (typeof window === "undefined") return;
    try {
        // El tope se aplica AQUÍ para que ningún camino de escritura pueda
        // eludirlo: siempre se guardan como mucho 40 tomas ordenadas por t descendente.
        const recortada = [...lista]
            .sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0))
            .slice(0, MAX_TOMAS);
        window.localStorage.setItem(CLAVE, JSON.stringify(recortada));
    } catch {
        /* sin almacenamiento: se ignora, la toma solo no persiste */
    }
}

/** Emite el evento global `starseed:tomas` para refrescar a los suscriptores. */
function emitir(): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent(EVENTO));
    } catch {
        /* sin eventos disponibles */
    }
}

/** Lista las tomas guardadas, las más nuevas primero. */
export function listarTomas(): Toma[] {
    return leer()
        .slice()
        .sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
}

/**
 * Crea una toma nueva y la guarda al frente del historial. Devuelve la toma
 * completa (con `id`, `t` y `version` resueltos) o `null` si no puede persistir.
 */
export function crearToma(parcial: NuevaToma): Toma | null {
    const existentes = leer();
    // La versión se resuelve aquí: si hay padre, sumamos 1 a la del padre;
    // si no, la toma es la primera de su linaje (versión 1).
    let version = parcial.version ?? 1;
    if (parcial.padreId && parcial.version === undefined) {
        const padre = existentes.find((x) => x.id === parcial.padreId);
        if (padre) version = (padre.version || 1) + 1;
    }

    const toma: Toma = {
        id: nuevoId(),
        t: new Date().toISOString(),
        texto: parcial.texto,
        timbreId: parcial.timbreId,
        nivel: parcial.nivel,
        motor: parcial.motor,
        segundosSintesis: null,
        duracionMs: null,
        estado: parcial.estado ?? "en-cola",
        padreId: parcial.padreId ?? null,
        version,
    };

    escribir([toma, ...existentes]);
    emitir();
    return toma;
}

/** Actualiza una toma con un parche parcial. No lanza si el id no existe. */
export function actualizarToma(id: string, parche: ParcheToma): void {
    const existentes = leer();
    const siguiente = existentes.map((t) => (t.id === id ? { ...t, ...parche, id } : t));
    if (siguiente.some((t, i) => t.id === id && existentes[i]?.id === id)) {
        escribir(siguiente);
        emitir();
    }
}

/** Borra una toma por id (incluidas sus descendientes directas en el linaje). */
export function borrarToma(id: string): void {
    const existentes = leer();
    // Al borrar una toma se borran también sus hijas directas para no dejar
    // un linaje huérfano: la cadena padre→hija quedaría rota e inconsistente.
    const idsABorrar = new Set<string>([id]);
    for (const t of existentes) {
        if (t.padreId && idsABorrar.has(t.padreId)) idsABorrar.add(t.id);
    }
    const siguiente = existentes.filter((t) => !idsABorrar.has(t.id));
    escribir(siguiente);
    emitir();
}

/**
 * Cadena de padres de una toma hasta 5 generaciones hacia atrás. Devuelve la
 * toma más antigua PRIMERO y la propia toma al final. Si el id no existe o el
 * linaje se corta (padre inexistente), devuelve lo que pudo reconstruir.
 */
export function linajeDe(id: string): Toma[] {
    const existentes = leer();
    const porId = new Map(existentes.map((x) => [x.id, x]));

    const cadena: Toma[] = [];
    let actual: Toma | undefined = porId.get(id);
    let vistos = 0;
    while (actual && vistos < MAX_LINAJE) {
        cadena.unshift(actual);
        vistos += 1;
        const padreId = actual.padreId;
        actual = padreId ? porId.get(padreId) : undefined;
    }
    return cadena;
}

/**
 * Suscribe una función de refresco al bus de tomas. Devuelve una función para
 * desuscribirse (útil en el cleanup de un `useEffect`).
 */
export function suscribirTomas(cb: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const handler = () => cb();
    window.addEventListener(EVENTO, handler);
    return () => window.removeEventListener(EVENTO, handler);
}