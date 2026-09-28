/**
 * El LIENZO del Dibujo-adivina: trazos compactos, mensajes de difusión y reparación.
 *
 * Los trazos NO van en el diario de la partida (serían miles de entradas): viajan por difusión en
 * lotes pequeños (`MensajeLienzo`) y, cada pocos segundos, la dibujante deja una FOTO en
 * `extras.lienzo` para quien entra tarde, recarga o se perdió un mensaje. Todo es puro y
 * determinista, y todo lo que llega de fuera se sanea y se acota (una sala no puede tumbar el
 * móvil de nadie con un dibujo gigante).
 *
 * Coordenadas enteras en un lienzo lógico de 1000 × 750; el color y el grosor son índices en
 * `PALETA` y `GROSORES`, no valores libres.
 */
import type { Json } from "./tipos";

export const ANCHO_LIENZO = 1000;
export const ALTO_LIENZO = 750;

/** Fondo de la pizarra: el «borrador» pinta de este color. */
export const FONDO_LIENZO = "#0E1026";

export interface ColorLienzo {
    nombre: string;
    valor: string;
}

/** La última es el borrador (pinta del color del fondo). */
export const PALETA: readonly ColorLienzo[] = [
    { nombre: "Blanco", valor: "#F8FAFC" },
    { nombre: "Violeta", valor: "#7C5CFF" },
    { nombre: "Azul", valor: "#007FFF" },
    { nombre: "Turquesa", valor: "#14B8A6" },
    { nombre: "Esmeralda", valor: "#10B981" },
    { nombre: "Lima", valor: "#39FF14" },
    { nombre: "Ámbar", valor: "#FFBF00" },
    { nombre: "Carmesí", valor: "#DC143C" },
    { nombre: "Rosa", valor: "#EC4899" },
    { nombre: "Borrador", valor: FONDO_LIENZO },
];
export const INDICE_BORRADOR = PALETA.length - 1;

/** Grosores en unidades del lienzo lógico. */
export const GROSORES: readonly { nombre: string; valor: number }[] = [
    { nombre: "Fino", valor: 4 },
    { nombre: "Medio", valor: 9 },
    { nombre: "Grueso", valor: 18 },
    { nombre: "Muy grueso", valor: 34 },
];

export const MAX_TRAZOS = 400;
/** Números (x e y sueltos) por trazo y en total: 2000 puntos por trazo, 8000 en el lienzo. */
export const MAX_NUMEROS_TRAZO = 4000;
export const MAX_NUMEROS_LIENZO = 16_000;
/** Lotes por mensaje y trazos por mensaje. */
export const MAX_LOTES_MENSAJE = 40;

/** Un trazo: `p` = [x0, y0, x1, y1, …]. */
export interface Trazo {
    i: number;
    c: number;
    g: number;
    p: number[];
}

/** Un trozo nuevo de un trazo: `o` es cuántos números ya tenía el trazo antes de este trozo. */
export interface LoteTrazo {
    i: number;
    c: number;
    g: number;
    o: number;
    p: number[];
}

/** Lo que se difunde por el canal (evento efímero «lienzo»). */
export interface MensajeLienzo {
    /** Clave de la ronda: `${idRegistro}:${ronda}`. */
    r: string;
    /** Revisión del lienzo tras este mensaje (sube en 1 con cada mensaje de quien dibuja). */
    rev: number;
    l?: LoteTrazo[];
    /** Vaciar todo el lienzo. */
    borrar?: true;
    /** Quitar un trazo (deshacer). */
    quitar?: number;
}

export interface Lienzo {
    r: string;
    rev: number;
    /** Próximo id de trazo (crece siempre: un id no se reutiliza aunque se deshaga el trazo). */
    sig: number;
    trazos: Trazo[];
    /** Se detectó un mensaje perdido: conviene adoptar la próxima foto. */
    hueco: boolean;
}

export function lienzoVacio(r = ""): Lienzo {
    return { r, rev: 0, sig: 0, trazos: [], hueco: false };
}

export function claveRonda(idRegistro: string, ronda: number): string {
    return `${idRegistro}:${ronda}`;
}

export function totalNumeros(l: Lienzo): number {
    let n = 0;
    for (const t of l.trazos) n += t.p.length;
    return n;
}

// ───────────────────────────── Saneado ─────────────────────────────

function esEntero(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}

function acotar(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

/** Números de puntos válidos (pares, dentro del lienzo), o null. */
function sanearPuntos(p: unknown, max: number): number[] | null {
    if (!Array.isArray(p) || p.length > max) return null;
    const out: number[] = [];
    for (let k = 0; k + 1 < p.length; k += 2) {
        const x = p[k];
        const y = p[k + 1];
        if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        out.push(acotar(Math.round(x), 0, ANCHO_LIENZO), acotar(Math.round(y), 0, ALTO_LIENZO));
    }
    if (p.length % 2 !== 0) return null;
    return out;
}

export function sanearLote(x: unknown): LoteTrazo | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const { i, c, g, o, p } = x as Record<string, unknown>;
    if (!esEntero(i) || i < 0 || i > 100_000) return null;
    if (!esEntero(c) || c < 0 || c >= PALETA.length) return null;
    if (!esEntero(g) || g < 0 || g >= GROSORES.length) return null;
    if (!esEntero(o) || o < 0 || o % 2 !== 0 || o > MAX_NUMEROS_TRAZO) return null;
    const puntos = sanearPuntos(p, 400);
    if (!puntos || puntos.length === 0) return null;
    return { i, c, g, o, p: puntos };
}

export function sanearMensajeLienzo(x: unknown): MensajeLienzo | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const { r, rev, l, borrar, quitar } = x as Record<string, unknown>;
    if (typeof r !== "string" || r.length === 0 || r.length > 90) return null;
    if (!esEntero(rev) || rev < 0) return null;
    const out: MensajeLienzo = { r, rev };
    if (l !== undefined) {
        if (!Array.isArray(l) || l.length > MAX_LOTES_MENSAJE) return null;
        const lotes: LoteTrazo[] = [];
        for (const item of l) {
            const s = sanearLote(item);
            if (!s) return null;
            lotes.push(s);
        }
        out.l = lotes;
    }
    if (borrar === true) out.borrar = true;
    if (quitar !== undefined) {
        if (!esEntero(quitar) || quitar < 0) return null;
        out.quitar = quitar;
    }
    return out;
}

/** Foto guardada (`extras.lienzo`) → Lienzo, o null si no es válida. */
export function lienzoDesdeJson(x: unknown): Lienzo | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const { r, rev, t, s } = x as Record<string, unknown>;
    if (typeof r !== "string" || r.length === 0 || r.length > 90) return null;
    if (!esEntero(rev) || rev < 0 || !Array.isArray(t) || t.length > MAX_TRAZOS) return null;
    const trazos: Trazo[] = [];
    let total = 0;
    const vistos = new Set<number>();
    for (const item of t) {
        if (!Array.isArray(item) || item.length !== 4) return null;
        const [i, c, g, p] = item;
        if (!esEntero(i) || i < 0 || i > 100_000 || vistos.has(i)) return null;
        if (!esEntero(c) || c < 0 || c >= PALETA.length) return null;
        if (!esEntero(g) || g < 0 || g >= GROSORES.length) return null;
        const puntos = sanearPuntos(p, MAX_NUMEROS_TRAZO);
        if (!puntos || puntos.length === 0) return null;
        total += puntos.length;
        if (total > MAX_NUMEROS_LIENZO) return null;
        vistos.add(i);
        trazos.push({ i, c, g, p: puntos });
    }
    const sig = Math.max(esEntero(s) && s >= 0 && s <= 100_001 ? s : 0, trazos.reduce((m, z) => Math.max(m, z.i + 1), 0));
    return { r, rev, sig, trazos, hueco: false };
}

/** Lienzo → JSON compacto para guardarlo en `extras.lienzo`. */
export function lienzoAJson(l: Lienzo): Json {
    return { r: l.r, rev: l.rev, s: l.sig, t: l.trazos.map((t) => [t.i, t.c, t.g, t.p]) };
}

// ───────────────────────────── Reductores (puros) ─────────────────────────────

function aplicarLote(l: Lienzo, lote: LoteTrazo): Lienzo {
    const pos = l.trazos.findIndex((t) => t.i === lote.i);
    if (pos < 0) {
        // Trazo nuevo: solo vale si empieza en 0 (si no, nos perdimos su comienzo).
        if (lote.o !== 0) return { ...l, hueco: true };
        if (l.trazos.length >= MAX_TRAZOS) return l;
        if (totalNumeros(l) + lote.p.length > MAX_NUMEROS_LIENZO) return l;
        return {
            ...l,
            sig: Math.max(l.sig, lote.i + 1),
            trazos: [...l.trazos, { i: lote.i, c: lote.c, g: lote.g, p: lote.p.slice(0, MAX_NUMEROS_TRAZO) }],
        };
    }
    const actual = l.trazos[pos];
    const largo = actual.p.length;
    if (lote.o + lote.p.length <= largo) return l; // ya lo teníamos (repetido)
    if (lote.o > largo) return { ...l, hueco: true }; // nos perdimos un trozo
    const nuevos = lote.p.slice(largo - lote.o);
    if (largo + nuevos.length > MAX_NUMEROS_TRAZO) return l;
    if (totalNumeros(l) + nuevos.length > MAX_NUMEROS_LIENZO) return l;
    const trazos = l.trazos.slice();
    trazos[pos] = { ...actual, p: [...actual.p, ...nuevos] };
    return { ...l, trazos };
}

/** Aplica un mensaje de quien dibuja. Devuelve el MISMO objeto si no cambia nada. */
export function aplicarMensajeLienzo(l: Lienzo, m: MensajeLienzo): Lienzo {
    if (l.r && l.r !== m.r) return l;
    let s: Lienzo = l.r === m.r ? l : { ...l, r: m.r };
    if (m.rev <= s.rev) return l === s ? l : s; // repetido o viejo
    const hueco = m.rev > s.rev + 1;
    if (m.borrar) s = { ...s, trazos: [], hueco: false };
    if (m.quitar !== undefined) {
        const trazos = s.trazos.filter((t) => t.i !== m.quitar);
        if (trazos.length !== s.trazos.length) s = { ...s, trazos };
    }
    for (const lote of m.l ?? []) s = aplicarLote(s, lote);
    return { ...s, rev: m.rev, hueco: m.borrar ? false : s.hueco || hueco };
}

/** ¿Conviene sustituir el lienzo local por esta foto? */
export function conviene(local: Lienzo, foto: Lienzo): boolean {
    if (!local.r) return true;
    if (local.r !== foto.r) return false;
    return foto.rev > local.rev || (local.hueco && foto.rev >= local.rev);
}

export function adoptarFoto(local: Lienzo, foto: Lienzo): Lienzo {
    return conviene(local, foto) ? { ...foto, hueco: false } : local;
}

/** Mensajes para quien dibuja: los reductores locales. */
export function nuevoTrazoLocal(l: Lienzo, c: number, g: number, x: number, y: number): { lienzo: Lienzo; trazo: Trazo } | null {
    if (l.trazos.length >= MAX_TRAZOS || totalNumeros(l) + 2 > MAX_NUMEROS_LIENZO) return null;
    const i = Math.max(l.sig, l.trazos.reduce((m, t) => Math.max(m, t.i + 1), 0));
    const trazo: Trazo = {
        i,
        c: acotar(Math.round(c), 0, PALETA.length - 1),
        g: acotar(Math.round(g), 0, GROSORES.length - 1),
        p: [acotar(Math.round(x), 0, ANCHO_LIENZO), acotar(Math.round(y), 0, ALTO_LIENZO)],
    };
    return { lienzo: { ...l, sig: i + 1, trazos: [...l.trazos, trazo] }, trazo };
}

/** Añade un punto al trazo `i` si aporta algo (a más de `minDist` del anterior) y cabe. */
export function añadirPunto(l: Lienzo, i: number, x: number, y: number, minDist = 2): Lienzo {
    const pos = l.trazos.findIndex((t) => t.i === i);
    if (pos < 0) return l;
    const t = l.trazos[pos];
    if (t.p.length + 2 > MAX_NUMEROS_TRAZO || totalNumeros(l) + 2 > MAX_NUMEROS_LIENZO) return l;
    const px = acotar(Math.round(x), 0, ANCHO_LIENZO);
    const py = acotar(Math.round(y), 0, ALTO_LIENZO);
    const ux = t.p[t.p.length - 2];
    const uy = t.p[t.p.length - 1];
    if (Math.hypot(px - ux, py - uy) < minDist) return l;
    const trazos = l.trazos.slice();
    trazos[pos] = { ...t, p: [...t.p, px, py] };
    return { ...l, trazos };
}

export function quitarUltimoTrazo(l: Lienzo): { lienzo: Lienzo; quitado: number } | null {
    if (l.trazos.length === 0) return null;
    const ultimo = l.trazos[l.trazos.length - 1];
    return { lienzo: { ...l, trazos: l.trazos.slice(0, -1) }, quitado: ultimo.i };
}

/** El lote que corresponde a lo que el trazo ganó desde que se envió hasta `enviados` números. */
export function loteDe(t: Trazo, enviados: number): LoteTrazo | null {
    if (enviados >= t.p.length) return null;
    return { i: t.i, c: t.c, g: t.g, o: enviados, p: t.p.slice(enviados) };
}

/** Los lotes de un lienzo entero (para repartir un lienzo grande en varios mensajes). */
export function lotesDeLienzo(l: Lienzo, maxNumerosPorMensaje = 300): LoteTrazo[][] {
    const mensajes: LoteTrazo[][] = [];
    let actual: LoteTrazo[] = [];
    let cuenta = 0;
    for (const t of l.trazos) {
        for (let o = 0; o < t.p.length; o += maxNumerosPorMensaje) {
            const trozo = t.p.slice(o, o + maxNumerosPorMensaje);
            if (cuenta + trozo.length > maxNumerosPorMensaje && actual.length > 0) {
                mensajes.push(actual);
                actual = [];
                cuenta = 0;
            }
            actual.push({ i: t.i, c: t.c, g: t.g, o, p: trozo });
            cuenta += trozo.length;
        }
    }
    if (actual.length > 0) mensajes.push(actual);
    return mensajes;
}
