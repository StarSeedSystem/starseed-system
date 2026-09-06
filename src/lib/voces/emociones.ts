/**
 * ETIQUETAS DE EMOCIÓN E INTENSIDAD (Tarea G1 · Ola 264 · Forja fases 2 y 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * La emoción es una CAPA sobre el perfil neuronal, no otra voz: un solo
 * modelo, un solo timbre, y la emoción desvía velocidad, tono y expresión
 * (hitos `emociones-etiquetas` de la fase 2 e `intensidad-exageracion` de la
 * fase 3 del manifiesto de la Forja).
 *
 * Decisiones fijas:
 *  · Los deltas de `speed`/`pitch` son MULTIPLICATIVOS y los de `expr`
 *    ADITIVOS: multiplicar preserva la proporción del timbre base (una voz
 *    ya rápida se acelera proporcionalmente), sumar mueve el carácter.
 *  · La intensidad (acotada a [0, 2]) escala LA DESVIACIÓN, no el valor:
 *    intensidad 1 es la emoción «de manual», 0 es neutro y 2 la exagera al
 *    doble. Así un slider continuo cubre desde un matiz hasta la caricatura.
 *  · Los tokens del instruct (tono, `whisper`) solo se tocan cuando la
 *    intensidad llega a 0.5: por debajo, mover el token binario sería un
 *    salto brusco en vez de una gradación.
 *
 * Módulo PURO: sin React, sin DOM, sin localStorage.
 */

import type { PerfilNeuronal } from "./perfil-neuronal";
import { validarInstruct } from "./perfil-neuronal";

export type EmocionVoz =
    | "neutra"
    | "alegre"
    | "serena"
    | "urgente"
    | "triste"
    | "solemne"
    | "jugueton"
    | "susurro"
    | "asombro";

type TonoInstruct =
    | "very low pitch"
    | "low pitch"
    | "moderate pitch"
    | "high pitch"
    | "very high pitch";

export interface DeltaEmocion {
    /** Factor de velocidad (1 = sin cambio). Se aplica multiplicando. */
    speed: number;
    /** Factor de tono (1 = sin cambio). Se aplica multiplicando. */
    pitch: number;
    /** Desplazamientos del carácter (0 = sin cambio). Se aplican sumando. */
    arco: number;
    vivacidad: number;
    calidez: number;
    /** Token de tono del instruct que impone la emoción (a intensidad ≥ 0.5). */
    tono?: TonoInstruct;
    /** Si true, el habla pasa a susurro (token `whisper` del demonio). */
    whisper?: boolean;
}

/**
 * Catálogo de emociones. `neutra` existe para poder VOLVER: quita lo que
 * otra emoción hubiera puesto (incluido `whisper`).
 */
export const EMOCIONES: Record<EmocionVoz, { nombre: string; desc: string; delta: DeltaEmocion }> = {
    neutra: {
        nombre: "Neutra",
        desc: "Sin marca: la voz suena tal y como se forjó el timbre",
        delta: { speed: 1, pitch: 1, arco: 0, vivacidad: 0, calidez: 0 },
    },
    alegre: {
        nombre: "Alegre",
        desc: "Un poco más rápida, aguda y viva",
        delta: { speed: 1.08, pitch: 1.05, arco: 0, vivacidad: 0.15, calidez: 0, tono: "high pitch" },
    },
    serena: {
        nombre: "Serena",
        desc: "Más lenta y más cálida, sin perder claridad",
        delta: { speed: 0.94, pitch: 0.98, arco: 0, vivacidad: 0, calidez: 0.1 },
    },
    urgente: {
        nombre: "Urgente",
        desc: "Acelera y remata las frases con más arco",
        delta: { speed: 1.18, pitch: 1, arco: 0.1, vivacidad: 0, calidez: 0 },
    },
    triste: {
        nombre: "Triste",
        desc: "Lenta y baja, con el tono hacia abajo",
        delta: { speed: 0.9, pitch: 0.95, arco: 0, vivacidad: 0, calidez: 0, tono: "low pitch" },
    },
    solemne: {
        nombre: "Solemne",
        desc: "Pausada y grave, como una lectura ceremonial",
        delta: { speed: 0.88, pitch: 0.94, arco: 0, vivacidad: 0, calidez: 0, tono: "low pitch" },
    },
    jugueton: {
        nombre: "Juguetón",
        desc: "Rápida, aguda y muy viva",
        delta: { speed: 1.1, pitch: 1.08, arco: 0, vivacidad: 0.2, calidez: 0 },
    },
    susurro: {
        nombre: "Susurro",
        desc: "Habla bajito, casi al oído",
        delta: { speed: 0.95, pitch: 1, arco: 0, vivacidad: 0, calidez: 0, whisper: true },
    },
    asombro: {
        nombre: "Asombro",
        desc: "El tono se abre y el arco se exagera",
        delta: { speed: 1, pitch: 1.06, arco: 0.15, vivacidad: 0, calidez: 0 },
    },
};

/** Límites finales del perfil: fuera de aquí suena a caricatura o a gruñido. */
const SPEED_MIN = 0.6;
const SPEED_MAX = 1.6;
const PITCH_MIN = 0.7;
const PITCH_MAX = 1.4;
/** Intensidad mínima para tocar los tokens binarios del instruct (tono, whisper). */
const UMBRAL_TOKEN = 0.5;

/** Tonos del vocabulario del demonio, para poder quitar el que haya. */
const TONOS: readonly string[] = [
    "very low pitch",
    "low pitch",
    "moderate pitch",
    "high pitch",
    "very high pitch",
];

function acotar(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

export interface ExprCaracter {
    arco: number;
    vivacidad: number;
    calidez: number;
}

/**
 * Aplica una emoción al perfil neuronal de un timbre, con intensidad continua.
 *
 *  · speed/pitch: `base × (1 + (delta − 1) × intensidad)` (la desviación se
 *    escala, luego se multiplica), acotados a sus rangos seguros.
 *  · expr: `base + delta × intensidad`, cada componente acotado a [0, 1].
 *  · instruct: si la intensidad llega a 0.5, se reemplaza el token de tono
 *    por el de la emoción (si lo tiene) y se añade `whisper` si lo pide
 *    (`neutra` lo quita). Todo pasa por `validarInstruct` para no salirse
 *    jamás del vocabulario del demonio.
 */
export function aplicarEmocion(
    perfil: PerfilNeuronal,
    expr: ExprCaracter,
    emocion: EmocionVoz,
    intensidad = 1,
): { perfil: PerfilNeuronal; expr: ExprCaracter } {
    const inten = acotar(intensidad, 0, 2);
    const delta = EMOCIONES[emocion].delta;

    const speed = acotar(perfil.speed * (1 + (delta.speed - 1) * inten), SPEED_MIN, SPEED_MAX);
    const pitch = acotar(perfil.pitch * (1 + (delta.pitch - 1) * inten), PITCH_MIN, PITCH_MAX);

    const exprNuevo: ExprCaracter = {
        arco: acotar(expr.arco + delta.arco * inten, 0, 1),
        vivacidad: acotar(expr.vivacidad + delta.vivacidad * inten, 0, 1),
        calidez: acotar(expr.calidez + delta.calidez * inten, 0, 1),
    };

    let instruct = perfil.instruct;
    if (inten >= UMBRAL_TOKEN) {
        // Se quita siempre `whisper` (volver a `neutra` debe «apagar» un
        // susurro anterior). El tono SOLO se reemplaza si la emoción trae
        // uno: `neutra` no impone tono, respeta el del timbre. Todo pasa por
        // `validarInstruct` para no salirse jamás del vocabulario del demonio.
        const partes = perfil.instruct
            .split(",")
            .map((p) => p.trim().toLowerCase())
            .filter((p) => p && p !== "whisper")
            .filter((p) => !delta.tono || !TONOS.includes(p));
        if (delta.tono) partes.push(delta.tono);
        if (delta.whisper) partes.push("whisper");
        instruct = validarInstruct(partes.join(", ")).valido;
    }

    return {
        perfil: { ...perfil, speed, pitch, instruct },
        expr: exprNuevo,
    };
}

/** Normaliza quitando tildes y bajando a minúsculas, para aceptar «[Alegré]». */
function normalizarEtiqueta(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

/**
 * Lee una etiqueta inicial de emoción en el texto hablado: `[alegre]`,
 * `[serena 1.5]`, `[susurro]`… Insensible a mayúsculas y tildes.
 *
 * Devuelve la emoción, la intensidad (null si la etiqueta no la traía) y el
 * texto YA limpio para hablar. Sin etiqueta: `{ emocion: null, intensidad:
 * null, textoLimpio: texto }`.
 */
export function emocionDesdeTexto(texto: string): {
    emocion: EmocionVoz | null;
    intensidad: number | null;
    textoLimpio: string;
} {
    const m = /^\s*\[([^\]]+)\]\s*/.exec(texto);
    if (!m) return { emocion: null, intensidad: null, textoLimpio: texto };

    const partes = m[1].trim().split(/\s+/);
    const clave = normalizarEtiqueta(partes[0] ?? "");
    const emocion = (Object.keys(EMOCIONES) as EmocionVoz[]).find((e) => e === clave) ?? null;
    if (!emocion) return { emocion: null, intensidad: null, textoLimpio: texto };

    let intensidad: number | null = null;
    if (partes.length > 1) {
        const n = Number(partes[1].replace(",", "."));
        if (Number.isFinite(n)) intensidad = acotar(n, 0, 2);
    }

    return { emocion, intensidad, textoLimpio: texto.slice(m[0].length) };
}
