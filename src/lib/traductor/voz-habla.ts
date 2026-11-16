let mockSpeechSynthesis = null;
let voiceQueue: Array<{ text: string; lang: string; alTerminar?: () => void }> = [];
let isSpeaking = false;
let currentUtterance: SpeechSynthesisUtterance | null = null;

export interface ResultadoHabla {
    ok: true;
}

export interface ErrorHabla {
    ok: false;
    motivo: string;
}

export type ResultadoHablaFinal = ResultadoHabla | ErrorHabla;

function setMockSpeechSynthesis(speechSynthesis: any): void {
    mockSpeechSynthesis = speechSynthesis;
}

function getSpeechSynthesis() {
    if (mockSpeechSynthesis) return mockSpeechSynthesis;
    if (typeof window !== "undefined") return window.speechSynthesis;
    return null;
}

function getVoices() {
    const ss = getSpeechSynthesis();
    return ss ? ss.getVoices() : [];
}

export async function hablar(texto: string, idioma: string, entorno: any): Promise<ResultadoHablaFinal> {
    const voces = getVoices().filter(v => v.lang.startsWith(idioma.toLowerCase()));

    if (!voces.length) {
        return { ok: false, motivo: `No hay una voz de ${idioma} en este aparato` };
    }

    const voz = getVoices().find(v => v.lang === idioma.toLowerCase()) || voces[0];
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = voz.lang;
    utterance.voice = voz;

    return new Promise(resolve => {
        voiceQueue.push({ text: texto, lang: idioma, alTerminar: () => resolve({ ok: true }) });
        procesarCola();
    });
}

export function detener(): void {
    const ss = getSpeechSynthesis();
    if (ss) {
        ss.cancel();
    }
    isSpeaking = false;
    currentUtterance = null;
    voiceQueue = [];
}

export function vocesDe(idioma: string): SpeechSynthesisVoice[] {
    return getVoices().filter(v => v.lang.startsWith(idioma.toLowerCase()));
}

function procesarCola(): void {
    if (isSpeaking || voiceQueue.length === 0) return;

    const siguiente = voiceQueue.shift();
    if (!siguiente) return;

    isSpeaking = true;
    currentUtterance = new SpeechSynthesisUtterance(siguiente.text);

    const voces = getVoices().filter(v => v.lang.startsWith(siguiente.lang.toLowerCase()));
    if (voces.length > 0) {
        currentUtterance.lang = siguiente.lang.toLowerCase();
        currentUtterance.voice = getVoices().find(v => v.lang === siguiente.lang.toLowerCase()) || voces[0];
    }

    currentUtterance.onend = () => {
        isSpeaking = false;
        currentUtterance = null;
        if (siguiente.alTerminar) {
            siguiente.alTerminar();
        }
        procesarCola();
    };

    currentUtterance.onerror = () => {
        isSpeaking = false;
        currentUtterance = null;
        if (siguiente.alTerminar) {
            siguiente.alTerminar();
        }
        procesarCola();
    };

    const ss = getSpeechSynthesis();
    if (ss) {
        ss.speak(currentUtterance);
    }
}

export { setMockSpeechSynthesis };
