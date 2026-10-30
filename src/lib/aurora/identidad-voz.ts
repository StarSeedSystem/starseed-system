"use client";

/**
 * IDENTIDAD ÚNICA DE VOZ POR PERSONA (Ola 1015V · VZF1015M).
 * Un solo resolutor: agente › personalidad › cerebro › neurona › cuenta → timbre,
 * motor y vozRT. Lee los mapas existentes sin borrarlos (timbres e instruct del
 * demonio, voz-inicial/voz-rito, VOZ_POR_PERSONA, pines neurona×personalidad); el
 * motor elegido resuelve luego sus mapas propios (OpenVoice2, xAI). Nunca lanza:
 * por defecto conserva la voz F1 de Alex.
 */

import { getOverrides } from "@/lib/astraura/neuron-persona-store";
import { TIMBRE_AUTONOMO_BASE, TIMBRE_PREDETERMINADO } from "@/lib/aurora/timbres-catalogo";
import { safeGet } from "@/lib/safe-storage";

export const IDENTIDAD_VOZ_KEY = "starseed.voz.identidad.v1";
export const VOZ_RT_FIJA_KEY = "starseed.voz-rt.voz";
export const TIMBRE_FIJO_KEY = "starseed.voz.timbre.v1";
const MODO_VOZ_KEY = "starseed.voz.modo.v1";

export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

export interface ContextoIdentidadVoz {
    agente?: string | null; personalidad?: string | null; cerebro?: string | null;
    neurona?: string | null; cuenta?: string | null;
}
export interface EleccionVoz { timbre?: string; motor?: string; vozRT?: string }
export interface AlmacenIdentidadVoz {
    porAgente?: Record<string, EleccionVoz>; porPersonalidad?: Record<string, EleccionVoz>;
    porCerebro?: Record<string, EleccionVoz>; porNeurona?: Record<string, EleccionVoz>; cuenta?: EleccionVoz;
}
export interface OpcionesIdentidadVoz {
    almacen?: AlmacenIdentidadVoz; vozRTFija?: string | null; timbreFijo?: string | null;
    motorPorPersona?: (personalidad: string | undefined) => string | null;
}
export interface IdentidadVoz { timbre: string; motor: string; vozRT: string; origen: OrigenIdentidadVoz }

/** Mapa canónico de voz en tiempo real (el mismo de voz-rt.ts, que se conserva). */
export const VOZ_RT_POR_PERSONA: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2", hermione: "F3",
    mnemosyne: "F4", kallisti: "F5", hephaestus: "M1", hermes: "M2", logos: "M3", oneiros: "M4",
};

const VOZ_VALIDA = /^[FM][1-5]$/;
function leer(clave: string): string | null {
    try { return safeGet(clave); } catch { return null; }
}
function texto(valor: unknown, max: number): string | undefined {
    if (typeof valor !== "string") return undefined;
    const s = valor.trim();
    // eslint-disable-next-line no-control-regex
    return s && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s) ? s : undefined;
}
function vozValida(valor: unknown): string | undefined {
    const s = texto(valor, 2);
    return s && VOZ_VALIDA.test(s) ? s : undefined;
}
function almacenGuardado(): AlmacenIdentidadVoz {
    try {
        const p = JSON.parse(leer(IDENTIDAD_VOZ_KEY) ?? "{}") as unknown;
        return p && typeof p === "object" && !Array.isArray(p) ? (p as AlmacenIdentidadVoz) : {};
    } catch { return {}; }
}
/** Timbre del modo de voz (voz-inicial/timbres); en autónoma, la base neutra de voz-rito. */
function timbrePorModo(): string {
    const modo = leer(MODO_VOZ_KEY);
    if (modo === "autonoma") return TIMBRE_AUTONOMO_BASE;
    return modo === "masculina" || modo === "neutra" ? TIMBRE_PREDETERMINADO[modo] : TIMBRE_PREDETERMINADO.femenina;
}
function motorDelRegistro(neurona: string | undefined, persona: string | undefined): string | null {
    if (!neurona || !persona) return null;
    try { return texto(getOverrides(neurona, persona).voz?.motor, 80) ?? null; } catch { return null; }
}
function porId(mapa: Record<string, EleccionVoz> | undefined, id: string | undefined): EleccionVoz | undefined {
    const e = id && mapa ? mapa[id] : undefined;
    return e && typeof e === "object" && !Array.isArray(e) ? e : undefined;
}
function fusionar(base: IdentidadVoz, e: EleccionVoz | undefined, origen: OrigenIdentidadVoz): IdentidadVoz | null {
    if (!e || typeof e !== "object") return null;
    const timbre = texto(e.timbre, 120);
    const motor = texto(e.motor, 80);
    const vozRT = vozValida(e.vozRT);
    if (!timbre && !motor && !vozRT) return null;
    return { timbre: timbre ?? base.timbre, motor: motor ?? base.motor, vozRT: vozRT ?? base.vozRT, origen };
}
/** Resuelve la identidad EFECTIVA. `origen` = ámbito del último dato aportado. */
export function identidadVoz(
    contexto: ContextoIdentidadVoz = {},
    opciones: OpcionesIdentidadVoz = {},
): IdentidadVoz {
    try {
        const persona = texto(contexto.personalidad, 160);
        const neurona = texto(contexto.neurona, 160);
        const almacen = opciones.almacen ?? almacenGuardado();
        const fija = opciones.vozRTFija !== undefined ? vozValida(opciones.vozRTFija) : vozValida(leer(VOZ_RT_FIJA_KEY));
        const timbreFijo = opciones.timbreFijo !== undefined
            ? texto(opciones.timbreFijo, 120)
            : texto(leer(TIMBRE_FIJO_KEY), 120);
        const clave = (persona || "").toLowerCase().replace(/\s+/g, "_");
        const vozRT = fija ?? VOZ_RT_POR_PERSONA[clave] ?? "F1";
        const motor = texto(opciones.motorPorPersona?.(persona), 80)
            ?? motorDelRegistro(neurona, persona) ?? "auto";
        let identidad: IdentidadVoz = { timbre: timbreFijo ?? timbrePorModo(), motor, vozRT, origen: "defecto" };
        const pasos: Array<[OrigenIdentidadVoz, EleccionVoz | undefined]> = [
            ["cuenta", almacen.cuenta],
            ["neurona", porId(almacen.porNeurona, neurona)],
            ["cerebro", porId(almacen.porCerebro, texto(contexto.cerebro, 160))],
            ["personalidad", porId(almacen.porPersonalidad, persona)],
            ["agente", porId(almacen.porAgente, texto(contexto.agente, 160))],
        ];
        for (const [origen, eleccion] of pasos) {
            const siguiente = fusionar(identidad, eleccion, origen);
            if (siguiente) identidad = siguiente;
        }
        return identidad;
    } catch {
        return { timbre: TIMBRE_PREDETERMINADO.femenina, motor: "auto", vozRT: "F1", origen: "defecto" };
    }
}
