/**
 * RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (VZF1015M · Ola 1015V)
 * Reúne los seis mapas sueltos de «qué voz tiene esta persona» (VOZ_POR_PERSONA
 * de voz-rt, los pines del registro, el catálogo de timbres, voz-rito, el
 * INSTRUCT del demonio y seedKindFor de openvoice2) en UNA pregunta:
 * `identidadVoz({ agente?, personalidad, cerebro?, neurona?, cuenta? })` con la
 * precedencia del sistema primario de Astraura (agente › personalidad › cerebro
 * › neurona › cuenta). Contrato: §3 de `architecture/voz-fusionada-astraura.md`;
 * alimenta `vozDePersona`, `timbreEfectivo` y el pin del registro. Puro: sin
 * localStorage, red ni procesos, y NUNCA lanza (los mapas se leen, no se borran).
 */

import { TIMBRES, type Timbre } from "@/lib/aurora/timbres-catalogo";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { XAI_PERSONA_LIST } from "@/lib/aurora/tts-oss/xai-persona-voices";
export type OrigenVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

/** Pista de voz que una capa aporta: su id en los mapas, o un pin explícito. */
export interface PistaVoz {
    id?: string; // id en los mapas: «astraura», «hermione», un id de personalidad…
    vozRT?: string; // pin explícito de voz rápida (F1..F5 / M1..M4, la de voz-rt)
    motor?: string; // pin explícito de motor del registro
    timbreId?: string; // pin explícito de timbre del catálogo (`TIMBRES`)
}

export interface ConsultaIdentidad {
    agente?: PistaVoz | null;
    personalidad: PistaVoz | null;
    cerebro?: PistaVoz | null;
    neurona?: PistaVoz | null;
    cuenta?: PistaVoz | null;
}

/** La identidad de voz resuelta para una persona en un momento dado. */
export interface IdentidadVoz {
    vozRT: string; // voz rápida (Supertonic) de la conversación: la de Alex es F1
    motor: string; // motor del registro para las demás vías; por defecto, supertonic
    timbre: Timbre; // timbre fijo del catálogo, la receta que suena igual en todo el OS
    origen: OrigenVoz; // qué capa mandó (o «defecto» si ninguna tenía opinión)
}

/** Espejo canónico de `VOZ_POR_PERSONA` (voz-rt): `vozDePersona` pasa a leerlo aquí. */
export const VOZ_RT_POR_PERSONA: Record<string, string> = {
    aurora: "F1", astraura: "F1", astraura_prime: "F1", atenea: "F2",
    hermione: "F3", mnemosyne: "F4", kallisti: "F5", hephaestus: "M1",
    hermes: "M2", logos: "M3", oneiros: "M4",
};

/** Motor por mapa: lo que dicen seedKindFor (openvoice2) y `XAI_PERSONA_VOICES`. */
export function motorDeMapa(idNormalizado: string): string | undefined {
    if (!idNormalizado) return undefined;
    if (seedKindFor(idNormalizado)) return "openvoice2";
    if (XAI_PERSONA_LIST.some((p) => p.id === idNormalizado)) return "xai";
    return undefined;
}

/** Timbre del catálogo por identidad conocida (el nombre del timbre coincide). */
export const TIMBRE_POR_PERSONA: Record<string, string> = {
    aurora: "fem-aurora", astraura: "fem-aurora", astraura_prime: "fem-aurora", hermes: "masc-hermes",
};

/** Normaliza el id como hacen `vozDePersona` y `seedKindFor`. */
export function normalizaPersona(id?: string | null): string {
    return (id || "").toLowerCase().replace(/\s+/g, "_");
}

const MOTOR_DEFECTO = "supertonic"; // la conversación en directo
const VOZ_RT_DEFECTO = "F1"; // la voz de Alex, conservada salvo pin o mapa
const TIMBRE_DEFECTO = "fem-aurora"; // el principal del catálogo, sin rankeo
const VOZ_RT_VALIDA = /^[FM][1-5]$/;

/** Igual que `buscarTimbre` pero PURO: solo el catálogo, sin timbres propios. */
function buscarTimbrePuro(id?: string | null): Timbre | null {
    return (id ? TIMBRES.find((t) => t.id === id) : undefined) ?? null;
}

type ResolucionCapa = { vozRT?: string; motor?: string; timbreId?: string }; // lo que aporta una capa

/** Lee los mapas para UNA capa (primero el pin explícito, luego el mapa). */
export function resuelveCapa(pista: PistaVoz | null | undefined): ResolucionCapa | null {
    if (!pista) return null;
    const id = normalizaPersona(pista.id);
    const vozRT = pista.vozRT && VOZ_RT_VALIDA.test(pista.vozRT) ? pista.vozRT : (VOZ_RT_POR_PERSONA[id] ?? undefined);
    const motor = pista.motor || motorDeMapa(id) || undefined;
    const timbreId = pista.timbreId || TIMBRE_POR_PERSONA[id] || undefined;
    if (!vozRT && !motor && !timbreId) return null;
    return { vozRT, motor, timbreId };
}
/* Un pin malformado por sí solo no borra lo que el id ya sabe en los mapas. */
function soloId(pista: PistaVoz | null | undefined): ResolucionCapa | null {
    return pista?.id ? resuelveCapa({ id: pista.id }) : null;
}

/**
 * Resuelve la identidad de voz de una persona: agente › personalidad › cerebro ›
 * neurona › cuenta. Si ninguna capa tiene voz, cae a los valores por defecto
 * (`origen: "defecto"`) que conservan la F1 de Alex. NUNCA lanza.
 */
export function identidadVoz(consulta: ConsultaIdentidad | null | undefined): IdentidadVoz {
    if (!consulta || !consulta.personalidad) return identidadDefecto();
    const capas: [OrigenVoz, PistaVoz | null | undefined][] = [
        ["agente", consulta.agente], ["personalidad", consulta.personalidad],
        ["cerebro", consulta.cerebro], ["neurona", consulta.neurona], ["cuenta", consulta.cuenta],
    ];
    for (const [origen, pista] of capas) {
        const r = resuelveCapa(pista) ?? soloId(pista);
        if (r) return conValores(r, origen);
    }
    return identidadDefecto();
}

/** El suelo que nunca falla: si ninguna capa mandó, la F1 de Alex suena igual. */
const identidadDefecto = (): IdentidadVoz =>
    conValores({ vozRT: VOZ_RT_DEFECTO, motor: MOTOR_DEFECTO, timbreId: TIMBRE_DEFECTO }, "defecto");

function conValores(r: ResolucionCapa, origen: OrigenVoz): IdentidadVoz {
    const timbre = (r.timbreId && buscarTimbrePuro(r.timbreId)) || buscarTimbrePuro(TIMBRE_DEFECTO) || TIMBRES[0];
    return { vozRT: r.vozRT ?? VOZ_RT_DEFECTO, motor: r.motor ?? MOTOR_DEFECTO, timbre, origen };
}
