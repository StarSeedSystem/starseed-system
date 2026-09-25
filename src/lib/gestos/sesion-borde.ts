/**
 * Sesión de arrastre desde un borde de la pantalla (puro, sin DOM).
 * ─────────────────────────────────────────────────────────────────────────────
 * Para ABRIR una cortina siguiendo el dedo 1:1 hay un problema de orden: el
 * gesto nace en el borde (asa, sensor o zona táctil) cuando la cortina todavía
 * no existe en el DOM. La fuente del gesto no sabe mover el panel y el panel no
 * sabe dónde empezó el dedo.
 *
 * Este pequeño almacén los une: la fuente (ratón, dedo o lápiz; por Pointer
 * Events o por Touch Events, da igual) publica las muestras; la cortina, al
 * montarse, se suscribe y sigue al puntero desde donde vaya. Si el dedo soltó
 * ANTES de que React montara la cortina (un latigazo muy rápido), la sesión
 * queda en fase «soltada» con sus muestras y la cortina decide al montarse.
 */

import { registrarMuestra } from "./fisica";
import type { BordeTrinity, Muestra } from "./tipos";

export type FaseSesion = "arrastrando" | "soltada" | "cancelada";

export interface SesionBorde {
    id: number;
    borde: BordeTrinity;
    /** Punto donde se aceptó la intención: el panel sale de aquí. */
    inicio: Muestra;
    actual: Muestra;
    muestras: Muestra[];
    fase: FaseSesion;
    /** Recorrido (px) que la persona configuró para abrir al soltar despacio. */
    umbralAperturaPx?: number;
}

type Oyente = (sesion: SesionBorde) => void;

/** Una sesión más vieja que esto ya no se «recoge» al montar una cortina. */
const CADUCIDAD_MS = 4000;

let actual: SesionBorde | null = null;
let siguienteId = 1;
const oyentes = new Set<Oyente>();

function avisar(): void {
    if (!actual) return;
    const s = actual;
    oyentes.forEach((fn) => {
        try {
            fn(s);
        } catch {
            /* un oyente roto no puede dejar a los demás sin gesto */
        }
    });
}

export function iniciarSesionBorde(borde: BordeTrinity, inicio: Muestra, umbralAperturaPx?: number): SesionBorde {
    actual = {
        id: siguienteId++,
        borde,
        inicio,
        actual: inicio,
        muestras: [inicio],
        fase: "arrastrando",
        umbralAperturaPx,
    };
    avisar();
    return actual;
}

export function moverSesionBorde(m: Muestra): void {
    if (!actual || actual.fase !== "arrastrando") return;
    actual = { ...actual, actual: m, muestras: registrarMuestra(actual.muestras, m) };
    avisar();
}

export function soltarSesionBorde(m?: Muestra): void {
    if (!actual || actual.fase !== "arrastrando") return;
    const muestras = m ? registrarMuestra(actual.muestras, m) : actual.muestras;
    actual = { ...actual, actual: m ?? actual.actual, muestras, fase: "soltada" };
    avisar();
}

export function cancelarSesionBorde(): void {
    if (!actual || actual.fase !== "arrastrando") return;
    actual = { ...actual, fase: "cancelada" };
    avisar();
}

/** Sesión viva (o recién terminada) para `borde`, si no ha caducado. */
export function sesionBordeActiva(borde: BordeTrinity, ahora?: number): SesionBorde | null {
    if (!actual || actual.borde !== borde) return null;
    if (ahora !== undefined && ahora - actual.actual.t > CADUCIDAD_MS) return null;
    return actual;
}

/** La cortina ya se hizo cargo de la sesión: nadie más debe recogerla al montarse. */
export function liberarSesionBorde(id: number): void {
    if (actual && actual.id === id && actual.fase !== "arrastrando") actual = null;
}

export function suscribirSesionBorde(fn: Oyente): () => void {
    oyentes.add(fn);
    return () => {
        oyentes.delete(fn);
    };
}

/** Solo para pruebas: deja el almacén como recién cargado. */
export function reiniciarSesionesBorde(): void {
    actual = null;
    oyentes.clear();
}
