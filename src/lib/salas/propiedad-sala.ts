/**
 * StarSeed OS · Salas — Propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * En una pizarra gana quien escribe el último, y está bien. Pero un avatar, una
 * ficha de juego o un widget con estado propio no pueden tener a dos personas
 * moviéndolos a la vez: cada pieza tiene un dueño y una época, solo el dueño
 * escribe y ceder la pieza sube la época. Módulo PURO: sin red, disco ni reloj.
 */

import { puedeEditar } from "@/lib/salas/sala";
import type { Sala } from "@/lib/salas/sala";

/** Quién manda en una pieza y en qué época de esa propiedad vamos. */
export interface Propiedad { dueno: string; epoca: number; }
/** Propiedad por id de elemento de la sala. */
export type Propiedades = Record<string, Propiedad>;
/** Por qué se rechaza una escritura, en palabras que entiende cualquiera. */
export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";
export type ResultadoEscritura = { ok: true } | { ok: false; motivo: MotivoRechazo };
/** Rastro de un traspaso forzado por quien manda en la sala. */
export interface RegistroTraspaso { id: string; por: string; para: string; epoca: number; }
export type ResultadoForzar =
    | { ok: true; propiedades: Propiedades; registro: RegistroTraspaso }
    | { ok: false; motivo: "no-es-dueno-sala" };

/** Un elemento sin dueño pasa a `quien` con la primera época. Inmutable. */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
    if (p[id]) return { ...p };
    return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/** Solo el dueño actual cede la pieza; la época sube en uno. Inmutable. */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
    const actual = p[id];
    if (!actual || actual.dueno !== de) return { ...p };
    return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/** ¿Puede `quien` escribir con la época que vio? Nunca lanza. */
export function aceptarEscritura(
    p: Propiedades, id: string, quien: string, epocaVista: number,
): ResultadoEscritura {
    const actual = p[id];
    if (!actual) return { ok: false, motivo: "sin-dueno" };
    if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
    if (actual.epoca !== epocaVista) return { ok: false, motivo: "epoca-vieja" };
    return { ok: true };
}

/** Frase en español, sin tecnicismos, para explicar un rechazo. */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
    switch (motivo) {
        case "sin-dueno":
            return "Esa pieza todavía no tiene dueño: reclámala para empezar a usarla.";
        case "no-es-dueno":
            return `Esa pieza la tiene ${nombreDueno?.trim() || "otra persona"}; pídesela.`;
        case "epoca-vieja":
            return "Tu copia de esa pieza está atrasada: recárgala antes de escribir.";
    }
}

/** La propiedad que gana entre dos: época mayor y, en empate, dueño menor. */
function mejor(a: Propiedad, b: Propiedad): Propiedad {
    if (a.epoca !== b.epoca) return a.epoca > b.epoca ? a : b;
    return a.dueno <= b.dueno ? a : b;
}

/** Fusiona dos mapas: gana la época mayor y, en empate, el dueño menor. */
export function fusionarPropiedades(
    a: Propiedades, b: Propiedades,
): { propiedades: Propiedades; conflictos: string[] } {
    const propiedades: Propiedades = {};
    const conflictos: string[] = [];
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const pa = a[id];
        const pb = b[id];
        if (pa && pb) {
            propiedades[id] = mejor(pa, pb);
            if (pa.epoca === pb.epoca && pa.dueno !== pb.dueno) conflictos.push(id);
        } else if (pa) {
            propiedades[id] = pa;
        } else if (pb) {
            propiedades[id] = pb;
        }
    }
    return { propiedades, conflictos: conflictos.sort() };
}

/** Un editor escribe lo suyo o lo que nadie reclamó; el resto miran. */
export function puedeEscribir(
    sala: Sala, usuarioId: string, p: Propiedades, id: string,
): boolean {
    if (!puedeEditar(sala, usuarioId)) return false;
    const actual = p[id];
    return !actual || actual.dueno === usuarioId;
}

/** Solo quien manda en la sala puede quitarle una pieza a su dueño. */
export function forzarTraspaso(
    sala: Sala, usuarioId: string, p: Propiedades, id: string, a: string,
): ResultadoForzar {
    if (sala.miembros[usuarioId] !== "dueno") {
        return { ok: false, motivo: "no-es-dueno-sala" };
    }
    const actual = p[id];
    const epoca = (actual?.epoca ?? 0) + 1;
    return {
        ok: true,
        propiedades: { ...p, [id]: { dueno: a, epoca } },
        registro: { id, por: usuarioId, para: a, epoca },
    };
}
