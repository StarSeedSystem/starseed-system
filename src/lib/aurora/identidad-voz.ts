/**
 * IDENTIDAD DE VOZ POR PERSONA — un solo resolutor (Ola 1015V · Tarea 1015M).
 * Había seis mapas de «qué voz tiene esta persona» sin coordinarse: el
 * VOZ_POR_PERSONA de voz-rt, los pines del registro (personalityVoiceEnginePin),
 * timbres/voz-inicial/voz-rito, el instruct del demonio (daemon.ts), la semilla
 * curada de OpenVoice2 (seedKindFor) y las voces xAI (xai-persona-voices).
 * NINGUNO se borra: siguen vivos en su módulo; este resolutor los coordina con la
 * precedencia agente › personalidad › cerebro › neurona › cuenta › defecto
 * (architecture/voz-fusionada-astraura.md §3) y alimenta a `vozDePersona`, a
 * `timbreEfectivo` y al pin del registro.
 */

import type { VoiceGender } from "@/lib/aurora/personalities";
import { TIMBRES, TIMBRE_PREDETERMINADO } from "@/lib/aurora/timbres-catalogo";

export type OrigenVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

/** Lo que una capa puede fijar de la voz (cada campo es opcional). */
export interface CapaVoz {
    id?: string;
    timbre?: string | null;
    motor?: string | null;
    vozRT?: string | null;
}

/** Las capas de precedencia, tal como el contrato del área manda. */
export interface EntradaIdentidadVoz {
    agente?: CapaVoz | null;
    personalidad?: string | CapaVoz | null;
    cerebro?: CapaVoz | null;
    neurona?: CapaVoz | null;
    cuenta?: CapaVoz | null;
}

/** Identidad de voz resuelta para UNA persona. */
export interface IdentidadVoz {
    timbre: string;
    motor: string;
    vozRT: string;
    origen: OrigenVoz;
}

export function nombrarPersona(id?: string | null): string {
    return (id || "").toLowerCase().replace(/\s+/g, "_").trim();
}

function texto(v: string | null | undefined): string {
    return (v ?? "").trim();
}

function vozRTDe(v: string | null | undefined): string | null {
    const t = texto(v).toUpperCase();
    return /^[FM][1-5]$/.test(t) ? t : null;
}

/** El timbre debe existir: catálogo base o el formato de un timbre propio del OS. */
function timbreDe(v: string | null | undefined): string | null {
    const t = texto(v);
    if (!t) return null;
    return TIMBRES.some((x) => x.id === t) || t.startsWith("propio-") || t.startsWith("clon-") ? t : null;
}

function motorDe(v: string | null | undefined): string | null {
    const t = texto(v).toLowerCase();
    return t ? t : null;
}

/** Timbre por defecto: predeterminado del género que sugiere la voz; Hermes tiene el suyo. */
function timbreDefecto(idPersona: string, vozRT: string): string {
    if (nombrarPersona(idPersona).includes("hermes")) return "masc-hermes";
    const genero: VoiceGender = vozRT.startsWith("M") ? "masculina" : vozRT.startsWith("F") ? "femenina" : "neutra";
    return TIMBRE_PREDETERMINADO[genero];
}

/** La capa de personalidad acepta el id a secas (string) o una capa completa. */
function capaDePersona(p: EntradaIdentidadVoz["personalidad"]): CapaVoz | undefined {
    if (!p) return undefined;
    if (typeof p === "string") { const id = nombrarPersona(p); return id ? { id } : undefined; }
    const id = nombrarPersona(p.id);
    return { ...(id ? { id } : {}), timbre: texto(p.timbre) || null, motor: texto(p.motor) || null, vozRT: texto(p.vozRT) || null };
}

/**
 * Resuelve la identidad de voz (ver cabecera). Cada faceta baja la pila POR
 * SEPARADO — un agente que fija el motor no borra la voz rápida que ya decidió
 * la personalidad — y `origen` es la capa de mayor precedencia que decidió algo.
 * Los valores inválidos se ignoran como si la capa no los hubiera dado.
 */
export function identidadVoz(entrada: EntradaIdentidadVoz = {}): IdentidadVoz {
    const persona = capaDePersona(entrada.personalidad);
    const capas: Array<[OrigenVoz, CapaVoz | null | undefined]> = [
        ["agente", entrada.agente],
        ["personalidad", persona],
        ["cerebro", entrada.cerebro],
        ["neurona", entrada.neurona],
        ["cuenta", entrada.cuenta],
    ];
    let timbre = "";
    let motor = "";
    let vozRT = "";
    let origen: OrigenVoz | null = null;
    for (const [nombre, capa] of capas) {
        const c: CapaVoz = capa ?? {};
        const t = vozRTDe(c.vozRT);
        if (t && !vozRT) { vozRT = t; origen = origen ?? nombre; }
        const m = motorDe(c.motor);
        if (m && !motor) { motor = m; origen = origen ?? nombre; }
        const b = timbreDe(c.timbre);
        if (b && !timbre) { timbre = b; origen = origen ?? nombre; }
    }
    // Defectos: la voz F1 de Alex, el motor que siempre está configurado y el
    // timbre coherente con la voz que quedó resuelta.
    if (!vozRT) vozRT = "F1";
    if (!timbre) timbre = timbreDefecto(persona?.id ?? "", vozRT);
    return { timbre, motor: motor || "omnivoice", vozRT, origen: origen ?? "defecto" };
}
