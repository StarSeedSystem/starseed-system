import { describe, expect, it } from "vitest";
import { detener, leerEnVoz, MAX_CARACTERES, type EntornoLectura } from "../leer-en-voz";

function voz(name: string, lang: string): SpeechSynthesisVoice {
    return { name, lang, default: false, localService: true, voiceURI: name };
}

class LocucionFalsa {
    text: string;
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    constructor(texto: string) {
        this.text = texto;
    }
}

interface Banco {
    entorno: EntornoLectura;
    hablado: { texto: string; lang: string; voz: string | null }[];
    cancelaciones: () => number;
}

function banco(voces: SpeechSynthesisVoice[]): Banco {
    const hablado: Banco["hablado"] = [];
    let cancelaciones = 0;
    const synth = {
        getVoices: () => voces,
        cancel: () => { cancelaciones += 1; },
        speak: (locucion: SpeechSynthesisUtterance) => {
            hablado.push({ texto: locucion.text, lang: locucion.lang, voz: locucion.voice?.name ?? null });
        },
    };
    return {
        entorno: {
            synth: synth as unknown as SpeechSynthesis,
            Utter: LocucionFalsa as unknown as typeof SpeechSynthesisUtterance,
        },
        hablado,
        cancelaciones: () => cancelaciones,
    };
}

describe("leer en voz", () => {
    it("elige la voz EXACTA del idioma, cancela la lectura anterior y habla con ella", () => {
        const b = banco([voz("Mónica", "es-ES"), voz("Paulina", "es-MX")]);
        const r = leerEnVoz("Hola", "es-MX", b.entorno);
        expect(r).toEqual({ ok: true, voz: "Paulina" });
        expect(b.hablado).toEqual([{ texto: "Hola", lang: "es-MX", voz: "Paulina" }]);
        expect(b.cancelaciones()).toBe(1);
    });

    it("si no hay coincidencia exacta usa el prefijo de 2 letras (y normaliza guion bajo)", () => {
        const b = banco([voz("Mónica", "es_ES")]);
        expect(leerEnVoz("Hola", "es-AR", b.entorno)).toEqual({ ok: true, voz: "Mónica" });
        expect(b.hablado[0]).toMatchObject({ lang: "es_ES", voz: "Mónica" });
    });

    it("sin voz de ese idioma NO habla con otra: lo dice con el idioma pedido", () => {
        const b = banco([voz("Mónica", "es-ES")]);
        expect(leerEnVoz("Bonjour", "fr", b.entorno)).toEqual({
            ok: false,
            motivo: "No hay una voz instalada para fr en este aparato",
        });
        expect(b.hablado).toEqual([]);
    });

    it("sin síntesis de voz lo dice y no lanza", () => {
        expect(leerEnVoz("Hola", "es")).toEqual({
            ok: false,
            motivo: "Este aparato no tiene síntesis de voz",
        });
    });

    it("sin idioma pide elegirlo: la detección vive en la app del Traductor", () => {
        const b = banco([voz("Mónica", "es-ES")]);
        expect(leerEnVoz("Hola", null, b.entorno)).toEqual({ ok: false, motivo: "Elige el idioma" });
        expect(leerEnVoz("Hola", "   ", b.entorno)).toEqual({ ok: false, motivo: "Elige el idioma" });
        expect(b.hablado).toEqual([]);
    });

    it("recorta el texto a 2.000 caracteres antes de hablar", () => {
        const b = banco([voz("Mónica", "es-ES")]);
        expect(leerEnVoz("a".repeat(2500), "es", b.entorno).ok).toBe(true);
        expect(b.hablado[0].texto).toHaveLength(MAX_CARACTERES);
    });

    it("detener corta la lectura en curso y no rompe si no hay motor", () => {
        const b = banco([voz("Mónica", "es-ES")]);
        if (b.entorno.synth) detener(b.entorno.synth);
        expect(b.cancelaciones()).toBe(1);
        expect(() => detener()).not.toThrow();
    });
});
