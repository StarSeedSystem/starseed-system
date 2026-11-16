import { describe, expect, it, beforeEach, vi } from "vitest";
import { leerEnVoz, detener } from "../leer-en-voz";

function crearSynthFalso(voces: SpeechSynthesisVoice[] = []) {
    let habla: SpeechSynthesisUtterance | null = null;
    const synth = {
        getVoices: () => voces,
        speak: (u: SpeechSynthesisUtterance) => { habla = u; },
        cancel: () => { habla = null; },
        pending: false,
        speaking: false,
        paused: false,
    } as unknown as SpeechSynthesis;

    const Utter = vi.fn((texto: string) => ({
        text: texto,
        lang: "",
        voice: null,
        onend: null as (() => void) | null,
    })) as unknown as typeof SpeechSynthesisUtterance;

    return { synth, Utter, getHabla: () => habla };
}

const vozEs = { name: "Mónica", lang: "es-ES", localService: true, default: false } as SpeechSynthesisVoice;
const vozEsMx = { name: "Paulina", lang: "es-MX", localService: true, default: false } as SpeechSynthesisVoice;
const vozEn = { name: "Google US English", lang: "en-US", localService: true, default: false } as SpeechSynthesisVoice;
const vozFr = { name: "Google Français", lang: "fr-FR", localService: true, default: false } as SpeechSynthesisVoice;

describe("leerEnVoz", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("devuelve error si no hay speechSynthesis", () => {
        const r = leerEnVoz("hola", "es", { synth: undefined, Utter: undefined });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("Este aparato no tiene síntesis de voz");
    });

    it("devuelve error si idioma es null", () => {
        const { synth, Utter } = crearSynthFalso([vozEs]);
        const r = leerEnVoz("hola", null, { synth, Utter });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("Elige el idioma");
    });

    it("devuelve error si no hay voces instaladas", () => {
        const { synth, Utter } = crearSynthFalso([]);
        const r = leerEnVoz("hola", "es", { synth, Utter });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("No hay una voz instalada para es en este aparato");
    });

    it("elige la voz exacta por lang", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEs, vozEn]);
        const r = leerEnVoz("hola mundo", "es-ES", { synth, Utter });
        expect(r.ok).toBe(true);
        expect(r.voz).toBe("Mónica");
        const habla = getHabla();
        expect(habla).not.toBeNull();
        expect(habla?.lang).toBe("es-ES");
        expect(habla?.voice).toBe(vozEs);
    });

    it("elige la voz por prefijo de 2 letras si no hay exacta", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEsMx, vozEn]);
        const r = leerEnVoz("hola mundo", "es-ES", { synth, Utter });
        expect(r.ok).toBe(true);
        expect(r.voz).toBe("Paulina");
        const habla = getHabla();
        expect(habla?.lang).toBe("es-MX");
        expect(habla?.voice).toBe(vozEsMx);
    });

    it("devuelve error si no hay voz para el idioma ni por prefijo", () => {
        const { synth, Utter } = crearSynthFalso([vozEn, vozFr]);
        const r = leerEnVoz("hola", "es", { synth, Utter });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("No hay una voz instalada para es en este aparato");
    });

    it("recorta el texto a 2000 caracteres", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEs]);
        const textoLargo = "a".repeat(2500);
        const r = leerEnVoz(textoLargo, "es", { synth, Utter });
        expect(r.ok).toBe(true);
        const habla = getHabla();
        expect(habla?.text.length).toBe(2000);
    });

    it("cancela la lectura anterior antes de iniciar la nueva", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEs]);
        leerEnVoz("primera", "es", { synth, Utter });
        const primera = getHabla();
        expect(primera).not.toBeNull();

        leerEnVoz("segunda", "es", { synth, Utter });
        const segunda = getHabla();
        expect(segunda).not.toBeNull();
        expect(segunda?.text).toBe("segunda");
    });

    it("detener cancela la síntesis", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEs]);
        leerEnVoz("hola", "es", { synth, Utter });
        expect(getHabla()).not.toBeNull();

        detener({ synth, Utter });
        expect(getHabla()).toBeNull();
    });

    it("no habla con otra voz si no hay voz para el idioma", () => {
        const { synth, Utter, getHabla } = crearSynthFalso([vozEn]);
        const r = leerEnVoz("hola", "es", { synth, Utter });
        expect(r.ok).toBe(false);
        expect(getHabla()).toBeNull();
    });
});