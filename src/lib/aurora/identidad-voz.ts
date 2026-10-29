/**
 * RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (Ola 1015V · tarea VZF1015M).
 * Había seis mapas de «qué voz tiene esta persona» sin coordinar: VOZ_POR_PERSONA
 * (voz-rt), los pines del registro de motores, el timbre de voz-inicial/voz-rito,
 * el INSTRUCT del demonio OmniVoice, seedKindFor (openvoice2) y xai-persona-voices.
 * Este módulo es LA única puerta: precedencia agente › personalidad › cerebro ›
 * neurona › cuenta (la misma regla del sistema primario de Astraura) y, sin pin
 * de ninguna capa, los mapas vivos por personalidad. Los mapas NO se borran ni se
 * duplican: se siguen leyendo de donde están; este módulo sólo pone de acuerdo.
 * PURA: sin red, sin disco, sin procesos, sin `window`. «Aurora SIEMPRE habla»
 * (aurora-voz-motores.md §0): ninguna función de aquí lanza.
 */

import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import { XAI_PERSONA_VOICES, isXaiPersonaId } from "@/lib/aurora/tts-oss/xai-persona-voices";

/** De qué capa salió la identidad ganadora (la que habla de verdad). */
export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

/** La voz que una capa del sistema pide. */
export interface PautaVoz {
    /** Motor del registro de voz (supertonic, openvoice2, xai, omnivoice…). */
    motor?: string;
    /** Timbre: id del catálogo, semilla OpenVoice2 o voz built-in de xAI. */
    timbre?: string;
    /** Voz en tiempo real de la conversación (Supertonic, F1..M5). */
    vozRT?: string;
}

/** Qué capa pide voz. `personalidad` admite el id («aurora») o una pauta ya hecha. */
export interface EntradaIdentidadVoz {
    agente?: PautaVoz | null;
    personalidad?: string | PautaVoz | null;
    cerebro?: PautaVoz | null;
    neurona?: PautaVoz | null;
    cuenta?: PautaVoz | null;
    /** Sin ningún pin: lo que responde igual que antes (voz F1 de Alex). */
    porDefecto?: PautaVoz;
    /** Mapa persona → voz de tiempo real real (p. ej. VOZ_POR_PERSONA de voz-rt). */
    mapaVozRT?: Record<string, string>;
}

/** La identidad de voz ganadora: quién habla, cómo y desde qué capa. */
export interface IdentidadVoz {
    motor: string;
    timbre: string;
    vozRT: string;
    origen: OrigenIdentidadVoz;
}

/** Supertonic es el motor de la conversación en vivo (voz_rt.py). */
export const MOTOR_VOZ_DEFECTO = "supertonic";
/** Sin timbre elegido por nadie: cada motor usa el suyo; nada raro de fábrica. */
export const TIMBRE_DEFECTO = "neutro";
/** La voz F1 de Alex: por defecto y cuando ningún mapa conozca a la personalidad. */
export const VOZ_RT_DEFECTO = "F1";

/** El orden manda: la primera capa que pida voz gana (precedencia de Astraura). */
const CAPAS = ["agente", "personalidad", "cerebro", "neurona", "cuenta"] as const;

function sinVacios(p: PautaVoz | null | undefined): PautaVoz | null {
    if (!p || typeof p !== "object") return null;
    const limpia: PautaVoz = {
        motor: p.motor?.trim() || undefined,
        timbre: p.timbre?.trim() || undefined,
        vozRT: p.vozRT?.trim() || undefined,
    };
    return limpia.motor || limpia.timbre || limpia.vozRT ? limpia : null;
}

/** Completa una pauta parcial con los defectos: nunca sale una identidad incompleta. */
function completa(p: PautaVoz | null | undefined): { motor: string; timbre: string; vozRT: string } {
    return {
        motor: p?.motor ?? MOTOR_VOZ_DEFECTO,
        timbre: p?.timbre ?? TIMBRE_DEFECTO,
        vozRT: p?.vozRT ?? VOZ_RT_DEFECTO,
    };
}

/** La personalidad según los mapas que ya existen: la semilla curada de OpenVoice2
 * («hermione», «aurora», la MISMA regla de `seedKindFor`), la voz built-in de xAI
 * (astraura, council, moa, aurora, hermione) y el mapa de voz RT que pase quien llama. */
export function pautaPersonalidad(
    personaId?: string | null,
    mapaVozRT?: Record<string, string>,
): PautaVoz | null {
    const id = (personaId || "").toLowerCase().replace(/\s+/g, "_");
    if (!id) return null;
    const semilla = seedKindFor(id);
    const vozXAI = isXaiPersonaId(id) ? XAI_PERSONA_VOICES[id].voice : null;
    const vozRT = mapaVozRT?.[id];
    if (!semilla && !vozXAI && !vozRT) return null;
    return {
        motor: semilla ? "openvoice2" : vozXAI ? "xai" : MOTOR_VOZ_DEFECTO,
        timbre: semilla ?? vozXAI ?? TIMBRE_DEFECTO,
        ...(vozRT ? { vozRT } : {}),
    };
}

export function identidadVoz(entrada: EntradaIdentidadVoz): IdentidadVoz {
    const defecto: IdentidadVoz = { ...completa(sinVacios(entrada.porDefecto)), origen: "defecto" };
    for (const capa of CAPAS) {
        const dato = entrada[capa as keyof EntradaIdentidadVoz];
        const bruta =
            typeof dato === "string" ? pautaPersonalidad(dato, entrada.mapaVozRT) : (dato as PautaVoz | null);
        const pauta = sinVacios(bruta);
        if (!pauta) continue;
        return {
            motor: pauta.motor ?? defecto.motor,
            timbre: pauta.timbre ?? defecto.timbre,
            vozRT: pauta.vozRT ?? defecto.vozRT,
            origen: capa,
        };
    }
    return defecto;
}
