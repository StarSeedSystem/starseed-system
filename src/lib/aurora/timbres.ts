"use client";

/**
 * CATÁLOGO DE TIMBRES DE ASTRAURA (Adenda 213 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISIÓN DE ARQUITECTURA (Alex, explícito): **la voz NO se apoya en el motor
 * de Apple**. Debe funcionar en cualquier dispositivo con el sistema de voz
 * 1.58-bit, local y con la mayor eficiencia.
 *
 * Por qué importa, más allá de la preferencia: un modelo cuantizado a 1.58 bits
 * (pesos ternarios −1/0/+1) no necesita GPU ni multiplicaciones en coma
 * flotante — le bastan sumas en CPU. Es lo que permite que un móvil viejo y un
 * portátil sin gráfica corran lo mismo. Apoyarse en las voces del sistema haría
 * lo contrario: cada equipo suena distinto, y en el de Alex se midió que de 18
 * voces españolas solo 2 son naturales y las 16 restantes son voces de
 * personaje. Eso no es una base sobre la que construir.
 *
 * Por eso cada timbre se define PRIMERO sobre el motor local (voces neuronales
 * `ef_dora`, `em_alex`, `em_santa`, que viajan con el modelo y suenan igual en
 * todos los equipos) y solo lleva un respaldo del sistema para no quedarse
 * mudo mientras el modelo local no esté instalado.
 *
 * Un timbre es una RECETA FIJA. Antes se ranqueaban voces en cada pulsación y
 * por eso «no sonaban en sus botones correctos»: la misma etiqueta acababa en
 * voces distintas según lo que el navegador tuviera cargado. Aquí no se decide
 * nada en el momento.
 */

import type { VoiceGender } from "@/lib/aurora/personalities";

export interface Timbre {
    id: string;
    /** Nombre propio: lo que se ve en el botón. */
    nombre: string;
    genero: VoiceGender;
    desc: string;
    /** Receta en el MOTOR LOCAL (la que manda). */
    local: { voz: string; speed: number };
    /** Respaldo con voz del sistema, solo mientras no esté el motor local. */
    sistema: { bases: string[]; pitch: number; rate: number };
}

/** Voces de personaje de Apple: nunca por defecto (suenan a caricatura). */
const VOCES_PERSONAJE = ["eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley", "bells", "boing", "bubbles", "jester", "organ", "superstar", "trinoids", "whisper", "wobble", "zarvox"];

/**
 * Cuatro variedades por género. En el motor local se distinguen por voz y
 * velocidad —lo que un modelo neuronal expone de verdad—; el respaldo del
 * sistema imita cada carácter con tono y ritmo.
 */
export const TIMBRES: Timbre[] = [
    // ── Femeninas · voz neuronal ef_dora ────────────────────────────────────
    // Natural de verdad: por eso la femenina deja de sonar robótica. El
    // respaldo parte de Paulina y SIN subir el tono (subirlo era lo que la
    // volvía metálica sobre Mónica).
    { id: "fem-aurora", nombre: "Aurora", genero: "femenina", desc: "Cálida y natural", local: { voz: "ef_dora", speed: 1.0 }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.0, rate: 0.98 } },
    { id: "fem-luna", nombre: "Luna", genero: "femenina", desc: "Clara y luminosa", local: { voz: "ef_dora", speed: 1.12 }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.09, rate: 1.05 } },
    { id: "fem-vega", nombre: "Vega", genero: "femenina", desc: "Serena y envolvente", local: { voz: "ef_dora", speed: 0.9 }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.95, rate: 0.92 } },
    { id: "fem-iris", nombre: "Iris", genero: "femenina", desc: "Ágil y despierta", local: { voz: "ef_dora", speed: 1.22 }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.04, rate: 1.15 } },

    // ── Masculinas · voces neuronales em_alex / em_santa ────────────────────
    { id: "masc-orion", nombre: "Orión", genero: "masculina", desc: "Grave y sereno", local: { voz: "em_alex", speed: 0.96 }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.74, rate: 0.95 } },
    { id: "masc-atlas", nombre: "Atlas", genero: "masculina", desc: "Firme y rotundo", local: { voz: "em_santa", speed: 0.9 }, sistema: { bases: ["Jorge", "Diego", "Mónica", "Monica", "Paulina"], pitch: 0.66, rate: 0.92 } },
    { id: "masc-hermes", nombre: "Hermes", genero: "masculina", desc: "Cercano y ágil", local: { voz: "em_alex", speed: 1.14 }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.82, rate: 1.06 } },
    { id: "masc-kepler", nombre: "Kepler", genero: "masculina", desc: "Suave y pausado", local: { voz: "em_santa", speed: 1.02 }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.79, rate: 0.88 } },

    // ── Neutras ─────────────────────────────────────────────────────────────
    { id: "neu-zenit", nombre: "Zenit", genero: "neutra", desc: "Timbre equilibrado", local: { voz: "em_alex", speed: 1.04 }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 0.88, rate: 1.0 } },
    { id: "neu-eco", nombre: "Eco", genero: "neutra", desc: "Sin marca de género", local: { voz: "ef_dora", speed: 0.94 }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.9, rate: 0.97 } },
    { id: "neu-nova", nombre: "Nova", genero: "neutra", desc: "Brillante y neutra", local: { voz: "em_alex", speed: 1.16 }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 0.95, rate: 1.05 } },
    { id: "neu-solis", nombre: "Solis", genero: "neutra", desc: "Amplia y calmada", local: { voz: "em_santa", speed: 1.08 }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.85, rate: 0.93 } },
];

export const TIMBRE_PREDETERMINADO: Record<VoiceGender, string> = {
    femenina: "fem-aurora",
    masculina: "masc-orion",
    neutra: "neu-zenit",
};

/**
 * La voz autónoma parte de NEUTRA, como pidió Alex: es la base más libre de
 * marca sobre la que modular, y no arrastra un género antes de que la
 * personalidad decida el suyo.
 */
export const TIMBRE_AUTONOMO_BASE = "neu-zenit";

const CLAVE = "starseed.voz.timbre.v1";
const CLAVE_PROPIOS = "starseed.voz.timbres-propios.v1";

export function timbresDe(genero: VoiceGender): Timbre[] {
    return [...TIMBRES.filter((t) => t.genero === genero), ...timbresPropios().filter((t) => t.genero === genero)];
}

export function timbresPropios(): Timbre[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(CLAVE_PROPIOS);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(arr) ? (arr as Timbre[]) : [];
    } catch {
        return [];
    }
}

export function guardarTimbrePropio(t: Timbre): void {
    if (typeof window === "undefined") return;
    try {
        const lista = [...timbresPropios().filter((x) => x.id !== t.id), t].slice(-6);
        window.localStorage.setItem(CLAVE_PROPIOS, JSON.stringify(lista));
    } catch { /* sin almacenamiento */ }
}

export function buscarTimbre(id: string): Timbre | null {
    return TIMBRES.find((t) => t.id === id) ?? timbresPropios().find((t) => t.id === id) ?? null;
}

export function timbreActual(genero: VoiceGender): Timbre {
    if (typeof window !== "undefined") {
        try {
            const id = window.localStorage.getItem(CLAVE);
            const t = id ? buscarTimbre(id) : null;
            if (t && t.genero === genero) return t;
        } catch { /* sin almacenamiento */ }
    }
    return buscarTimbre(TIMBRE_PREDETERMINADO[genero]) ?? TIMBRES[0];
}

export function fijarTimbre(id: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(CLAVE, id); } catch { /* */ }
}

/**
 * Genera un timbre ÚNICO al azar dentro de rangos que siempre suenan bien:
 * nada de extremos que conviertan la voz en un chirrido o un gruñido.
 */
export function generarTimbreUnico(genero: VoiceGender): Timbre {
    const vocesLocales = genero === "femenina" ? ["ef_dora"]
        : genero === "masculina" ? ["em_alex", "em_santa"]
        : ["em_alex", "ef_dora", "em_santa"];
    const voz = vocesLocales[Math.floor(Math.random() * vocesLocales.length)];
    const speed = +(0.88 + Math.random() * 0.4).toFixed(3);

    const rango = genero === "masculina" ? [0.62, 0.86]
        : genero === "neutra" ? [0.82, 0.98]
        : [0.94, 1.14];
    const pitch = +(rango[0] + Math.random() * (rango[1] - rango[0])).toFixed(3);
    const rate = +(0.9 + Math.random() * 0.25).toFixed(3);

    const t: Timbre = {
        id: `propio-${Date.now().toString(36)}`,
        nombre: `Tuya ${timbresPropios().length + 1}`,
        genero,
        desc: `Única · ritmo ${speed.toFixed(2)}`,
        local: { voz, speed },
        sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch, rate },
    };
    guardarTimbrePropio(t);
    return t;
}

export function esVozPersonaje(nombre: string): boolean {
    const n = (nombre || "").toLowerCase();
    return VOCES_PERSONAJE.some((p) => n.includes(p));
}

/**
 * Voz del sistema para el RESPALDO. Nunca devuelve una voz de personaje: antes
 * que sonar a caricatura, se prefiere quedarse sin respaldo y decirlo.
 */
export function vozDelTimbre(t: Timbre, voces?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    let lista: SpeechSynthesisVoice[] = [];
    try { lista = voces ?? window.speechSynthesis.getVoices(); } catch { return null; }
    if (!lista.length) return null;

    for (const base of t.sistema.bases) {
        const v = lista.find((x) => x.name === base || x.name.startsWith(`${base} `));
        if (v) return v;
    }
    return lista.find((v) => /^es/i.test(v.lang) && !esVozPersonaje(v.name)) ?? null;
}
