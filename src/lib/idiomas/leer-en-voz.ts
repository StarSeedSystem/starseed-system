/**
 * IMA18 · Leer en voz alta el texto seleccionado, EN SU IDIOMA (o decir que no hay voz).
 * ─────────────────────────────────────────────────────────────────────────────
 * Regla del área (memory/voces-catalogo.md §3.1 y §6.3): no se finge una voz. Si el
 * aparato no tiene instalada una voz del idioma pedido, se dice y NO se habla
 * con otra. La detección del idioma vive en la app del Traductor: aquí, si
 * `idioma` es null, solo se pide que se elija.
 *
 * Módulo PURO: la síntesis y el constructor de la locución se INYECTAN por
 * `entorno` (así se prueba sin navegador). Fuera de la inyección solo se toca
 * `window` cuando existe, y siempre protegido (SSR seguro). Sin `node:*`, sin red.
 */

export interface EntornoLectura {
    /** Síntesis del aparato; si falta, se intenta la del navegador. */
    synth?: SpeechSynthesis;
    /** Constructor de la locución; si falta, se intenta el del navegador. */
    Utter?: typeof SpeechSynthesisUtterance;
}

export interface ResultadoLectura {
    ok: boolean;
    /** Nombre de la voz con la que se habló, cuando `ok` es true. */
    voz?: string;
    /** Qué impidió leer, cuando `ok` es false. */
    motivo?: string;
}

/** Tope de texto por locución: más allá, el navegador corta o se atraganta. */
export const MAX_CARACTERES = 2000;

/** «es_MX» y «ES-mx» se comparan igual: minúsculas y guion. */
function normalizar(valor: string): string {
    return valor.trim().toLowerCase().replace(/_/g, "-");
}

function synthDelEntorno(entorno?: EntornoLectura): SpeechSynthesis | undefined {
    if (entorno?.synth) return entorno.synth;
    try {
        return typeof window !== "undefined" ? window.speechSynthesis : undefined;
    } catch {
        return undefined;
    }
}

function utterDelEntorno(entorno?: EntornoLectura): typeof SpeechSynthesisUtterance | undefined {
    if (entorno?.Utter) return entorno.Utter;
    try {
        return typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : undefined;
    } catch {
        return undefined;
    }
}

function vocesDe(synth: SpeechSynthesis): SpeechSynthesisVoice[] {
    try {
        return synth.getVoices() ?? [];
    } catch {
        return [];
    }
}

/**
 * Construye la locución con el constructor inyectado (o el del navegador). Si
 * un banco de pruebas solo inyecta `synth`, basta un objeto con `text`, `lang`
 * y `voice`: el banco lo lee; en un navegador real el constructor siempre está.
 */
function crearLocucion(Utter: typeof SpeechSynthesisUtterance | undefined, texto: string): SpeechSynthesisUtterance {
    if (Utter) return new Utter(texto);
    return { text: texto, lang: "", voice: null } as unknown as SpeechSynthesisUtterance;
}

/**
 * Voz del idioma pedido: primero la coincidencia EXACTA de `lang`, después la
 * del mismo prefijo de 2 letras («es-AR» puede usar una voz «es-ES»). Nunca
 * devuelve una voz de otro idioma.
 */
function elegirVoz(voces: readonly SpeechSynthesisVoice[], idioma: string): SpeechSynthesisVoice | null {
    const buscado = normalizar(idioma);
    const exacta = voces.find((v) => normalizar(v.lang) === buscado);
    if (exacta) return exacta;
    const base = buscado.slice(0, 2);
    return voces.find((v) => normalizar(v.lang).slice(0, 2) === base) ?? null;
}

export function leerEnVoz(texto: string, idioma: string | null, entorno: EntornoLectura = {}): ResultadoLectura {
    const synth = synthDelEntorno(entorno);
    if (!synth) return { ok: false, motivo: "Este aparato no tiene síntesis de voz" };
    if (idioma === null || !idioma.trim()) return { ok: false, motivo: "Elige el idioma" };

    const voz = elegirVoz(vocesDe(synth), idioma);
    if (!voz) return { ok: false, motivo: `No hay una voz instalada para ${idioma.trim()} en este aparato` };

    const Utter = utterDelEntorno(entorno);

    try {
        const motor = synth as Omit<SpeechSynthesis, "cancel"> & { cancel?: () => void };
        motor.cancel?.();
        const locucion = crearLocucion(Utter, texto.slice(0, MAX_CARACTERES));
        locucion.lang = voz.lang;
        locucion.voice = voz;
        synth.speak(locucion);
        return { ok: true, voz: voz.name };
    } catch {
        return { ok: false, motivo: "No se pudo leer en voz alta en este aparato" };
    }
}

/** Corta la lectura en curso; sin motor no hace nada y nunca lanza. */
export function detener(synth?: SpeechSynthesis): void {
    try {
        (synth ?? synthDelEntorno())?.cancel();
    } catch {
        /* sin motor */
    }
}
