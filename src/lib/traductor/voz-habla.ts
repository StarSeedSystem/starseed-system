/**
 * TU1116-APP-F1 · Síntesis de voz en el idioma de destino
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: speechSynthesis se inyecta vía `entorno`. No usa red, disco ni reloj.
 */

export interface VozDisponible {
    readonly nombre: string;
    readonly lang: string;
}

export interface EntornoVoz {
    readonly speechSynthesis: SpeechSynthesis;
    readonly voces: readonly VozDisponible[];
}

export interface ResultadoHablar {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly motivo: string;
}

export interface OpcionesHablar {
    readonly alTerminar?: () => void;
}

let cola: Array<{
    texto: string;
    idioma: string;
    opciones: OpcionesHablar;
    resolve: (valor: ResultadoHablar) => void;
}> = [];

let procesando = false;
let utteranceActual: SpeechSynthesisUtterance | null = null;
let speechSynthesisRef: SpeechSynthesis | null = null;

function obtenerVozParaIdioma(voces: readonly VozDisponible[], idioma: string): VozDisponible | null {
    const objetivo = idioma.toLowerCase();
    const exacta = voces.find((v) => v.lang.toLowerCase() === objetivo);
    if (exacta) return exacta;
    const porPrefijo = voces.find((v) => v.lang.toLowerCase().startsWith(objetivo + "-"));
    if (porPrefijo) return porPrefijo;
    return null;
}

function procesarSiguiente(): void {
    if (cola.length === 0) {
        procesando = false;
        return;
    }
    procesando = true;
    const { texto, idioma, opciones, resolve } = cola.shift()!;
    const voces = speechSynthesisRef?.getVoices() ?? [];
    const voz = obtenerVozParaIdioma(voces, idioma);
    if (!voz) {
        resolve({ ok: false, motivo: `No hay una voz de ${idioma} en este aparato` });
        procesarSiguiente();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = voz.lang;
    utterance.voice = voces.find((v) => v.nombre === voz.nombre && v.lang === voz.lang) ?? null;
    utterance.onend = () => {
        utteranceActual = null;
        opciones.alTerminar?.();
        resolve({ ok: true });
        procesarSiguiente();
    };
    utterance.onerror = (e) => {
        utteranceActual = null;
        resolve({ ok: false, motivo: e.error?.toString() ?? "Error de síntesis" });
        procesarSiguiente();
    };
    utteranceActual = utterance;
    speechSynthesisRef?.speak(utterance);
}

export function hablar(
    texto: string,
    idioma: string,
    entorno: EntornoVoz,
    opciones: OpcionesHablar = {}
): Promise<ResultadoHablar> {
    speechSynthesisRef = entorno.speechSynthesis;
    return new Promise((resolve) => {
        cola.push({ texto, idioma, opciones, resolve });
        if (!procesando) {
            procesarSiguiente();
        }
    });
}

export function detener(): void {
    if (utteranceActual && speechSynthesisRef) {
        speechSynthesisRef.cancel();
        utteranceActual = null;
    }
    cola = [];
    procesando = false;
}

export function vocesDe(idioma: string, entorno: EntornoVoz): readonly VozDisponible[] {
    const objetivo = idioma.toLowerCase();
    return entorno.voces.filter(
        (v) => v.lang.toLowerCase() === objetivo || v.lang.toLowerCase().startsWith(objetivo + "-")
    );
}

export function __resetParaPruebas(): void {
    cola = [];
    procesando = false;
    utteranceActual = null;
    speechSynthesisRef = null;
}