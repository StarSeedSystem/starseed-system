import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { hablar, detener, vocesDe, resetearEstado, cuandoTermine, __establecerProveedorVoces } from "../voz-habla";

type VozSimulada = { id: string; nombre: string; lang: string };
type UtteranceSimulado = { text: string; lang: string; voice: VozSimulada | null; onend: (() => void) | null; onerror: (() => void) | null };

let SpeechSynthesisUtteranceOriginal: typeof SpeechSynthesisUtterance | undefined;

function instalarSpeechSynthesisUtteranceFalso() {
    SpeechSynthesisUtteranceOriginal = global.SpeechSynthesisUtterance;
    class UtteranceFalso implements SpeechSynthesisUtterance {
        text: string;
        lang: string;
        voice: SpeechSynthesisVoice | null = null;
        volume = 1;
        rate = 1;
        pitch = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onstart: (() => void) | null = null;
        onpause: (() => void) | null = null;
        onresume: (() => void) | null = null;
        onboundary: (() => void) | null = null;
        onmark: (() => void) | null = null;

        constructor(text: string) {
            this.text = text;
            this.lang = "";
        }

        addEventListener(): void {}
        removeEventListener(): void {}
        dispatchEvent(): boolean { return true; }
    }
    global.SpeechSynthesisUtterance = UtteranceFalso as unknown as typeof SpeechSynthesisUtterance;
}

function desinstalarSpeechSynthesisUtteranceFalso() {
    if (SpeechSynthesisUtteranceOriginal) {
        global.SpeechSynthesisUtterance = SpeechSynthesisUtteranceOriginal;
    } else {
        delete (global as any).SpeechSynthesisUtterance;
    }
}

const VOZES_BASE: VozSimulada[] = [
    { id: "1", nombre: "Spanish Female", lang: "es-ES" },
    { id: "2", nombre: "Spanish Male", lang: "es-ES" },
    { id: "3", nombre: "English Female", lang: "en-US" },
    { id: "4", nombre: "English Male", lang: "en-US" },
    { id: "5", nombre: "Catalan", lang: "ca-ES" },
    { id: "6", nombre: "Galician", lang: "gl-ES" },
];

let utterancesCreados: UtteranceSimulado[] = [];
let synthCancelado = false;

function crearSpeechSynthesisFalso(voces: VozSimulada[] = VOZES_BASE) {
    utterancesCreados = [];
    synthCancelado = false;

    const synth = {
        getVoices: () => voces.map((v) => ({ name: v.nombre, lang: v.lang })),
        speak: (u: UtteranceSimulado) => {
            utterancesCreados.push(u);
            setTimeout(() => {
                if (!synthCancelado && u.onend) u.onend();
            }, 0);
        },
        cancel: () => {
            synthCancelado = true;
            utterancesCreados.forEach((u) => {
                if (u.onerror) u.onerror();
            });
        },
        pending: false,
        speaking: false,
        paused: false,
    };

    return synth;
}

function instalarSpeechSynthesisFalso(voces?: VozSimulada[]) {
    const synth = crearSpeechSynthesisFalso(voces);
    Object.defineProperty(global, "speechSynthesis", {
        value: synth,
        writable: true,
        configurable: true,
    });
    if (typeof window !== "undefined") {
        Object.defineProperty(window, "speechSynthesis", {
            value: synth,
            writable: true,
            configurable: true,
        });
    }
    return synth;
}

function desinstalarSpeechSynthesisFalso() {
    Object.defineProperty(global, "speechSynthesis", {
        value: undefined,
        writable: true,
        configurable: true,
    });
    if (typeof window !== "undefined") {
        Object.defineProperty(window, "speechSynthesis", {
            value: undefined,
            writable: true,
            configurable: true,
        });
    }
}

beforeEach(() => {
    resetearEstado();
    desinstalarSpeechSynthesisFalso();
    instalarSpeechSynthesisUtteranceFalso();
    __establecerProveedorVoces(() => VOZES_BASE);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    desinstalarSpeechSynthesisUtteranceFalso();
});

describe("voz-habla: hablar", () => {
    it("usa voz exacta cuando hay coincidencia", () => {
        instalarSpeechSynthesisFalso();
        const resultado = hablar("hola", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
        expect(utterancesCreados.length).toBe(1);
        expect(utterancesCreados[0].lang).toBe("es-ES");
        expect(utterancesCreados[0].voice?.lang).toBe("es-ES");
    });

    it("busca voz por prefijo cuando no hay exacta", () => {
        instalarSpeechSynthesisFalso();
        const resultado = hablar("hola", "es", "navegador");
        expect(resultado.ok).toBe(true);
        expect(utterancesCreados.length).toBe(1);
        expect(utterancesCreados[0].voice?.lang).toMatch(/^es-/);
    });

    it("devuelve ok:false y motivo cuando no hay voz del idioma", () => {
        instalarSpeechSynthesisFalso([{ id: "1", nombre: "English", lang: "en-US" }]);
        const resultado = hablar("hola", "zz", "navegador");
        expect(resultado.ok).toBe(false);
        expect(resultado.motivo).toBe("No hay una voz de zz en este aparato");
        expect(utterancesCreados.length).toBe(0);
    });

    it("cola una frase cuando ya habla otra y se procesa después", async () => {
        instalarSpeechSynthesisFalso();
        hablar("hola", "es-ES", "navegador");
        const resultado = hablar("mundo", "es-ES", "navegador");
        expect(resultado.ok).toBe(true);
        expect(utterancesCreados.length).toBe(1);

        vi.advanceTimersByTime(50);

        expect(utterancesCreados.length).toBe(2);
        expect(utterancesCreados[1].text).toBe("mundo");
    });

    it("procesa la cola en orden FIFO", async () => {
        instalarSpeechSynthesisFalso();
        hablar("primero", "es-ES", "navegador");
        hablar("segundo", "es-ES", "navegador");
        hablar("tercero", "es-ES", "navegador");

        expect(utterancesCreados.length).toBe(1);
        expect(utterancesCreados[0].text).toBe("primero");

        vi.advanceTimersByTime(50);

        expect(utterancesCreados.length).toBe(2);
        expect(utterancesCreados[1].text).toBe("segundo");

        vi.advanceTimersByTime(50);

        expect(utterancesCreados.length).toBe(3);
        expect(utterancesCreados[2].text).toBe("tercero");
    });

    it("detener vacía la cola y llama callback con false", async () => {
        instalarSpeechSynthesisFalso();
        const r1 = hablar("texto1", "es-ES", "navegador");
        expect(r1.ok).toBe(true);

        const resultados: boolean[] = [];
        cuandoTermine((ok: boolean) => {
            resultados.push(ok);
        });

        detener();

        vi.advanceTimersByTime(50);

        expect(resultados).toContain(false);
    });

    it("una sola frase invoca alTerminar cuando termina (entorno sin speechSynthesis)", async () => {
        const cb: boolean[] = [];
        cuandoTermine((ok) => { cb.push(ok); });

        hablar("texto", "es-ES", "navegador");

        vi.advanceTimersByTime(50);

        expect(cb).toContain(true);
    });

    it("cuandoTermine invoca inmediatamente si no hay nada sonando", async () => {
        const cb: boolean[] = [];
        cuandoTermine((ok) => { cb.push(ok); });

        vi.advanceTimersByTime(10);

        expect(cb).toContain(true);
    });
});

describe("voz-habla: vocesDe", () => {
    it("devuelve voces para español exacto", () => {
        instalarSpeechSynthesisFalso();
        const voces = vocesDe("es-ES");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toBe("es-ES");
    });

    it("devuelve voces por prefijo", () => {
        instalarSpeechSynthesisFalso();
        const voces = vocesDe("es");
        expect(voces.length).toBeGreaterThan(0);
        expect(voces[0].lang).toMatch(/^es-/);
    });

    it("devuelve array vacío para idioma sin voces", () => {
        instalarSpeechSynthesisFalso([{ id: "1", nombre: "English", lang: "en-US" }]);
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

    it("respeta proveedor personalizado en tests", () => {
        const vocesCustom: VozSimulada[] = [
            { id: "x1", nombre: "Test Voice", lang: "test-XX" },
        ];
        __establecerProveedorVoces(() => vocesCustom);
        const voces = vocesDe("test-XX");
        expect(voces.length).toBe(1);
        expect(voces[0].lang).toBe("test-XX");
    });
});

describe("voz-habla: resetearEstado", () => {
    it("reinicia el estado permitiendo nueva habla", () => {
        instalarSpeechSynthesisFalso();
        hablar("uno", "es-ES", "navegador");
        resetearEstado();
        instalarSpeechSynthesisFalso();
        const r = hablar("dos", "es-ES", "navegador");
        expect(r.ok).toBe(true);
        expect(utterancesCreados.length).toBe(1);
        expect(utterancesCreados[0].text).toBe("dos");
    });
});