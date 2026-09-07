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
import {
    TIMBRES,
    TIMBRE_PREDETERMINADO,
    TIMBRE_AUTONOMO_BASE,
    esVozPersonaje,
    type Timbre,
} from "./timbres-catalogo";

// (Ola 275 · Tarea V5A) El catálogo puro (interfaz, TIMBRES, TIMBRE_PREDETERMINADO,
// esVozPersonaje…) vive en `timbres-catalogo.ts` SIN `"use client"`, para que las
// rutas `/api/mando/*` de servidor puedan importarlo. Aquí se reexporta tal cual,
// de modo que NINGÚN importador existente cambia su `@/lib/aurora/timbres`.

export { TIMBRES, TIMBRE_PREDETERMINADO, TIMBRE_AUTONOMO_BASE } from "./timbres-catalogo";
export type { Timbre } from "./timbres-catalogo";
export { esVozPersonaje } from "./timbres-catalogo";

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
