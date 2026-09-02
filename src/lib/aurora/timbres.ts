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
    /**
     * Receta en el MOTOR LOCAL (la que manda).
     *  · voz      — voz del motor WASM (Kokoro) si se usa esa vía.
     *  · speed    — velocidad.
     *  · instruct — (Adenda 217) instrucción de estilo para el motor neuronal
     *               local (OmniVoice): el CARÁCTER, en palabras. Es lo que
     *               Chatterbox llama «exaggeration»/estilo y VoxCPM «prosodia
     *               consciente del contexto»: aquí viaja como texto.
     *  · ref      — WAV de referencia para clonar (la voz de Aurora), si aplica.
     */
    local: { voz: string; speed: number; instruct?: string; ref?: string };
    /** Respaldo con voz del sistema, solo mientras no esté el motor local. */
    sistema: { bases: string[]; pitch: number; rate: number };
    /**
     * (Adenda 215) CARÁCTER. Un TTS plano suena a robot porque dice todas las
     * frases con el mismo tono y la misma prisa; una persona no. Estos tres
     * números son lo que convierte una voz en un personaje:
     *
     *  · arco      — cuánto CAE el tono del principio al final de la frase.
     *                La declinación entonativa es la señal más fuerte de habla
     *                natural: sin ella suena a lista de la compra.
     *  · vivacidad — cuánto varía la velocidad entre cláusulas. Alto = ágil y
     *                conversacional; bajo = pausado y solemne.
     *  · calidez   — cuánto se abre el tono en las cláusulas de apertura, que
     *                es lo que se percibe como cercanía o distancia.
     */
    expr: { arco: number; vivacidad: number; calidez: number };
}

/** Voces de personaje de Apple: nunca por defecto (suenan a caricatura). */
const VOCES_PERSONAJE = ["eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley", "bells", "boing", "bubbles", "jester", "organ", "superstar", "trinoids", "whisper", "wobble", "zarvox"];

/**
 * Cuatro variedades por género. En el motor local se distinguen por voz y
 * velocidad —lo que un modelo neuronal expone de verdad—; el respaldo del
 * sistema imita cada carácter con tono y ritmo.
 */
export const TIMBRES: Timbre[] = [
    // ── Femeninas · voz neuronal ef_dora ──────────────────────────────────────────
    { id: "fem-aurora", nombre: "Aurora", genero: "femenina", desc: "Cálida, cercana y natural", local: { voz: "ef_dora", speed: 1.0, instruct: "cálida, cercana y serena, como quien acompaña", ref: "/Users/alex/.starseed/astraura-voice/refs/aurora.wav" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.0, rate: 0.94 }, expr: { arco: 0.16, vivacidad: 0.1, calidez: 0.14 } },
    { id: "fem-luna", nombre: "Luna", genero: "femenina", desc: "Luminosa y expresiva", local: { voz: "ef_dora", speed: 1.14, instruct: "luminosa, alegre y expresiva", ref: "/Users/alex/.starseed/astraura-voice/refs/aurora.wav" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.16, rate: 1.08 }, expr: { arco: 0.22, vivacidad: 0.2, calidez: 0.1 } },
    { id: "fem-vega", nombre: "Vega", genero: "femenina", desc: "Profunda y envolvente", local: { voz: "ef_dora", speed: 0.86, instruct: "grave, envolvente y pausada", ref: "/Users/alex/.starseed/astraura-voice/refs/aurora.wav" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.86, rate: 0.86 }, expr: { arco: 0.1, vivacidad: 0.05, calidez: 0.06 } },
    { id: "fem-iris", nombre: "Iris", genero: "femenina", desc: "Ágil, viva y despierta", local: { voz: "ef_dora", speed: 1.28, instruct: "ágil, vivaz y despierta", ref: "/Users/alex/.starseed/astraura-voice/refs/aurora.wav" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.08, rate: 1.22 }, expr: { arco: 0.26, vivacidad: 0.28, calidez: 0.12 } },
    // ── Masculinas · em_alex / em_santa ──────────────────────────────────────────
    { id: "masc-orion", nombre: "Orión", genero: "masculina", desc: "Grave y sereno", local: { voz: "em_alex", speed: 0.94, instruct: "voz masculina grave, serena y segura" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.72, rate: 0.92 }, expr: { arco: 0.13, vivacidad: 0.08, calidez: 0.08 } },
    { id: "masc-atlas", nombre: "Atlas", genero: "masculina", desc: "Rotundo y solemne", local: { voz: "em_santa", speed: 0.86, instruct: "voz masculina profunda, rotunda y solemne" }, sistema: { bases: ["Jorge", "Diego", "Mónica", "Monica", "Paulina"], pitch: 0.6, rate: 0.84 }, expr: { arco: 0.08, vivacidad: 0.04, calidez: 0.04 } },
    { id: "masc-hermes", nombre: "Hermes", genero: "masculina", desc: "Cercano y conversacional", local: { voz: "em_alex", speed: 1.18, instruct: "voz masculina cercana, ágil y conversacional" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.86, rate: 1.12 }, expr: { arco: 0.24, vivacidad: 0.26, calidez: 0.16 } },
    { id: "masc-kepler", nombre: "Kepler", genero: "masculina", desc: "Suave y reflexivo", local: { voz: "em_santa", speed: 1.02, instruct: "voz masculina suave, reflexiva y pausada" }, sistema: { bases: ["Jorge", "Diego", "Paulina", "Mónica", "Monica"], pitch: 0.78, rate: 0.8 }, expr: { arco: 0.11, vivacidad: 0.06, calidez: 0.1 } },
    // ── Neutras ──────────────────────────────────────────
    { id: "neu-zenit", nombre: "Zenit", genero: "neutra", desc: "Equilibrado y claro", local: { voz: "em_alex", speed: 1.06, instruct: "timbre neutro, equilibrado y claro" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 0.9, rate: 1.0 }, expr: { arco: 0.15, vivacidad: 0.14, calidez: 0.1 } },
    { id: "neu-eco", nombre: "Eco", genero: "neutra", desc: "Sereno, sin marca", local: { voz: "ef_dora", speed: 0.92, instruct: "timbre neutro, sereno y sin marca de género" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.94, rate: 0.9 }, expr: { arco: 0.1, vivacidad: 0.07, calidez: 0.07 } },
    { id: "neu-nova", nombre: "Nova", genero: "neutra", desc: "Brillante y despierto", local: { voz: "em_alex", speed: 1.22, instruct: "timbre neutro, brillante y despierto" }, sistema: { bases: ["Paulina", "Mónica", "Monica"], pitch: 1.02, rate: 1.16 }, expr: { arco: 0.23, vivacidad: 0.24, calidez: 0.13 } },
    { id: "neu-solis", nombre: "Solis", genero: "neutra", desc: "Amplio y calmado", local: { voz: "em_santa", speed: 1.1, instruct: "timbre neutro, amplio y calmado" }, sistema: { bases: ["Mónica", "Monica", "Paulina"], pitch: 0.82, rate: 0.88 }, expr: { arco: 0.12, vivacidad: 0.06, calidez: 0.09 } },
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
        expr: {
            arco: +(0.08 + Math.random() * 0.2).toFixed(3),
            vivacidad: +(0.04 + Math.random() * 0.26).toFixed(3),
            calidez: +(0.04 + Math.random() * 0.14).toFixed(3),
        },
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
