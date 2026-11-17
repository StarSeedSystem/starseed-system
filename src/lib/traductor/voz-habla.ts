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

import { hablar as hablarPuerta, callar as callarPuerta } from "@/lib/aurora/voz-unica";

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

    const voces = obtenerVoces();

    // Buscar coincidencia exacta
    const exacta = voces.find((v) => v.lang === idioma);
    if (exacta) return exacta;

    // Buscar por prefijo (ej. "es" → "es-ES", "es-MX")
    const prefijo = idioma.split("-")[0];
    const porPrefijo = voces.find((v) => v.lang.startsWith(prefijo + "-"));
    if (porPrefijo) return porPrefijo;

    // Buscar solo el prefijo sin guion (ej. "es" → "es")
    const porPrefijoSimple = voces.find((v) => v.lang === prefijo);
    if (porPrefijoSimple) return porPrefijoSimple;

    return null;
}

/**
 * Obtiene las voces disponibles para un idioma dado.
 * Devuelve un array vacío si no hay voces de ese idioma.
 */
export function vocesDe(idioma: string): VozDisponible[] {
    if (!idioma) return [];
    const voces = obtenerVoces();
    return voces.filter((v) => {
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

    // Todo suena por la puerta única. Contexto «lectura»: una traducción leída en voz alta es un texto que
    // el usuario pidió oír (sustituye a otra lectura, no corta la conversación ni espera en cola).
    // La puerta no admite idioma, velocidad ni voz: elige el motor sola; `voz` solo valida que haya voz del idioma.
    let terminada = false;
    const miEstado = estado; // `resetearEstado()` crea otro objeto: una frase de un estado viejo no toca el nuevo
    const alFinal = (): void => {
        if (terminada) return;
        terminada = true;
        if (miEstado !== estado || estado.activa !== voz) return; // `detener()` o `resetearEstado()` ya cerraron esta frase
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
    // Si la puerta no pudo hablar (devuelve false), la cola avanza igual para no quedar bloqueada.
    void hablarPuerta(texto, { contexto: "lectura", alTerminar: alFinal }).then((sono) => { if (!sono) alFinal(); }, alFinal);

    return { ok: true };
}

/**
 * Detiene la habla en curso y vacía la cola.
 * Llama al callback alTerminar con `false` para indicar interrupción.
 */
export function detener(): void {
    estado.cancelado = true;
    estado.cola = [];
    estado.activa = null;
    callarPuerta(); // cancelación propia de la puerta única
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