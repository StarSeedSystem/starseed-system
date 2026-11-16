import { beforeEach, describe, expect, it } from "vitest";
import { hablar, detener, vocesDe, setMockSpeechSynthesis } from "../voz-habla";

let mockVoices: SpeechSynthesisVoice[] = [];
let mockUtterances: SpeechSynthesisUtterance[] = [];

function setupSpeechSynthesisMock(voces: SpeechSynthesisVoice[]): void {
    mockVoices = voces;
    const mockSpeechSynthesis = {
        getVoices: () => mockVoices,
        speak: (utterance: SpeechSynthesisUtterance) => {
            mockUtterances.push(utterance);
        },
        cancel: () => {
            mockUtterances = [];
        },
    };
    setMockSpeechSynthesis(mockSpeechSynthesis);
}

describe("hablar (texto, idioma, entorno)", () => {
    beforeEach(() => {
        mockVoices = [];
        mockUtterances = [];
    });

    it("devuelve ok:true cuando hay una voz con idioma exacto", async () => {
        const esVoice = { lang: "es-ES", name: "Spanish" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([esVoice]);

        const resultado = await hablar("Hola", "es-ES", {});
        expect(resultado).toEqual({ ok: true });
    });

    it("devuelve ok:true cuando no hay voz exacta pero sí voces con prefijo del idioma", async () => {
        const esEsVoice = { lang: "es-ES", name: "Spanish Spain" } as SpeechSynthesisVoice;
        const esMxVoice = { lang: "es-MX", name: "Spanish Mexico" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([esEsVoice, esMxVoice]);

        const resultado = await hablar("Hola", "es", {});
        expect(resultado).toEqual({ ok: true });
    });

    it("devuelve ok:false con motivo cuando no hay voces para el idioma", async () => {
        setupSpeechSynthesisMock([]);

        const resultado = await hablar("Hola", "ja", {});
        expect(resultado).toEqual({ ok: false, motivo: "No hay una voz de ja en este aparato" });
    });

    it("usa voz con idioma exacto cuando está disponible", async () => {
        const esEsVoice = { lang: "es-ES", name: "Spanish Spain" } as SpeechSynthesisVoice;
        const esMxVoice = { lang: "es-MX", name: "Spanish Mexico" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([esMxVoice, esEsVoice]);

        await hablar("Hola", "es-ES", {});

        expect(mockUtterances.length).toBeGreaterThan(0);
        expect(mockUtterances[0].lang).toBe("es-es");
    });

    it("usa primera voz disponible cuando no hay idioma exacto", async () => {
        const esMxVoice = { lang: "es-MX", name: "Spanish Mexico" } as SpeechSynthesisVoice;
        const frVoice = { lang: "fr-FR", name: "French" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([frVoice, esMxVoice]);

        await hablar("Hola", "es", {});

        expect(mockUtterances.length).toBeGreaterThan(0);
        expect(mockUtterances[0].lang).toBe("es-mx");
    });

    it("cola frases y las habla una a la vez", async () => {
        const esVoice = { lang: "es-ES", name: "Spanish" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([esVoice]);

        await hablar("Primero", "es", {});
        await hablar("Segundo", "es", {});

        expect(mockUtterances.length).toBe(1);
        expect(mockUtterances[0].text).toBe("Primero");
    });
});

describe("detener()", () => {
    beforeEach(() => {
        mockVoices = [];
        mockUtterances = [];
    });

    it("cancela cualquier habla en curso", () => {
        detener();
        expect(mockUtterances).toEqual([]);
    });
});

describe("vocesDe(idioma)", () => {
    beforeEach(() => {
        mockVoices = [];
        mockUtterances = [];
    });

    it("devuelve voces para idioma exacto", () => {
        const esVoice = { lang: "es-ES", name: "Spanish" } as SpeechSynthesisVoice;
        const enVoice = { lang: "en-US", name: "English" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([enVoice, esVoice]);

        const spanishVoices = vocesDe("es-ES");
        expect(spanishVoices).toHaveLength(1);
        expect(spanishVoices[0].lang).toBe("es-ES");
    });

    it("devuelve voces con prefijo del idioma", () => {
        const esVoice = { lang: "es-ES", name: "Spanish Spain" } as SpeechSynthesisVoice;
        const esMxVoice = { lang: "es-MX", name: "Spanish Mexico" } as SpeechSynthesisVoice;
        const enVoice = { lang: "en-US", name: "English" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([enVoice, esMxVoice, esVoice]);

        const spanishVoices = vocesDe("es");
        expect(spanishVoices).toHaveLength(2);
        expect(spanishVoices.map(v => v.lang)).toEqual(["es-mx", "es-es"]);
    });

    it("devuelve array vacío cuando no hay voces para el idioma", () => {
        const enVoice = { lang: "en-US", name: "English" } as SpeechSynthesisVoice;
        setupSpeechSynthesisMock([enVoice]);

        const spanishVoices = vocesDe("ja");
        expect(spanishVoices).toEqual([]);
    });
});
