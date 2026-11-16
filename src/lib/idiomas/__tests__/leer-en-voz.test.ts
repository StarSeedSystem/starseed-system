/**
 * TRA1116 · Pruebas de la lectura en voz alta con un `synth` falso: voz exacta,
 * por prefijo, sin voz para el idioma (no se finge), sin síntesis, recorte a
 * 2.000 caracteres y cancelación de la lectura anterior.
 */
import { describe, expect, it } from "vitest";
import {
    detener,
    elegirVozPorIdioma,
    leerEnVoz,
    TOPE_LEER_EN_VOZ,
    type EntornoLectura,
} from "../leer-en-voz";

class UtterFalsa {
    text: string;
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    constructor(texto: string) {
        this.text = texto;
    }
}

function vozFalsa(name: string, lang: string): SpeechSynthesisVoice {
    return { name, lang, voiceURI: name, localService: true, default: false };
}

/** `SpeechSynthesis` falso: guarda lo hablado y lo cancelado, sin `window`. */
function synthFalso(voces: SpeechSynthesisVoice[]) {
    const s = {
        habladas: [] as string[],
        lenguas: [] as string[],
        canceladas: 0,
        getVoices: () => voces,
        speak: (u: SpeechSynthesisUtterance) => {
            s.habladas.push(u.text);
            s.lenguas.push(u.lang);
        },
        cancel: () => {
            s.canceladas += 1;
        },
    };
    return s;
}

function entorno(voces: SpeechSynthesisVoice[]): EntornoLectura & { s: ReturnType<typeof synthFalso> } {
    const s = synthFalso(voces);
    return {
        s,
        synth: s as unknown as SpeechSynthesis,
        Utter: UtterFalsa as unknown as typeof SpeechSynthesisUtterance,
    };
}

describe("leerEnVoz", () => {
    it("sin síntesis en el aparato lo dice y no habla", () => {
        expect(leerEnVoz("hola", "es", {})).toEqual({ ok: false, motivo: "Este aparato no tiene síntesis de voz" });
    });

    it("sin idioma elegido pide elegirlo y no habla", () => {
        const e = entorno([]);
        expect(leerEnVoz("hola", null, e)).toEqual({ ok: false, motivo: "Elige el idioma" });
        expect(e.s.habladas).toEqual([]);
    });

    it("elige la voz por prefijo de 2 letras y habla con ella", () => {
        const e = entorno([vozFalsa("Zira", "en-US"), vozFalsa("Paulina", "es-ES")]);
        expect(leerEnVoz("hola", "es", e)).toEqual({ ok: true, voz: "Paulina" });
        expect(e.s.habladas[0]).toBe("hola");
        expect(e.s.lenguas[0]).toBe("es");
    });

    it("prefiere la coincidencia exacta de lang y no inventa voces", () => {
        const voces = [vozFalsa("Luciana", "pt-BR"), vozFalsa("Zira", "en-US")];
        expect(elegirVozPorIdioma("pt-BR", voces)?.name).toBe("Luciana");
        expect(elegirVozPorIdioma("pt", voces)?.name).toBe("Luciana");
        expect(elegirVozPorIdioma("en", voces)?.name).toBe("Zira");
        expect(elegirVozPorIdioma("ja", voces)).toBeNull();
    });

    it("sin voz para el idioma lo dice y NO habla con otra", () => {
        const e = entorno([vozFalsa("Paulina", "es-ES")]);
        expect(leerEnVoz("こんにちは", "ja", e)).toEqual({
            ok: false,
            motivo: "No hay una voz instalada para 日本語 en este aparato",
        });
        expect(e.s.habladas).toEqual([]);
    });

    it("recorta el texto a 2.000 caracteres", () => {
        const e = entorno([vozFalsa("Paulina", "es-ES")]);
        const r = leerEnVoz("a".repeat(TOPE_LEER_EN_VOZ + 500), "es", e);
        expect(r.ok).toBe(true);
        expect(e.s.habladas[0].length).toBe(TOPE_LEER_EN_VOZ);
    });

    it("cancela la lectura anterior y detener() corta la actual", () => {
        const e = entorno([vozFalsa("Paulina", "es-ES")]);
        leerEnVoz("primera", "es", e);
        leerEnVoz("segunda", "es", e);
        expect(e.s.canceladas).toBe(2);
        detener(e);
        expect(e.s.canceladas).toBe(3);
        detener({});
        expect(e.s.canceladas).toBe(3);
    });
});
