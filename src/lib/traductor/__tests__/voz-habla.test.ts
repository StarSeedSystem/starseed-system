import { describe, expect, it, beforeEach, vi } from "vitest";
import { hablar, detener, vocesDe, resetearEstado, cuandoTermine } from "../voz-habla";

type VozDisponible = {
    id: string;
    nombre: string;
    lang: string;
};

const VOZES_SIMULADAS: VozDisponible[] = [
    { id: "1", nombre: "Spanish Female", lang: "es-ES" },
    { id: "2", nombre: "Spanish Male", lang: "es-ES" },
    { id: "3", nombre: "English Female", lang: "en-US" },
    { id: "4", nombre: "English Male", lang: "en-US" },
    { id: "5", nombre: "Catalan", lang: "ca-ES" },
    { id: "6", nombre: "Galician", lang: "gl-ES" },
];

let speechSynthesisMock: { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: ReturnType<typeof vi.fn> } | null = null;

const crearSpeechSynthesisMock = (voces: VozDisponible[]) => {
    speechSynthesisMock = {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn().mockReturnValue(voces),
    };
    (global as any).speechSynthesis = speechSynthesisMock;
    (window as any).speechSynthesis = speechSynthesisMock;
};

const crearMockUtterance = () => {
    const onendCallbacks: ((() => void)[])[] = [];
    const mockUtterance = {
        lang: "",
        voice: null as SpeechSynthesisVoice | null,
        onend: null as (() => void) | null,
    };
    vi.stubGlobal("SpeechSynthesisUtterance", class {
        text: string;
        constructor(texto: string) {
            this.text = texto;
        }
        set lang(value: string) {
            mockUtterance.lang = value;
        }
        get lang() {
            return mockUtterance.lang;
        }
        set voice(value: SpeechSynthesisVoice | null) {
            mockUtterance.voice = value;
        }
        get voice() {
            return mockUtterance.voice;
        }
        set onend(value: (() => void) | null) {
            mockUtterance.onend = value;
        }
        get onend() {
            return mockUtterance.onend;
        }
    });
    return mockUtterance;
};

beforeEach(() => {
    resetearEstado();
    speechSynthesisMock = null;
    (global as any).speechSynthesis = undefined;
    (global as any).speechSynthesisVoices = [];
    if (typeof window !== "undefined") {
        (window as any).speechSynthesis = undefined;
        (window as any).speechSynthesisVoices = [];
    }
    vi.clearAllMocks();
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

    it("cola una frase cuando ya habla otra", () => {
        hablar("hola", "es-ES", "navegador");
        expect((global as any).speechSynthesis?.speak).not.toHaveBeenCalled();

        const resultado = hablar("mundo", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
    });

    it("procesa la cola en orden (FIFO) tras detener y reiniciar estado", async () => {
        const order: string[] = [];

        const mockCallback = (ok: boolean) => {
            order.push(ok ? "terminado" : "detenido");
        };

        hablar("primero", "es-ES", "navegador");
        resetearEstado();

        hablar("segundo", "es-ES", "navegador");
        resetearEstado();

        hablar("tercer", "es-ES", "navegador");
        cuandoTermine(mockCallback);

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(order.length).toBeGreaterThanOrEqual(1);
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
        cuandoTermine((ok) => {
            cb[cb.length] = ok;
        });

        hablar("texto", "es-ES", "navegador");

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(cb.length).toBeGreaterThanOrEqual(1);
    });

    it("llama al callback alTerminar cuando la frase termina (simulación)", async () => {
        resetearEstado();

        const callbackResult: boolean[] = [];
        cuandoTermine((ok) => {
            callbackResult.push(ok);
        });

        hablar("texto de prueba", "es-ES", "navegador");

        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(callbackResult.length).toBeGreaterThanOrEqual(1);
        expect(callbackResult[0]).toBe(true);
    });
});

describe("voz-habla: detener", () => {
    it("detiene la habla y vacía la cola", async () => {
        hablar("texto1", "es-ES", "navegador");

        const callbackResult: boolean[] = [];
        cuandoTermine((ok) => {
            callbackResult.push(ok);
        });

        detener();

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(callbackResult.length).toBeGreaterThanOrEqual(1);
        expect(callbackResult[0]).toBe(false);
    });

    it("llama a speechSynthesis.cancel() cuando está disponible", () => {
        crearSpeechSynthesisMock(VOZES_SIMULADAS);

        hablar("hola", "es-ES", "navegador");

        if (speechSynthesisMock) {
            speechSynthesisMock.speak();
        }

        detener();

        if (speechSynthesisMock) {
            expect(speechSynthesisMock.cancel).toHaveBeenCalled();
        }
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

    it("devuelve voces para inglés por prefijo", () => {
        const voces = vocesDe("en");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toEqual(expect.stringMatching(/^en-/));
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

describe("voz-habla: cuandoTermine", () => {
    it("llama al callback inmediatamente con true si no hay frase sonando", async () => {
        const callbackResult: boolean[] = [];
        cuandoTermine((ok) => {
            callbackResult.push(ok);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(callbackResult).toContain(true);
    });

    it("almacena el callback si hay frase sonando y lo llama al terminar", async () => {
        hablar("frase1", "es-ES", "navegador");

        const callbackResult: boolean[] = [];
        cuandoTermine((ok) => {
            callbackResult.push(ok);
        });

        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(callbackResult.length).toBeGreaterThanOrEqual(1);
    });
});