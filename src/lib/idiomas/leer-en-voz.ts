/**
 * TRA1116 · Leer en voz alta el texto seleccionado en el idioma elegido, con la
 * voz del aparato (Web Speech). No finge: si el aparato no tiene síntesis o no
 * hay voz instalada para ese idioma, lo dice y NO habla con otra voz.
 *
 * Entorno INYECTADO (`synth` y `Utter`): el módulo es puro, sin red ni disco ni
 * `window` propio, para poder probarlo con un `synth` falso. La detección del
 * idioma no vive aquí: si `idioma` es `null`, pide «Elige el idioma» (la
 * detección la hace la app del Traductor).
 */
import { aIdiomaElegible, porCodigo } from "./idiomas";

/** Tope de caracteres que se leen en una lectura. */
export const TOPE_LEER_EN_VOZ = 2000;

/** La síntesis del aparato y su constructor, inyectados por el llamador. */
export interface EntornoLectura {
    synth?: SpeechSynthesis;
    Utter?: typeof SpeechSynthesisUtterance;
}

/** Resultado de una lectura: qué voz habló o por qué no habló nadie. */
export interface ResultadoLectura {
    ok: boolean;
    /** Nombre de la voz que se usó, cuando `ok` es true. */
    voz?: string;
    /** Por qué no se leyó, cuando `ok` es false. */
    motivo?: string;
}

const normalizar = (l: string): string => l.trim().toLowerCase().replace(/_/g, "-");

/** Nombre del idioma como lo escribe el catálogo («en-US» → «English»); si no es un idioma conocido, el código tal cual. */
export function nombreIdiomaParaVoz(idioma: string): string {
    const codigo = aIdiomaElegible(idioma);
    return (codigo ? porCodigo(codigo)?.nombre : undefined) ?? idioma.trim();
}

/** La voz del aparato para el idioma pedido: primero coincidencia exacta de `lang`, luego por prefijo de 2 letras. Pura. */
export function elegirVozPorIdioma(idioma: string, voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const objetivo = normalizar(idioma);
    if (!objetivo) return null;
    const base = objetivo.split("-")[0];
    return voces.find((v) => normalizar(v.lang) === objetivo)
        ?? voces.find((v) => normalizar(v.lang).split("-")[0] === base)
        ?? null;
}

/** Corta la lectura en curso de este aparato, si la hay. */
export function detener(entorno?: EntornoLectura): void {
    entorno?.synth?.cancel();
}

/**
 * Lee `texto` en voz alta con la voz del aparato que coincide con `idioma`.
 * Sin síntesis, sin idioma o sin voz para ese idioma devuelve el motivo y NO
 * habla con otra voz. Cancela la lectura anterior antes de empezar.
 */
export function leerEnVoz(texto: string, idioma: string | null, entorno: EntornoLectura = {}): ResultadoLectura {
    const synth = entorno.synth;
    const Utter = entorno.Utter ?? (typeof SpeechSynthesisUtterance === "undefined" ? undefined : SpeechSynthesisUtterance);
    if (!synth || !Utter) return { ok: false, motivo: "Este aparato no tiene síntesis de voz" };
    if (!idioma || !idioma.trim()) return { ok: false, motivo: "Elige el idioma" };
    const elegida = elegirVozPorIdioma(idioma, synth.getVoices());
    if (!elegida) return { ok: false, motivo: `No hay una voz instalada para ${nombreIdiomaParaVoz(idioma)} en este aparato` };
    synth.cancel();
    const lectura = new Utter(texto.slice(0, TOPE_LEER_EN_VOZ));
    lectura.lang = idioma.trim();
    lectura.voice = elegida;
    synth.speak(lectura);
    return { ok: true, voz: elegida.name };
}
