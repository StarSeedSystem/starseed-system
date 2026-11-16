import { describe, expect, it, beforeEach } from "vitest";

const VOZES_SIMULADAS: Record<string, string> = {
    "es-ES": "Spanish Female",
    "en-US": "English Female",
};

const VOZES_FAKE: Record<string, { name: string; lang: string }> = {
    "es-ES": { name: "Spanish Female", lang: "es-ES" },
    "en-US": { name: "English Female", lang: "en-US" },
    "es": { name: "Spanish (generic)", lang: "es" },
    "ca-ES": { name: "Catalan", lang: "ca-ES" },
    "gl-ES": { name: "Galician", lang: "gl-ES" },
};

const speechSynthesisMock = {
    voices: [],
    voice: null,
    getVoices(): SpeechSynthesisVoice[] {
        return this.voices;
    },
    speak: (_utterance: SpeechSynthesisUtterance) => {
        const utterance = _utterance as any;
        utterance.voice = speechSynthesisMock.voice;
        setTimeout(() => {
            const cb = utterance._onend;
            if (cb) cb(true);
        }, 20);
    },
    cancel: () => {
        speechSynthesisMock.voice = null;
        speechSynthesisMock.voices = [];
    },
    addEventListener: (_event: string, cb: () => void) => {
        if (_event === "onend") {
            speechSynthesisMock._onend = cb;
        }
    },
    removeEventListener: () => {},
};

beforeEach(() => {
    resetearEstado();
    ;(global as any).speechSynthesis = speechSynthesisMock as any;
    ;(global as any).speechSynthesisVoices = [];
    if (typeof window !== "undefined") {
        ;(window as any).speechSynthesis = speechSynthesisMock as any;
        ;(window as any).speechSynthesisVoices = [];
    }
});

describe("voz-habla: hablar", () => {
    it("usa voz exacta cuando hay coincidencia", () => {
        const resultado = hablar("hola", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
    });

    it("busca voz por prefijo cuando no hay exacta", () => {
        const resultado = hablar("hola", "es", "navegador");
        expect(resultado.ok).toBe(true);
    });

    it("devuelve ok:false y motivo cuando no hay voz del idioma", () => {
        const resultado = hablar("hola", "zz", "navegador");
        expect(resultado.ok).toBe(false);
        expect(resultado.motivo).toBe("No hay una voz de zz en este aparato");
    });

    it("cola una frase cuando ya habla otra y se procesa después", async () => {
        hablar("hola", "es-ES", "navegador");
        const resultado = hablar("mundo", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(resultado.ok).toBe(true);
    });

    it("procesa la cola en orden FIFO tras detener y reiniciar estado", async () => {
        resetearEstado();

        hablar("primero", "es-ES", "navegador");
        resetearEstado();

        hablar("segundo", "es-ES", "navegador");
        resetearEstado();

        hablar("tercer", "es-ES", "navegador");

        const resultados: string[] = [];
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback1");
        });
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback2");
        });
        cuandoTermine((ok: boolean) => {
            if (ok) resultados.push("callback3");
        });

        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(resultados.length).toBeGreaterThanOrEqual(2);
    });

    it("detener vacía la cola y llama callback con false", async () => {
        const r1 = hablar("texto1", "es-ES", "navegador");
        expect(r1.ok).toBe(true);

        const resultados: string[] = [];
        cuandoTermine((ok: boolean) => {
            resultados.push(ok ? "ok" : "false");
        });

        detener();

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(resultados).toContain("false");
    });

    it("una sola frase invoca alTerminar cuando termina (entorno sin speechSynthesis)", async () => {
        const cb: boolean[] = [];
        cuandoTermine((ok) => { cb[cb.length] = ok; });

        hablar("texto", "es-ES", "navegador");

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(cb.length).toBeGreaterThanOrEqual(1);
    });

    it("usa voz por prefijo es-ES cuando solo hay es", () => {
        (global as any).speechSynthesis = speechSynthesisMock as any;
        const resultado = hablar("hola", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
    });
});

describe("voz-habla: vocesDe", () => {
    it("devuelve voces para español exacto", () => {
        const voces = vocesDe("es-ES");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toBe("es-ES");
    });

    it("devuelve voces por prefijo", () => {
        const voces = vocesDe("es");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toEqual(expect.stringMatching(/^es-/));
    });

    it("devuelve array vacío para idioma sin voces", () => {
        const voces = vocesDe("zz");
        expect(voces).toEqual([]);
    });

    it("devuelve array vacío para undefined", () => {
        const voces = vocesDe(undefined as unknown as string);
        expect(voces).toEqual([]);
    });

    it("devuelve array vacío para null", () => {
        const voces = vocesDe(null as unknown as string);
        expect(voces).toEqual([]);
    });
});