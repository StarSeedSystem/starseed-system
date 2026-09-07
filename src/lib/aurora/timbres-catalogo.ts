/**
 * CATÁLOGO PURO DE TIMBRES DE ASTRAURA (Ola 275 · Tarea V5A · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * División del catálogo original `timbres.ts` para arreglar el build ligero:
 * este módulo es de SERVIDOR (sin `"use client"`) y NO toca localStorage, de
 * modo que las rutas `/api/mando/*` pueden importar `TIMBRES` sin que en el
 * bundle de servidor se conviertan en referencias de cliente (`B.TIMBRES.map
 * is not a function`). La UI sigue importando desde `timbres.ts`, que lo
 * reexporta sin cambiar su API.
 */

import type { VoiceGender } from "@/lib/aurora/personalities";
import type { EmocionVoz } from "@/lib/voces/emociones";
// (Ola 265) Solo se importa el TIPO de efectos para no arrastrar el módulo.
import type { EfectosVoz } from "@/lib/voces/efectos";

export interface Timbre {
    id: string;
    /** Nombre propio: lo que se ve en el botón. */
    nombre: string;
    genero: VoiceGender;
    desc: string;
    local: { voz: string; speed: number; instruct?: string; ref?: string; seed?: number; pitch?: number; efectos?: EfectosVoz; clon?: boolean };
    /** Respaldo con voz del sistema, solo mientras no esté el motor local. */
    sistema: { bases: string[]; pitch: number; rate: number };
    expr: { arco: number; vivacidad: number; calidez: number };
    emocionBase?: EmocionVoz;
    intensidad?: number;
}

/** Voces de personaje de Apple: nunca por defecto (suenan a caricatura). */
const VOCES_PERSONAJE = ["eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley", "bells", "boing", "bubbles", "jester", "organ", "superstar", "trinoids", "whisper", "wobble", "zarvox"];

/**
 * Cuatro variedades por género. En el motor local se distinguen por voz y
 * velocidad; el respaldo del sistema imita cada carácter con tono y ritmo.
 */
export const TIMBRES: Timbre[] = [
    { id: "fem-aurora", nombre: "Aurora", genero: "femenina", desc: "Cálida, cercana y natural", local: { voz: "ef_dora", speed: 1.0, instruct: "female, young adult, moderate pitch" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.0, rate: 0.94 }, expr: { arco: 0.16, vivacidad: 0.1, calidez: 0.14 } },
    { id: "fem-luna", nombre: "Luna", genero: "femenina", desc: "Luminosa y expresiva", local: { voz: "ef_dora", speed: 1.14, instruct: "female, young adult, high pitch" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.16, rate: 1.08 }, expr: { arco: 0.22, vivacidad: 0.2, calidez: 0.1 } },
    { id: "fem-vega", nombre: "Vega", genero: "femenina", desc: "Profunda y envolvente", local: { voz: "ef_dora", speed: 0.86, instruct: "female, middle-aged, low pitch" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.86, rate: 0.86 }, expr: { arco: 0.1, vivacidad: 0.05, calidez: 0.06 } },
    { id: "fem-iris", nombre: "Iris", genero: "femenina", desc: "Ágil, viva y despierta", local: { voz: "ef_dora", speed: 1.28, instruct: "female, teenager, very high pitch" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.08, rate: 1.22 }, expr: { arco: 0.26, vivacidad: 0.28, calidez: 0.12 } },
    { id: "masc-orion", nombre: "Orión", genero: "masculina", desc: "Grave y sereno", local: { voz: "em_alex", speed: 0.94, instruct: "male, middle-aged, low pitch" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.72, rate: 0.92 }, expr: { arco: 0.13, vivacidad: 0.08, calidez: 0.08 } },
    { id: "masc-atlas", nombre: "Atlas", genero: "masculina", desc: "Rotundo y solemne", local: { voz: "em_santa", speed: 0.86, instruct: "male, elderly, very low pitch" }, sistema: { bases: ["Jorge", "Diego", "Mónica", "Monica", "Paulina"], pitch: 0.6, rate: 0.84 }, expr: { arco: 0.08, vivacidad: 0.04, calidez: 0.04 } },
    { id: "masc-hermes", nombre: "Hermes", genero: "masculina", desc: "Cercano y conversacional", local: { voz: "em_alex", speed: 1.18, instruct: "male, young adult, moderate pitch" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.86, rate: 1.12 }, expr: { arco: 0.24, vivacidad: 0.26, calidez: 0.16 } },
    { id: "masc-kepler", nombre: "Kepler", genero: "masculina", desc: "Suave y reflexivo", local: { voz: "em_santa", speed: 1.02, instruct: "male, middle-aged, moderate pitch" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.78, rate: 0.8 }, expr: { arco: 0.11, vivacidad: 0.06, calidez: 0.1 } },
    { id: "neu-zenit", nombre: "Zenit", genero: "neutra", desc: "Equilibrado y claro", local: { voz: "em_alex", speed: 1.06, instruct: "young adult, moderate pitch" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 0.9, rate: 1.0 }, expr: { arco: 0.15, vivacidad: 0.14, calidez: 0.1 } },
    { id: "neu-eco", nombre: "Eco", genero: "neutra", desc: "Sereno, sin marca", local: { voz: "ef_dora", speed: 0.92, instruct: "middle-aged, low pitch, whisper" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.94, rate: 0.9 }, expr: { arco: 0.1, vivacidad: 0.07, calidez: 0.07 } },
    { id: "neu-nova", nombre: "Nova", genero: "neutra", desc: "Brillante y despierto", local: { voz: "em_alex", speed: 1.22, instruct: "teenager, high pitch" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.02, rate: 1.16 }, expr: { arco: 0.23, vivacidad: 0.24, calidez: 0.13 } },
    { id: "neu-solis", nombre: "Solis", genero: "neutra", desc: "Amplio y calmado", local: { voz: "em_santa", speed: 1.1, instruct: "elderly, very low pitch" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.82, rate: 0.88 }, expr: { arco: 0.12, vivacidad: 0.06, calidez: 0.09 } },
];

export const TIMBRE_PREDETERMINADO: Record<VoiceGender, string> = {
    femenina: "fem-aurora",
    masculina: "masc-orion",
    neutra: "neu-zenit",
};

/**
 * La voz autónoma parte de NEUTRA: es la base más libre de marca sobre la que
 * modular, y no arrastra un género antes de que la personalidad decida el suyo.
 */
export const TIMBRE_AUTONOMO_BASE = "neu-zenit";

export function esVozPersonaje(nombre: string): boolean {
    const n = (nombre || "").toLowerCase();
    return VOCES_PERSONAJE.some((p) => n.includes(p));
}