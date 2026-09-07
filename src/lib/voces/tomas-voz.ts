/**
 * TOMAS DE SÍNTESIS DE VOZ (Ola 265 · Forja fase 3 — efectos y tomas)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada «Probar» del Estudio de Voces deja una TOMA: un registro reproducible
 * con los parámetros EXACTOS que produjeron ese sonido (instruct, velocidad,
 * semilla, tono, emoción, intensidad y efectos) y, cuando el motor devolvió el
 * WAV, el audio en sí para reproducirlo, compararlo y descargarlo. Es el
 * «negativo» de la síntesis, al estilo del patrón `tomas.ts` del oído, pero
 * orientado a la SALIDA (generación) en vez de a la entrada (escucha).
 *
 * Todo vive en `localStorage` (clave `starseed.voces.tomas-voz.v1`), con un
 * tope de 40 tomas: las más antiguas SIN valoración se descartan primero (una
 * toma apreciada no se borra por antigüedad). Es SSR-safe (no toca `window`
 * sin comprobar antes) y nunca lanza.
 *
 * El bus de refresco es un `CustomEvent` sobre `window` (`starseed:tomas-voz`);
 * la interfaz se suscribe con `suscribirTomasVoz(cb)` y se repinta sin estado
 * global.
 */

import type { EfectosVoz } from "./efectos";
import type { EmocionVoz } from "./emociones";
import type { NivelVoz } from "@/lib/aurora/voz-starseed/niveles";
import type { VersionVoz } from "./versiones";
import { buscarTimbre } from "@/lib/aurora/timbres";

/** Una toma de síntesis: los parámetros + el audio (si cabió) + la valoración. */
export interface TomaVoz {
    /** Identificador único (crypto.randomUUID o respaldo). */
    id: string;
    /** Marca de tiempo ISO 8601; ordena el historial. */
    creadaEn: string;
    /** Id del timbre que sonó (id de `timbres.ts` o propio). */
    timbreId: string;
    /** Nombre de la voz, para mostrar sin resolver el timbre. */
    nombreVoz: string;
    /** Texto sintetizado. */
    texto: string;
    /** Parámetros reproducibles que produjeron este sonido. */
    params: ParamsTomaVoz;
    /** Nivel de calidad usado (estudio/alta/ligera/minima). */
    nivel: NivelVoz;
    /** Motor que sintetizó, si se conoció. */
    motor?: string;
    /** Segundos que tardó la síntesis, si se midió. */
    segundos?: number;
    /** Duración del audio en segundos, si se conoce. */
    duracionS?: number;
    /** WAV en base64, SOLO si pesa < 1,5 MB; si no, `null` con `sinAudio`. */
    audioDataUrl?: string | null;
    /** `true` si la toma no pudo guardar el audio (pesó o no llegó). */
    sinAudio?: boolean;
    /** Valoración 1–5 de quien la probó; las sin valorar se descartan antes. */
    valoracion?: 1 | 2 | 3 | 4 | 5;
    /** Notas libres de quien la probó. */
    notas?: string;
}

/** Parámetros reproducibles de una toma (lo que define cómo suena). */
export interface ParamsTomaVoz {
    /** Instrucción de estilo (tokens del demonio). */
    instruct: string;
    /** Velocidad de habla. */
    speed: number;
    /** Desplazamiento de tono del post-proceso local (1 = natural). */
    pitch?: number;
    /** Semilla del muestreo neuronal. */
    seed?: number;
    /** Emoción aplicada como capa sobre el perfil. */
    emocion?: EmocionVoz;
    /** Intensidad de la emoción (0–2). */
    intensidad?: number;
    /** Cadena de efectos (eq/reverb/compresor/de-esser/ganancia). */
    efectos?: EfectosVoz;
}

/** Tope de tomas guardadas (las más nuevas primero). */
const MAX_TOMAS = 40;

/** Límite de tamaño del audio guardado: < 1,5 MB en base64. */
const MAX_AUDIO_BYTES = 1_500_000;

/** Clave de localStorage donde vive el historial de tomas. */
const CLAVE = "starseed.voces.tomas-voz.v1";

/** Nombre del evento global que dispara el almacén en cada cambio. */
const EVENTO = "starseed:tomas-voz";

/** Datos mínimos para crear una toma (el resto se completa aquí). */
export interface NuevaTomaVoz {
    timbreId: string;
    nombreVoz: string;
    texto: string;
    params: ParamsTomaVoz;
    nivel: NivelVoz;
    motor?: string;
    segundos?: number;
    duracionS?: number;
    audioDataUrl?: string | null;
    sinAudio?: boolean;
    valoracion?: 1 | 2 | 3 | 4 | 5;
    notas?: string;
}

/** Parche parcial para actualizar una toma existente. */
export type ParcheTomaVoz = Partial<Omit<TomaVoz, "id">>;

/** Genera un identificador único con `crypto.randomUUID` o un respaldo robusto. */
function nuevoId(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {
        /* sin crypto global */
    }
    return `toma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lee las tomas de localStorage. SSR-safe y tolerante: nunca lanza. */
function leer(): TomaVoz[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(CLAVE);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(arr)) return [];
        return arr.filter((x): x is TomaVoz => typeof x === "object" && x !== null);
    } catch {
        return [];
    }
}

/** Escribe la lista aplicando el tope de 40: las sin valorar se descartan antes. */
function escribir(lista: TomaVoz[]): void {
    if (typeof window === "undefined") return;
    try {
        // Orden de más nueva a más vieja.
        const ordenadas = [...lista].sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : a.creadaEn > b.creadaEn ? -1 : 0));
        const exceso = ordenadas.length - MAX_TOMAS;
        if (exceso <= 0) {
            window.localStorage.setItem(CLAVE, JSON.stringify(ordenadas));
            return;
        }
        // Regla del área: se descartan PRIMERO las más antiguas SIN valoración
        // (una toma apreciada sobrevive a la antigüedad); SOLO si no hay
        // suficientes sin valorar para llegar al tope se descartan también las
        // valoradas más antiguas. Así se cumple SIEMPRE el máximo de 40.
        const sinValorar = ordenadas
            .map((t, i) => ({ t, i }))
            .filter((x) => x.t.valoracion === undefined)
            .sort((a, b) => (a.t.creadaEn < b.t.creadaEn ? -1 : a.t.creadaEn > b.t.creadaEn ? 1 : 0));
        const aSacar = new Set(sinValorar.slice(0, exceso).map((x) => x.t.id));
        const recortada = ordenadas.filter((t) => !aSacar.has(t.id));
        // Si aún se supera el tope (faltaron sin valorar), se corta por
        // antigüedad la cola sobrante para no romper nunca el máximo.
        const final = recortada.length > MAX_TOMAS ? recortada.slice(0, MAX_TOMAS) : recortada;
        window.localStorage.setItem(CLAVE, JSON.stringify(final));
    } catch {
        /* sin almacenamiento: la toma solo no persiste */
    }
}

/** Emite el evento global `starseed:tomas-voz` para refrescar a los suscriptores. */
function emitir(): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent(EVENTO));
    } catch {
        /* sin eventos disponibles */
    }
}

/** Lista las tomas guardadas, las más nuevas primero (máximo 40). */
export function listarTomasVoz(): TomaVoz[] {
    return leer()
        .slice()
        .sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : a.creadaEn > b.creadaEn ? -1 : 0));
}

/** Lista las tomas de una voz concreta, las más nuevas primero. */
export function listarTomasVozDe(timbreId: string): TomaVoz[] {
    return listarTomasVoz().filter((t) => t.timbreId === timbreId);
}

/** Comprime un WAV a base64 SOLO si pesa menos de 1,5 MB; si no, devuelve null. */
export function audioABase64(bytes: ArrayBuffer): string | null {
    if (!bytes || bytes.byteLength === 0) return null;
    if (bytes.byteLength >= MAX_AUDIO_BYTES) return null;
    try {
        const u8 = new Uint8Array(bytes);
        let binaria = "";
        const trozo = 0x8000;
        for (let i = 0; i < u8.length; i += trozo) {
            binaria += String.fromCharCode(...u8.subarray(i, i + trozo));
        }
        if (typeof btoa !== "function") return null;
        return btoa(binaria);
    } catch {
        return null;
    }
}

/** Crea una toma y la guarda al frente del historial. Nunca lanza. */
export function crearTomaVoz(parcial: NuevaTomaVoz): TomaVoz {
    const ahora = new Date().toISOString();
    const toma: TomaVoz = {
        id: nuevoId(),
        creadaEn: ahora,
        timbreId: parcial.timbreId,
        nombreVoz: parcial.nombreVoz,
        texto: parcial.texto,
        params: { ...parcial.params },
        nivel: parcial.nivel,
        motor: parcial.motor,
        segundos: parcial.segundos,
        duracionS: parcial.duracionS,
        audioDataUrl: parcial.audioDataUrl ?? null,
        sinAudio: parcial.sinAudio ?? !parcial.audioDataUrl,
        valoracion: parcial.valoracion,
        notas: parcial.notas,
    };
    escribir([toma, ...leer()]);
    emitir();
    return toma;
}

/** Actualiza una toma con un parche parcial. No lanza si el id no existe. */
export function actualizarTomaVoz(id: string, parche: ParcheTomaVoz): void {
    const existentes = leer();
    const siguiente = existentes.map((t) => (t.id === id ? { ...t, ...parche, id } : t));
    if (siguiente.some((t, i) => t.id === id && existentes[i]?.id === id)) {
        escribir(siguiente);
        emitir();
    }
}

/** Borra una toma por id. */
export function borrarTomaVoz(id: string): void {
    escribir(leer().filter((t) => t.id !== id));
    emitir();
}

/** Suscribe una función al bus de tomas; devuelve el desuscriptor. */
export function suscribirTomasVoz(cb: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const handler = () => cb();
    window.addEventListener(EVENTO, handler);
    return () => window.removeEventListener(EVENTO, handler);
}

/**
 * Construye una `VersionVoz` (receta congelada) desde una toma, para poder
 * promoverla. `voz` y `expr` se rellenan del timbre base (la toma no guarda la
 * voz neuronal ni el carácter, los hereda del timbre en el momento de crear).
 */
export function versionDesdeToma(toma: TomaVoz, nombre?: string): VersionVoz {
    const base = buscarTimbre(toma.timbreId);
    return {
        id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        nombre: nombre ?? `${toma.nombreVoz} · toma`,
        timbreBase: toma.timbreId,
        motor: toma.nivel ?? "alta",
        tamano: "auto",
        params: {
            voz: base?.local.voz ?? "",
            speed: toma.params.speed,
            instruct: toma.params.instruct,
            ...(toma.params.seed !== undefined ? { seed: toma.params.seed } : {}),
            ...(toma.params.pitch !== undefined ? { pitch: toma.params.pitch } : {}),
            ...(toma.params.emocion ? { emocionBase: toma.params.emocion } : {}),
            ...(toma.params.intensidad !== undefined ? { intensidad: toma.params.intensidad } : {}),
            ...(toma.params.efectos !== undefined ? { efectos: toma.params.efectos } : {}),
            expr: base ? { ...base.expr } : { arco: 0.15, vivacidad: 0.14, calidez: 0.1 },
        },
        notas: toma.notas ?? "",
        valoracion: toma.valoracion ?? null,
        padres: [],
        creadaEn: toma.creadaEn,
        modificadaEn: new Date().toISOString(),
        promovidaA: [],
    };
}