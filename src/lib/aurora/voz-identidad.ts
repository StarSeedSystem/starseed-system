/**
 * VOZ-IDENTIDAD (Ola 1015V · `architecture/voz-fusionada-astraura.md` §3) — el
 * resolutor ÚNICO de la identidad de voz, con precedencia
 * agente > personalidad > cerebro > neurona > cuenta > defecto.
 * Lee los mapas existentes sin borrarlos ni sustituirlos: cada llamador inyecta
 * el suyo (voz-rt.ts pasa VOZ_POR_PERSONA tal cual). Capa PURA, SSR-safe:
 * sin window, sin red, sin disco y nunca lanza («Aurora SIEMPRE habla»).
 */

import { XAI_PERSONA_VOICES } from "@/lib/aurora/tts-oss/xai-persona-voices";

export type NivelVozIdentidad = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta";
export type OrigenVozIdentidad = NivelVozIdentidad | "defecto";

/**
 * Lo que un ámbito puede fijar: vozRT (Supertonic /api/voz-rt), timbre
 * (timbres.ts), motor (engine-registry.ts), instruct (demonio OmniVoice),
 * semilla (seedKindFor de OpenVoice2) y xai (voz built-in de xAI).
 */
export interface NivelIdentidadVoz {
    vozRT?: string;
    timbre?: string;
    motor?: string;
    instruct?: string;
    semilla?: string;
    xai?: string;
}

/** Entrada: id de la personalidad activa (activa los mapas) + lo fijado por ámbito. */
export interface EntradaIdentidadVoz {
    personalidadId?: string;
    agente?: NivelIdentidadVoz;
    personalidad?: NivelIdentidadVoz;
    cerebro?: NivelIdentidadVoz;
    neurona?: NivelIdentidadVoz;
    cuenta?: NivelIdentidadVoz;
}

/** Los mapas existentes que el llamador inyecta (esta tarea no los toca). */
export interface MapasPersonalidadVoz {
    /** VOZ_POR_PERSONA de voz-rt.ts (personalidad → «F1»…«M5»). */
    vozPorPersona?: Record<string, string>;
    /** XAI_PERSONA_VOICES de xai-persona-voices.ts (personalidad → voz xAI). */
    xaiPorPersona?: Record<string, string>;
    /** seedKindFor de openvoice2.ts, como función o como tabla. */
    semillaPorPersona?: ((personaId?: string) => string | null) | Record<string, string>;
}

/** La identidad COMPLETA + el ámbito más específico que fijó algo. */
export interface VozIdentidad {
    vozRT: string;
    timbre: string;
    motor: string;
    instruct?: string;
    semilla?: string;
    xai?: string;
    origen: OrigenVozIdentidad;
}

/** El suelo: la voz F1 de Alex (Aurora) y el timbre insignia se conservan. */
export const DEFECTO_IDENTIDAD: VozIdentidad = {
    vozRT: "F1",
    timbre: "fem-aurora",
    motor: "auto",
    origen: "defecto",
};

/** Misma llave que vozDePersona (voz-rt.ts): minúsculas y espacios → guion bajo. */
export function clavePersona(personaId?: string | null): string {
    return (personaId || "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** El mapa xAI existente en forma plana (las cinco voces por defecto). */
export function xaiPorDefecto(): Record<string, string> {
    const plano: Record<string, string> = {};
    for (const v of Object.values(XAI_PERSONA_VOICES)) plano[v.id] = v.voice;
    return plano;
}

/** Cadena vacía o gigante no cuenta: la basura guardada nunca manda. */
function limpiar(v: unknown, max = 120): string | undefined {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s && s.length <= max ? s : undefined;
}

/** vozRT solo vale con el formato del voz-rt («F1»…«M5»); el resto se ignora. */
function vozRTValida(v: unknown): string | undefined {
    const s = limpiar(v, 4);
    return s && /^[FM][1-5]$/.test(s) ? s : undefined;
}

/** Capas en orden del contrato, con la personalidad expandida por los mapas. */
function nivelesDe(
    e: EntradaIdentidadVoz,
    m: MapasPersonalidadVoz,
): Array<{ origen: OrigenVozIdentidad; n: NivelIdentidadVoz }> {
    const clave = clavePersona(e.personalidadId);
    const p = e.personalidad ?? {};
    const semilla = m.semillaPorPersona;
    const semillaMapa = semilla
        ? typeof semilla === "function"
            ? semilla(e.personalidadId)
            : semilla[clave]
        : undefined;
    return [
        { origen: "agente", n: e.agente ?? {} },
        {
            origen: "personalidad",
            n: {
                ...p,
                vozRT: vozRTValida(p.vozRT) ?? vozRTValida(m.vozPorPersona?.[clave]),
                xai: limpiar(p.xai) ?? limpiar(m.xaiPorPersona?.[clave]),
                semilla: limpiar(p.semilla) ?? limpiar(semillaMapa),
            },
        },
        { origen: "cerebro", n: e.cerebro ?? {} },
        { origen: "neurona", n: e.neurona ?? {} },
        { origen: "cuenta", n: e.cuenta ?? {} },
    ];
}

/** Validadores por campo: nada lanza, nada toca red ni disco. */
const VALIDADORES: Record<keyof NivelIdentidadVoz, (v: unknown) => string | undefined> = {
    vozRT: vozRTValida,
    timbre: limpiar,
    motor: limpiar,
    instruct: limpiar,
    semilla: limpiar,
    xai: limpiar,
};

/** Resuelve la identidad COMPLETA: por campo gana el ámbito más específico; lo
 * que nadie fijó cae al suelo (DEFECTO_IDENTIDAD: la voz F1 de Alex). */
export function vozIdentidad(entrada: EntradaIdentidadVoz = {}, mapas: MapasPersonalidadVoz = {}): VozIdentidad {
    const salida: VozIdentidad = { ...DEFECTO_IDENTIDAD };
    const fijados = new Set<keyof NivelIdentidadVoz>();
    let primerOrigen: OrigenVozIdentidad | null = null;
    for (const capa of nivelesDe(entrada, mapas)) {
        for (const campo of Object.keys(VALIDADORES) as Array<keyof NivelIdentidadVoz>) {
            if (fijados.has(campo)) continue; // el ámbito más específico ya lo decidió
            const valor = VALIDADORES[campo](capa.n[campo]);
            if (!valor) continue;
            (salida as unknown as Record<string, unknown>)[campo] = valor;
            fijados.add(campo);
            primerOrigen ??= capa.origen;
        }
    }
    return { ...salida, origen: primerOrigen ?? "defecto" };
}
