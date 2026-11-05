/**
 * TURNO NATURAL de la escucha de Astraura (Ola 1105 · VOZ · 2026-11-05). PURO: sin DOM ni reloj propio.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * Alex: «debería ser una línea estable receptora del micrófono … que perciba lo que diga hasta que detecte
 * que naturalmente termine de explicar inteligentemente con base a lo que esté diciendo».
 *
 * Lo que pasaba: cada resultado «final» del reconocedor (Chrome lo da tras ~0,6 s de pausa; Android tras
 * cada frase) se mandaba YA como orden. Una explicación larga se partía en la primera pausa para respirar
 * y Astraura contestaba a media idea.
 *
 * Esto junta los trozos de UN turno y decide cuándo ha terminado por lo que se dice, no solo por el
 * silencio: una frase que acaba en conector («y», «que», «porque»…), en coma o en muletilla («eh»,
 * «este», «o sea») espera más; una pregunta o una frase cerrada se contesta antes. Nunca espera
 * indefinidamente (tope por turno).
 */

/** Espera tras la última voz cuando lo dicho suena cerrado (frase completa, pregunta). */
export const ESPERA_CERRADO_MS = 900;
/** Espera cuando suena a que sigue (conector, coma, muletilla). */
export const ESPERA_ABIERTO_MS = 2600;
/** Espera con muy poco dicho (1–2 palabras: suele venir más). */
export const ESPERA_CORTO_MS = 1700;
/** Una pregunta clara se contesta un poco antes. */
export const ESPERA_PREGUNTA_MS = 750;
/** Tope de un turno: ni el monólogo más largo deja a Astraura esperando para siempre. */
export const TURNO_MAX_MS = 120_000;

const CONECTORES = new Set([
    // español
    "y", "e", "o", "u", "ni", "pero", "que", "porque", "pues", "entonces", "como", "cuando", "donde", "si",
    "aunque", "mientras", "para", "por", "con", "sin", "de", "del", "a", "al", "en", "el", "la", "los", "las",
    "un", "una", "unos", "unas", "mi", "mis", "tu", "tus", "su", "sus", "lo", "le", "les", "se", "me", "te",
    "nos", "más", "muy", "también", "además", "sino", "luego", "después", "antes", "hasta", "desde", "sobre",
    "entre", "hacia", "según", "cual", "cuál", "quien", "quién", "este", "esta", "ese", "esa", "es", "son",
    "está", "están", "hay", "va", "voy", "quiero", "necesito", "puedes",
    // inglés
    "and", "or", "but", "so", "because", "that", "the", "a", "an", "to", "of", "for", "with", "in", "on",
    "if", "when", "then", "my", "your", "is", "are", "i", "want", "need",
]);
const MULETILLAS = ["eh", "ehh", "em", "emm", "mm", "mmm", "este", "o sea", "bueno", "pues", "a ver", "digamos",
    "como que", "uh", "um", "hmm", "well", "like", "you know"];

function normalizar(texto: string): string {
    return (texto || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** ¿Lo dicho suena a que la persona sigue? (conector, coma, muletilla o puntos suspensivos al final) */
export function pareceIncompleto(texto: string): boolean {
    const t = normalizar(texto);
    if (!t) return false;
    if (/[,;:\-–—]$/.test(t) || /(\.\.\.|…)$/.test(t)) return true;
    // Una pregunta o una exclamación ya están cerradas («¿qué hora es?»).
    if (/[!?]["'»)]*$/.test(t)) return false;
    const sinPunto = t.replace(/[.!?¡¿"'»)]+$/g, "").trim();
    if (MULETILLAS.some((m) => sinPunto === m || sinPunto.endsWith(" " + m))) return true;
    const ultima = sinPunto.split(" ").pop() || "";
    return CONECTORES.has(ultima);
}

/** ¿Es una pregunta? (signos o arranque interrogativo) */
export function esPregunta(texto: string): boolean {
    const t = normalizar(texto);
    if (/\?$/.test(t)) return true;
    return /^(¿|qué|que |cómo|como |cuándo|dónde|por qué|cuál|cuánto|quién|what|how|why|when|where|who|can you|could you|puedes|podrías)/
        .test(t) && !pareceIncompleto(t);
}

/** Milisegundos de silencio tras la última voz para dar el turno por terminado. */
export function esperaParaCerrar(texto: string): number {
    const t = normalizar(texto);
    if (!t) return ESPERA_ABIERTO_MS;
    if (pareceIncompleto(t)) return ESPERA_ABIERTO_MS;
    const palabras = t.split(" ").filter(Boolean).length;
    if (palabras <= 2) return ESPERA_CORTO_MS;
    if (esPregunta(t)) return ESPERA_PREGUNTA_MS;
    return ESPERA_CERRADO_MS;
}

export interface TurnoNatural {
    /** Un trozo final del reconocedor (se une al turno). */
    agregar(texto: string, ahora: number): void;
    /** Hay voz o un parcial: la persona sigue hablando. */
    actividad(ahora: number): void;
    /** Lo dicho en este turno, unido. */
    texto(): string;
    /** ¿Algo dicho en este turno? */
    vacio(): boolean;
    /** ¿Ya terminó de explicar? */
    debeCerrar(ahora: number): boolean;
    /** Cuánto falta (ms) para volver a mirar. */
    faltaMs(ahora: number): number;
    reiniciar(): void;
}

/** Un turno con el tiempo inyectado (las pruebas pasan `ahora`). */
export function crearTurnoNatural(): TurnoNatural {
    let trozos: string[] = [];
    let ultimaVoz = 0;
    let inicio = 0;
    const unido = () => trozos.join(" ").replace(/\s+/g, " ").trim();
    return {
        agregar(texto, ahora) {
            const t = (texto || "").trim();
            if (!t) return;
            if (!trozos.length) inicio = ahora;
            // El reconocedor a veces repite el último trozo al reengancharse: no se duplica.
            if (trozos[trozos.length - 1] !== t) trozos.push(t);
            ultimaVoz = ahora;
        },
        actividad(ahora) {
            if (!inicio) inicio = ahora;
            ultimaVoz = ahora;
        },
        texto: unido,
        vacio: () => trozos.length === 0,
        debeCerrar(ahora) {
            if (!trozos.length) return false;
            if (inicio && ahora - inicio >= TURNO_MAX_MS) return true;
            return ahora - ultimaVoz >= esperaParaCerrar(unido());
        },
        faltaMs(ahora) {
            if (!trozos.length) return ESPERA_ABIERTO_MS;
            const restante = esperaParaCerrar(unido()) - (ahora - ultimaVoz);
            const tope = inicio ? TURNO_MAX_MS - (ahora - inicio) : TURNO_MAX_MS;
            return Math.max(50, Math.min(restante, tope));
        },
        reiniciar() {
            trozos = [];
            ultimaVoz = 0;
            inicio = 0;
        },
    };
}
