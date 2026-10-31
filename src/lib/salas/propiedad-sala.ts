/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas · Propiedad de elementos por épocas
 * (Ola 1025R · INF1025J · método Co-op Anything, MIT).
 * ═══════════════════════════════════════════════════════════════════════════
 * En `sincronia-sala.ts` gana el último en escribir: válido para pizarras y
 * notas, insuficiente para un avatar, una ficha de juego o un widget con
 * estado propio. Aquí vive la regla co-op: cada objeto tiene un dueño y una
 * época; sólo el dueño escribe; ceder el objeto sube la época; una escritura
 * con época vieja se rechaza. ADITIVO: no toca la sincronía ni `sala.ts`, que
 * siguen mandando para lo suyo.
 *
 * Módulo PURO: sin red, sin disco, sin reloj. Operaciones inmutables: los
 * mapas de entrada nunca se mudan, siempre sale una copia nueva.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { puedeEditar, rolDe, type Sala } from "./sala";

/** El dueño de un elemento y su época (1 = primera reclamación). */
export interface Propiedad {
    dueno: string;
    epoca: number;
}

/** Mapa de propiedad: clave = id de `ElementoSala`; `dueno` = id de la persona. */
export type Propiedades = Record<string, Propiedad>;

/** Por qué se rechaza una escritura, con su frase para personas en `explicar`. */
export type MotivoEscritura = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

/** Resultado de intentar escribir un elemento. */
export interface DecisionEscritura {
    ok: boolean;
    motivo?: MotivoEscritura;
}

/**
 * Reclama un elemento sin dueño: pasa a ser de `quien` con época 1. Si ya
 * tiene dueño, nadie lo roba reclamando: el mapa sale igual.
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
    if (p[id]) return { ...p };
    return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/** Cede el elemento: sólo el dueño actual puede, y ceder sube la época en 1. */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
    const actual = p[id];
    if (!actual || actual.dueno !== de) return { ...p };
    return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/** Fase de explicación: frase en claro para cada rechazo, sin tecnicismos. */
export function explicar(motivo: MotivoEscritura, nombreDueno?: string): string {
    if (motivo === "no-es-dueno") {
        const dueño = nombreDueno
            ? `la tiene ${nombreDueno}`
            : "ya tiene dueño";
        return `Esa pieza ${dueño}; pídesela y, si te la cede, escribe tú el cambio siguiente.`;
    }
    if (motivo === "epoca-vieja") {
        return "Estás viendo una versión antigua de esa pieza; mírala tal y como está ahora y escribe sobre eso.";
    }
    return "La pieza no figura con dueño en esta copia de la sala; reclámala de nuevo antes de tocarla.";
}

/**
 * ¿Se acepta escribir el elemento que `quien` trae, creyendo haber visto la
 * época `epocaVista`? Un elemento sin dueño se escribe libre (época vista 0).
 * Si la copia que alguien cita existe aquí pero con otro dueño, o citó una
 * época más vieja que la actual, se rechaza: nunca se pisa a nadie.
 */
export function aceptarEscritura(
    p: Propiedades,
    id: string,
    quien: string,
    epocaVista: number,
): DecisionEscritura {
    const actual = p[id];
    if (!actual) return epocaVista > 0 ? { ok: false, motivo: "sin-dueno" } : { ok: true };
    if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
    if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
    return { ok: true };
}

/** Desempate determinista de la fusión: época mayor; a igual, dueño menor. */
function ganaPropiedad(mia: Propiedad, otra: Propiedad): Propiedad {
    if (mia.epoca !== otra.epoca) return mia.epoca > otra.epoca ? mia : otra;
    if (mia.dueno !== otra.dueno) return mia.dueno < otra.dueno ? mia : otra;
    return mia;
}

/**
 * Fusiona dos mapas de propiedad (dos copias de la misma sala que vieron
 * reclamaciones o cesiones distintas). DETERMINISTA y conmutativa: época
 * mayor gana; a igual época y distinto dueño, el dueño menor alfabéticamente,
 * para que toda neurona llegue al mismo resultado fusionen en el orden que
 * fusionen. Devuelve además los ids en disputa (dos dueños distintos), para
 * avisar en la UI con honestidad.
 */
export function fusionarPropiedades(
    a: Propiedades,
    b: Propiedades,
): { resultado: Propiedades; conflictos: string[] } {
    const resultado: Propiedades = { ...a };
    const conflictos: string[] = [];
    for (const [id, otra] of Object.entries(b)) {
        const mia = resultado[id];
        if (!mia) {
            resultado[id] = otra;
            continue;
        }
        if (mia.dueno !== otra.dueno) conflictos.push(id);
        resultado[id] = ganaPropiedad(mia, otra);
    }
    return { resultado, conflictos: conflictos.sort() };
}

/**
 * Combina el rol (`puedeEditar` de `sala.ts`) con la propiedad: un editor
 * escribe lo suyo o lo que nadie reclamó; el de lo ajeno no pasa.
 */
export function puedeEscribir(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
    if (!puedeEditar(sala, usuarioId)) return false;
    const actual = p[id];
    return !actual || actual.dueno === usuarioId;
}

/** Resultado de forzar un traspaso desde el dueño de la sala. */
export type TraspasoForzado =
    | { ok: true; propiedades: Propiedades; porQuien: string; aQuien: string }
    | { ok: false; propiedades: Propiedades };

/**
 * El dueño de la SALA (no el del elemento) puede retirarle un objeto a quien
 * lo tenga y dárselo a otra persona. El resultado lleva el registro de quién
 * lo forzó y a quién se lo dio, para que quede a la vista. Si quien llama no
 * es el dueño de la sala, no cambia nada.
 */
export function forzarTraspaso(
    sala: Sala,
    usuarioId: string,
    p: Propiedades,
    id: string,
    a: string,
): TraspasoForzado {
    if (rolDe(sala, usuarioId) !== "dueno") return { ok: false, propiedades: { ...p } };
    const actual = p[id];
    const propiedades: Propiedades = {
        ...p,
        [id]: { dueno: a, epoca: (actual ? actual.epoca : 0) + 1 },
    };
    return { ok: true, propiedades, porQuien: usuarioId, aQuien: a };
}
