// Cliente puro de decisiones Jev (TypeSafe/OpenRouter) para el servidor del OS.
// SOLO funciones puras: construir, validar, leer y normalizar. Sin red, sin disco, sin claves.
import { PROFILE_CATEGORIES } from "@/lib/social/profile-sharing";

export const MODELO_JEV = "~typesafe/jev-latest";
export const MAX_OPCIONES = 255;

export interface PreguntaNoul { type: "noul"; instructions: string; }
export interface PreguntaChoice { type: "choice"; instructions: string; criteria: Record<string, string>; }
export interface PreguntaScore { type: "score"; instructions: string; criteria: string[]; }
export type Pregunta = PreguntaNoul | PreguntaChoice | PreguntaScore;

export interface PeticionJev {
    model: string;
    state: unknown;
    questions: Record<string, Pregunta>;
}

function validarTexto(v: unknown, donde: string): string {
    if (typeof v !== "string" || !v.trim()) throw new Error(`Pregunta «${donde}»: instructions debe ser texto no vacío`);
    return v;
}

/** Valida las formas de las preguntas y devuelve el cuerpo de la petición. */
export function construirPeticion(estado: unknown, preguntas: Record<string, Pregunta>): PeticionJev {
    if (!preguntas || typeof preguntas !== "object") throw new Error("preguntas debe ser un objeto");
    const nombres = Object.keys(preguntas);
    if (nombres.length === 0) throw new Error("hace falta al menos una pregunta");
    for (const nombre of nombres) {
        const p = preguntas[nombre];
        if (!p || typeof p !== "object") throw new Error(`Pregunta «${nombre}» inválida`);
        validarTexto(p.instructions, nombre);
        if (p.type === "noul") continue;
        if (p.type === "choice") {
            const c = p.criteria;
            if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error(`Pregunta «${nombre}»: choice exige criteria objeto`);
            const claves = Object.keys(c);
            if (claves.length === 0) throw new Error(`Pregunta «${nombre}»: choice necesita al menos una opción`);
            if (claves.length > MAX_OPCIONES) throw new Error(`Pregunta «${nombre}»: máximo ${MAX_OPCIONES} opciones`);
            for (const k of claves) {
                if (typeof c[k] !== "string" || !c[k]) throw new Error(`Pregunta «${nombre}»: opción «${k}» sin significado`);
            }
            continue;
        }
        if (p.type === "score") {
            const c = (p as PreguntaScore).criteria;
            if (!Array.isArray(c) || c.length === 0) throw new Error(`Pregunta «${nombre}»: score exige criteria array ordenado`);
            if (c.length > MAX_OPCIONES) throw new Error(`Pregunta «${nombre}»: máximo ${MAX_OPCIONES} niveles`);
            for (const nivel of c) {
                if (typeof nivel !== "string" || !nivel) throw new Error(`Pregunta «${nombre}»: nivel de score vacío`);
            }
            continue;
        }
        throw new Error(`Pregunta «${nombre}»: type desconocido`);
    }
    return { model: MODELO_JEV, state: estado, questions: preguntas };
}

export type TipoRespuesta = "noul" | "choice" | "score";
export interface Decision {
    tipo: TipoRespuesta;
    /** p (noul), opción elegida (choice) o nivel elegido (score). */
    valor: string | number;
    probabilidades: Record<string, number>;
    confianza: number;
}

function numero(v: unknown, defecto = 0): number {
    return typeof v === "number" && Number.isFinite(v) ? v : defecto;
}

/** Normaliza el JSON de Jev a { nombre: Decision }. Tolera campos ausentes. */
export function leerRespuesta(json: unknown): Record<string, Decision> {
    const answers = (json as { answers?: Record<string, Record<string, unknown>> })?.answers ?? {};
    const out: Record<string, Decision> = {};
    for (const nombre of Object.keys(answers)) {
        const a = answers[nombre] ?? {};
        const tipo = (a.type as TipoRespuesta) ?? "noul";
        const probs = a.probabilities && typeof a.probabilities === "object" && !Array.isArray(a.probabilities)
            ? (a.probabilities as Record<string, number>) : {};
        let valor: string | number = numero(a.noul);
        if (tipo === "choice") {
            valor = typeof a.choice === "string" ? a.choice : (Object.keys(probs)[0] ?? "");
        } else if (tipo === "score") {
            valor = typeof a.score === "string" ? a.score : typeof a.score === "number" ? a.score : (Object.keys(probs)[0] ?? "");
        }
        out[nombre] = { tipo, valor, probabilidades: probs, confianza: numero(a.confidence) };
    }
    return out;
}

export type Veredicto = "si" | "duda" | "no";

export function umbral(p: number, alto = 0.9, bajo = 0.6): Veredicto {
    if (p >= alto) return "si";
    if (p >= bajo) return "duda";
    return "no";
}

export interface PublicacionModerable {
    texto?: string;
    titulo?: string;
    body?: string;
    autor?: string;
}

/** Las tres preguntas estándar de moderación del OS para una publicación. */
export function decisionesDeModeracion(_publicacion?: PublicacionModerable): Record<string, Pregunta> {
    const criteriaEtiquetas: Record<string, string> = {};
    for (const c of PROFILE_CATEGORIES) criteriaEtiquetas[c.id] = c.label;
    return {
        permitida: { type: "noul", instructions: "¿Cumple esta publicación las normas de la comunidad?" },
        etiquetas: { type: "choice", instructions: "¿Qué categoría describe mejor esta publicación?", criteria: criteriaEtiquetas },
        prioridad_feed: { type: "score", instructions: "¿Qué prioridad debería tener en el feed?", criteria: ["baja", "media", "alta"] },
    };
}
