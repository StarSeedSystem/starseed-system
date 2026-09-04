/**
 * SINCRONÍA VOZ ↔ MOVIMIENTO (Ola 232 · M5)
 * ─────────────────────────────────────────────────────────────────────────────
 * El avatar debe moverse EN EL MISMO INSTANTE en que la personalidad habla:
 * un puente entre el motor único de voz («Voz StarSeed», Ola 228) y el motor
 * único de movimiento («Vida StarSeed», M1) que NO acopla las dos capas. La
 * voz emite un evento `starseed:gesto` por `window.dispatchEvent`; el avatar
 * que tiene la personalidad dueña del turno lo escucha y mueve con lo que se
 * está diciendo.
 *
 * Aquí viven las piezas PURAS que traducen el texto en español a un gesto para
 * Kimodo (texto → movimiento), sin red, sin daemon y sin React:
 *
 *   · `gestoDesdeTexto` — deriva un `Gesto` del texto y su intención.
 *   · `trocearParaGestos` — parte el texto en frases de 2–8 s para encadenarlas.
 *   · `anclarAlAudio` — estira o comprime un clip a la duración real de la voz.
 *   · `emitirGestoVoz` / `escucharGestoVoz` — el cable del evento, del lado voz.
 *
 * Nada de aquí lanza ni toca el servidor: funciones puras y `window` guardado.
 */

import type { Gesto, MovimientoClip } from "./motor";

/* ─────────────────────────── Evento del puente ─────────────────────────── */

/** Nombre del evento que la voz emite al empezar a hablar. */
export const EVENTO_GESTO_VOZ = "starseed:gesto";

/** Carga del evento `starseed:gesto`: el gesto ya derivado y su duración. */
export interface DetalleGestoVoz {
    /** Personalidad dueña del turno de voz (el avatar que debe moverse). */
    personalidadId?: string;
    /** Gesto derivado del texto, listo para `moverAvatar`. */
    gesto: Gesto;
    /** Duración estimada del audio en milisegundos (para anclar el clip). */
    duracionMs: number;
    /** Texto que se está diciendo (para registrar/auditar). */
    texto?: string;
}

/** Dispara el evento del puente. SSR-safe: sin ventana, no hace nada. */
export function emitirGestoVoz(detalle: DetalleGestoVoz): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent<DetalleGestoVoz>(EVENTO_GESTO_VOZ, { detail: detalle }));
    } catch { /* un oyente roto no puede tumbar la voz */ }
}

/** Se suscribe al evento del puente. Devuelve la función de limpieza. */
export function escucharGestoVoz(cb: (d: DetalleGestoVoz) => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const aplicar = (e: Event) => cb((e as CustomEvent<DetalleGestoVoz>).detail);
    window.addEventListener(EVENTO_GESTO_VOZ, aplicar);
    return () => window.removeEventListener(EVENTO_GESTO_VOZ, aplicar);
}

/* ─────────────────────── Estimación de duración de voz ─────────────────────── */

/** Palabras por minuto de referencia para el español hablado. */
const PALABRAS_POR_MINUTO = 170;

/**
 * Duración estimada de una frase hablada, en milisegundos. Sin audio real (el
 * motor de voz no expone la longitud antes de sintetizar), se estima por el
 * número de palabras a ~170 palabras/minuto, con un suelo de 400 ms para que
 * un monosílabo nunca quede en cero.
 */
export function estimarDuracionAudioMs(texto: string): number {
    const palabras = (texto || "").trim().split(/\s+/).filter(Boolean).length;
    const segundos = Math.max(0.4, (palabras / PALABRAS_POR_MINUTO) * 60);
    return Math.round(segundos * 1000);
}

/* ─────────────────────── Derivación de gesto desde texto ─────────────────────── */

/** Intención actitudinal detectada en el texto (para elegir la base del gesto). */
type IntencionGesto = "pregunta" | "saludo" | "despedida" | "explicacion";

/** Frase de movimiento en inglés para Kimodo según la intención detectada. */
const PROMPT_POR_INTENCION: Record<IntencionGesto, string> = {
    pregunta: "slight head tilt with raised eyebrows and a curious gentle lean",
    saludo: "friendly hand wave greeting with a warm nod",
    despedida: "farewell wave with a soft nod and a small step back",
    explicacion: "rhythmic open-palm hand gestures emphasizing key points",
};

/** Cómo de marcado es el énfasis del texto: mayúsculas o signos de exclamación. */
function medirEnfasis(texto: string): number {
    let puntuacion = 0;
    const mayusculas = (texto.match(/[A-ZÁÉÍÓÚÑ]{2,}/g)?.length ?? 0);
    const exclamaciones = (texto.match(/!/g)?.length ?? 0);
    const interrogaciones = (texto.match(/\?/g)?.length ?? 0);
    // Las mayúsculas seguidas (énfasis al escribir) y los signos suben el porte.
    puntuacion += Math.min(0.5, mayusculas * 0.15);
    puntuacion += Math.min(0.3, exclamaciones * 0.15);
    puntuacion += Math.min(0.15, interrogaciones * 0.05);
    return Math.min(0.6, puntuacion);
}

/** Detecta la intención actitudinal de una frase en español. */
function detectarIntencion(texto: string): IntencionGesto {
    const t = texto.trim();
    // Pregunta: signo de interrogación o apertura interrogativa.
    if (/\?/.test(t) || /^(¿|que|qué|c[oó]mo|cu[aá]ndo|d[oó]nde|qui[eé]n|cu[aá]l|por qu[eé]|puedes|podr[ií]as)\b/i.test(t)) {
        return "pregunta";
    }
    // Saludo: vocativo de inicio de turno.
    if (/^(hola|buenos d[ií]as|buenas tardes|buenas noches|bienvenid|saludos)\b/i.test(t)) {
        return "saludo";
    }
    // Despedida: cierre de turno.
    if (/(adi[oó]s|hasta luego|hasta pronto|hasta ma[nñ]ana|nos vemos|chao|bye)\b/i.test(t)) {
        return "despedida";
    }
    return "explicacion";
}

/** Opciones de derivación: emoción, energía y dueño (para teñir el gesto). */
export interface OpcionesGestoDesdeTexto {
    /** Emoción predominante (se incorpora al prompt para Kimodo). */
    emocion?: string;
    /** Energía 0–1; si falta, se deriva de la longitud y la puntuación. */
    energia?: number;
    /** Personalidad dueña del turno (viaja en el evento, no en el Gesto). */
    personalidadId?: string;
}

/**
 * Deriva un `Gesto` (frase de movimiento en inglés para Kimodo) a partir del
 * texto en español y su intención:
 *
 *   · pregunta      → ligera inclinación de cabeza y cejas
 *   · saludo        → gesto de mano
 *   · explicación   → gestos de manos rítmicos (defecto)
 *   · despedida     → gesto de adiós
 *   · énfasis       → mayúsculas o signos suben la amplitud
 *
 * La `energia` queda proporcional a la longitud y a la puntuación si no se
 * pasa explícita, y el `duracionMs` se estima para que el gesto dure lo que la
 * frase. Devuelve siempre un gesto válido (con texto vacío, respiración).
 */
export function gestoDesdeTexto(texto: string, op: OpcionesGestoDesdeTexto = {}): Gesto {
    const limpio = (texto || "").replace(/\s+/g, " ").trim();
    const intencion = detectarIntencion(limpio);
    const enfasis = medirEnfasis(limpio);

    // Energía: la que mande el llamador, o proporcional a longitud + énfasis.
    const base = op.energia ?? Math.min(1, 0.4 + enfasis + Math.min(0.3, limpio.length / 200));
    const energia = Math.min(1, Math.max(0, base));

    // Frase de movimiento para Kimodo, teñida por emoción y énfasis si los hay.
    let prompt = PROMPT_POR_INTENCION[intencion];
    if (op.emocion) prompt = `${prompt} with ${op.emocion} emotional tone`;
    if (enfasis > 0.2) prompt = `${prompt} with larger amplitude and energetic expression`;

    const duracionMs = estimarDuracionAudioMs(limpio);

    return {
        prompt: limpio ? prompt : "gentle breathing and calm presence",
        emocion: op.emocion,
        energia: Number(energia.toFixed(4)),
        duracionMs,
    };
}

/* ─────────────────────── Troceo del texto en frases ─────────────────────── */

/** Máximo (ms) y mínimo (ms) de cada trozo para encadenar gestos. */
const TROZO_MAX_MS = 8000;
const TROZO_MIN_MS = 2000;

/**
 * Parte un texto largo en frases de 2–8 s para encadenar los gestos: se corta
 * por la puntuación fuerte (`. ! ? ;:`) y se agrupan los segmentos cortos
 * hasta llegar al rango, de modo que cada trozo sea una unidad que el avatar
 * pueda mover de una pieza. Con texto corto devuelve `[texto]`.
 */
export function trocearParaGestos(texto: string): string[] {
    const limpio = (texto || "").trim();
    if (!limpio) return [];
    if (estimarDuracionAudioMs(limpio) <= TROZO_MAX_MS) return [limpio];

    const segmentos = limpio
        .split(/(?<=[.!?;:])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const trozos: string[] = [];
    let actual = "";
    for (const segmento of segmentos) {
        const junto = actual ? `${actual} ${segmento}` : segmento;
        const duracion = estimarDuracionAudioMs(junto);
        if (duracion <= TROZO_MAX_MS || estimarDuracionAudioMs(actual) < TROZO_MIN_MS) {
            actual = junto;
        } else {
            if (actual) trozos.push(actual);
            actual = segmento;
        }
    }
    if (actual) trozos.push(actual);
    return trozos.length ? trozos : [limpio];
}

/* ─────────────────── Anclaje del clip a la duración del audio ─────────────────── */

/**
 * Re-muestrea un `MovimientoClip` para que dure EXACTAMENTE `duracionAudioMs`:
 * estira o comprime la línea de tiempo interpolando las rotaciones por
 * articulación, y ajusta `duracionMs` y el número de fotogramas al `fps` del
 * clip. Así el gesto termina cuando termina la voz, ni antes ni después.
 *
 * Guarda de tipo defensiva: si el clip viene vacío o con un solo fotograma, se
 * devuelve una copia con la duración pedida (aunque sea estática) para que el
 * resultado siga siendo un clip válido y reproducible. Nunca lanza.
 */
export function anclarAlAudio(clip: MovimientoClip, duracionAudioMs: number): MovimientoClip {
    const objetivo = Math.max(200, Math.floor(duracionAudioMs));
    const fps = clip.fps > 0 ? clip.fps : 30;
    const fotogramasObjetivo = Math.max(1, Math.round((objetivo / 1000) * fps));

    const origen = clip.rotaciones ?? [];
    const nOrigen = origen.length;
    if (nOrigen === 0) {
        const vacio: number[][] = Array.from({ length: fotogramasObjetivo }, () => []);
        return { ...clip, duracionMs: objetivo, rotaciones: vacio };
    }

    const articulaciones = origen[0]?.length ?? 0;
    const rotaciones: number[][] = [];
    const raiz: number[][] = [];

    const interpolar = (linea: number[][], t: number): number[] => {
        if (linea.length === 0) return [];
        if (linea.length === 1) return Array.from(linea[0]);
        const pos = Math.min(linea.length - 1, Math.max(0, t * (linea.length - 1)));
        const i = Math.floor(pos);
        const j = Math.min(linea.length - 1, i + 1);
        const frac = pos - i;
        const a = linea[i];
        const b = linea[j];
        const salida: number[] = [];
        for (let k = 0; k < articulaciones; k++) {
            const va = a[k] ?? 0;
            const vb = b[k] ?? 0;
            salida.push(Number((va + (vb - va) * frac).toFixed(5)));
        }
        return salida;
    };

    for (let f = 0; f < fotogramasObjetivo; f++) {
        const t = fotogramasObjetivo === 1 ? 0 : f / (fotogramasObjetivo - 1);
        rotaciones.push(interpolar(origen, t));
        if (clip.raiz && clip.raiz.length > 0) {
            raiz.push(interpolar(clip.raiz, t));
        }
    }

    return {
        ...clip,
        duracionMs: objetivo,
        fps,
        rotaciones,
        raiz: raiz.length ? raiz : clip.raiz,
    };
}