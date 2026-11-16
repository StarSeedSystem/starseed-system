/**
 * MÓDULO DE SÍNTESIS DE VOZ - CAPA DE TRADUCTOR (Ola actual)
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposición pública: hablar(texto, idioma, entorno), detener(), vocesDe(idioma),
 * resetearEstado(), cuandoTerminar().
 * Comportamiento: elige voz por `lang` (exacto, luego prefijo). Sin voz coincidente
 * devuelve {ok:false, motivo:"No hay una voz de <idioma> en este aparato"} y NO usa
 * otra voz. Cola de frases (una a la vez), alTerminar.
 *
 * NOTA: este módulo es PUREZA — no importa node:, no lanza, no toca disco ni red.
 * Las inyecciones de red/almacenamiento vienen por parámetros o contexto global.
 */

type VozDisponible = {
    id: string;
    nombre: string;
    lang: string;
};

/** Estado interno del módulo de voz. */
interface EstadoVoz {
    /** La voz actualmente activa, o null si nadie habla. */
    activa: VozDisponible | null;
    /** Cola de frases pendientes (máx. 1 por la regla "una a la vez"). */
    cola: string[];
    /** Control de interrupción. */
    cancelado: boolean;
    /** Callback llamado cuando termina una frase. */
    alTerminar: ((ok: boolean) => void) | null;
}

/** Voces simuladas del navegador (para tests con speechSynthesis falso). */
const VOZES_SIMULADAS: VozDisponible[] = [
    { id: "1", nombre: "Spanish Female", lang: "es-ES" },
    { id: "2", nombre: "Spanish Male", lang: "es-ES" },
    { id: "3", nombre: "English Female", lang: "en-US" },
    { id: "4", nombre: "English Male", lang: "en-US" },
    { id: "5", nombre: "Catalan", lang: "ca-ES" },
    { id: "6", nombre: "Galician", lang: "gl-ES" },
];

/** Estado singleton (solo un hilo hablante a la vez). */
let estado: EstadoVoz = {
    activa: null,
    cola: [],
    cancelado: false,
    alTerminar: null,
};

<<<<<<< HEAD
/** Proveedor de voces: en producción usa speechSynthesis; en tests se puede sobrescribir. */
let proveedorVoces: () => VozDisponible[] = (): VozDisponible[] => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis) {
        try {
            const voces = window.speechSynthesis.getVoices();
            if (voces && voces.length > 0) {
                return voces.map((v, i) => ({
                    id: String(i),
                    nombre: v.name,
                    lang: v.lang,
                }));
            }
        } catch {
            // Ignorar errores y caer a simuladas
        }
    }
    return VOZES_SIMULADAS;
};

/**
 * Establece un proveedor de voces personalizado (para tests).
 * El proveedor debe devolver un array de VozDisponible.
 */
export function __establecerProveedorVoces(fn: () => VozDisponible[]): void {
    proveedorVoces = fn;
}

/**
 * Obtiene la lista de voces disponibles (producción: speechSynthesis; tests: simuladas).
 */
function obtenerVoces(): VozDisponible[] {
    return proveedorVoces();
}

=======
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
/**
 * Reinicia el estado interno del módulo. Útil para tests: pone el estado
 * en su valor inicial como si fuera una nueva instancia.
 */
export function resetearEstado(): void {
    estado = {
        activa: null,
        cola: [],
        cancelado: false,
        alTerminar: null,
    };
}

/**
 * Selecciona la voz cuyo `lang` coincida con el idioma solicitado.
 * Primero busca coincidencia exacta, luego busca por prefijo (ej. "es" coincide
 * con "es-ES", "es-MX", etc.). Si no hay coincidencia, devuelve null.
 */
function seleccionarVoz(idioma: string): VozDisponible | null {
    if (!idioma) return null;

<<<<<<< HEAD
    const voces = obtenerVoces();

    // Buscar coincidencia exacta
    const exacta = voces.find((v) => v.lang === idioma);
=======
    // Buscar coincidencia exacta
    const exacta = VOZES_SIMULADAS.find((v) => v.lang === idioma);
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
    if (exacta) return exacta;

    // Buscar por prefijo (ej. "es" → "es-ES", "es-MX")
    const prefijo = idioma.split("-")[0];
<<<<<<< HEAD
    const porPrefijo = voces.find((v) => v.lang.startsWith(prefijo + "-"));
    if (porPrefijo) return porPrefijo;

    // Buscar solo el prefijo sin guion (ej. "es" → "es")
    const porPrefijoSimple = voces.find((v) => v.lang === prefijo);
=======
    const porPrefijo = VOZES_SIMULADAS.find((v) => v.lang.startsWith(prefijo + "-"));
    if (porPrefijo) return porPrefijo;

    // Buscar solo el prefijo sin guion (ej. "es" → "es")
    const porPrefijoSimple = VOZES_SIMULADAS.find((v) => v.lang === prefijo);
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
    if (porPrefijoSimple) return porPrefijoSimple;

    return null;
}

/**
 * Obtiene las voces disponibles para un idioma dado.
 * Devuelve un array vacío si no hay voces de ese idioma.
 */
export function vocesDe(idioma: string): VozDisponible[] {
    if (!idioma) return [];
<<<<<<< HEAD
    const voces = obtenerVoces();
    return voces.filter((v) => {
=======
    return VOZES_SIMULADAS.filter((v) => {
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
        if (v.lang === idioma) return true;
        const prefijo = idioma.split("-")[0];
        return v.lang.startsWith(prefijo + "-") || v.lang === prefijo;
    });
}

/**
 * Habla el texto en el idioma especificado.
 * - Si ya hay una frase sonando, la nueva se encola (una a la vez).
 * - Si no hay voz para ese idioma, devuelve {ok:false, motivo}.
 * - Llama al callback alTerminar cuando la frase termina.
 */
export function hablar(texto: string, idioma: string, entorno: string = "navegador"): { ok: boolean; motivo?: string } {
    // Si ya hay una frase sonando, encola la nueva
    if (estado.activa) {
        if (estado.cancelado) {
            estado.cola = [];
            estado.cancelado = false;
        }
        estado.cola.push(texto);
        return { ok: true };
    }

    // Seleccionar voz para el idioma
    const voz = seleccionarVoz(idioma);
    if (!voz) {
        return { ok: false, motivo: `No hay una voz de ${idioma} en este aparato` };
    }

    // Marcar como activa y procesar
    estado.activa = voz;
    estado.cancelado = false;
    estado.cola = [];

    // Simular síntesis de voz (speechSynthesis)
<<<<<<< HEAD
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis) {
        const synth = window.speechSynthesis;
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = voz.lang;
        const voices = synth.getVoices();
        const matchedVoice = voices.find((v: SpeechSynthesisVoice) => v.lang === voz.lang || v.name.includes(voz.nombre));
        if (matchedVoice) {
            u.voice = matchedVoice;
        }

        // Marcar fin de frase
        const onend = (): void => {
=======
    if (typeof window !== "undefined" && "speechSynthesis" in window && (window as any).speechSynthesis) {
        const synth = (window as any).speechSynthesis;
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = voz.lang;
        ;(u as any).voice = ((synth as any).getVoices() as SpeechSynthesisVoice[]).find((v: SpeechSynthesisVoice) => v.lang === voz.lang || v.name.includes(voz.nombre)) || undefined;

        // Marcar fin de frase
        const onend = () => {
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
            synth.cancel();
            estado.activa = null;
            const siguiente = estado.cola.shift();
            if (siguiente) {
                hablar(siguiente, idioma, entorno);
            } else {
                const cb = estado.alTerminar;
                estado.alTerminar = null;
                if (cb) cb(true);
            }
        };

        u.onend = onend;
        synth.speak(u);
    } else {
        // Fallback: simular inmediato (para tests sin DOM)
        setTimeout(() => {
            estado.activa = null;
            const siguiente = estado.cola.shift();
            if (siguiente) {
                hablar(siguiente, idioma, entorno);
            } else {
                const cb = estado.alTerminar;
                estado.alTerminar = null;
                if (cb) cb(true);
            }
        }, 10);
    }

    return { ok: true };
}

/**
 * Detiene la habla en curso y vacía la cola.
 * Llama al callback alTerminar con `false` para indicar interrupción.
 */
export function detener(): void {
    estado.cancelado = true;
    estado.cola = [];
<<<<<<< HEAD
    if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
=======
    if (typeof window !== "undefined" && (window as any).speechSynthesis) {
        (window as any).speechSynthesis.cancel();
>>>>>>> 5a6ac479e (salvavidas · TU14: trabajo del agente antes de las puertas (tsc / vitest))
    }
    estado.activa = null;
    const cb = estado.alTerminar;
    estado.alTerminar = null;
    if (cb) cb(false);
}

/**
 * Programa un callback que se ejecutará cuando la frase actual termine.
 * Si no hay frase sonando, invoca el callback inmediatamente con `true`.
 */
export function cuandoTermine(cb: (ok: boolean) => void): void {
    if (estado.activa && estado.alTerminar === null) {
        estado.alTerminar = cb;
    } else if (!estado.activa && estado.alTerminar === null) {
        // Si no hay nada sonando, invocar inmediatamente con true
        setTimeout(() => cb(true), 0);
    }
}