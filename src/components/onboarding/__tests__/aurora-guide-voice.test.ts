import { describe, it, expect, vi, beforeEach } from "vitest";
import { auroraTranscript, parseVoiceCommand } from "../aurora-guide-voice";

describe("aurora-guide-voice · funciones puras", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("auroraTranscript", () => {
        it("devuelve string vacío cuando no hay window", () => {
            // @ts-expect-error - simulamos entorno sin window
            const originalWindow = global.window;
            // @ts-expect-error
            delete global.window;
            try {
                expect(auroraTranscript()).toBe("");
            } finally {
                // @ts-expect-error
                global.window = originalWindow;
            }
        });

        it("devuelve string vacío cuando STARSEED_AURORA no existe", () => {
            global.window = { STARSEED_AURORA: undefined } as unknown as Window & typeof globalThis;
            expect(auroraTranscript()).toBe("");
        });

        it("devuelve transcript + interim cuando el puente existe y getState devuelve datos", () => {
            global.window = {
                STARSEED_AURORA: {
                    getState: () => ({ transcript: "hola", interim: "mundo" }),
                },
            } as unknown as Window & typeof globalThis;
            expect(auroraTranscript()).toBe("hola mundo");
        });

        it("devuelve solo transcript cuando interim es undefined", () => {
            global.window = {
                STARSEED_AURORA: {
                    getState: () => ({ transcript: "hola" }),
                },
            } as unknown as Window & typeof globalThis;
            expect(auroraTranscript()).toBe("hola");
        });

        it("devuelve solo interim cuando transcript es undefined", () => {
            global.window = {
                STARSEED_AURORA: {
                    getState: () => ({ interim: "mundo" }),
                },
            } as unknown as Window & typeof globalThis;
            expect(auroraTranscript()).toBe("mundo");
        });

        it("devuelve string vacío y avisa cuando getState lanza error", () => {
            global.window = {
                STARSEED_AURORA: {
                    getState: () => { throw new Error("fallo"); },
                },
            } as unknown as Window & typeof globalThis;
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            expect(auroraTranscript()).toBe("");
            expect(consoleWarnSpy).toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        it("devuelve string vacío cuando getState devuelve null", () => {
            global.window = {
                STARSEED_AURORA: {
                    getState: () => null,
                },
            } as unknown as Window & typeof globalThis;
            expect(auroraTranscript()).toBe("");
        });
    });

    

    describe("parseVoiceCommand", () => {
        it("detecta 'next' con palabras clave", () => {
            expect(parseVoiceCommand("siguiente")).toBe("next");
            expect(parseVoiceCommand("continúa")).toBe("next");
            expect(parseVoiceCommand("avanza")).toBe("next");
            expect(parseVoiceCommand("next")).toBe("next");
            expect(parseVoiceCommand("sigue")).toBe("next");
            expect(parseVoiceCommand("adelante")).toBe("next");
        });

        it("detecta 'prev' con palabras clave", () => {
            expect(parseVoiceCommand("anterior")).toBe("prev");
            expect(parseVoiceCommand("atrás")).toBe("prev");
            expect(parseVoiceCommand("vuelve")).toBe("prev");
            expect(parseVoiceCommand("previo")).toBe("prev");
            expect(parseVoiceCommand("back")).toBe("prev");
            expect(parseVoiceCommand("retrocede")).toBe("prev");
        });

        it("detecta 'close' con palabras clave", () => {
            expect(parseVoiceCommand("cerrar")).toBe("close");
            expect(parseVoiceCommand("salir")).toBe("close");
            expect(parseVoiceCommand("termina")).toBe("close");
            expect(parseVoiceCommand("listo")).toBe("close");
            expect(parseVoiceCommand("entendido")).toBe("close");
        });

        it("prioriza close sobre prev y next", () => {
            expect(parseVoiceCommand("cerrar siguiente")).toBe("close");
            expect(parseVoiceCommand("anterior cerrar")).toBe("close");
        });

        it("prioriza prev sobre next", () => {
            expect(parseVoiceCommand("anterior siguiente")).toBe("prev");
        });

        it("devuelve null para texto sin comandos", () => {
            expect(parseVoiceCommand("hola mundo")).toBeNull();
            expect(parseVoiceCommand("")).toBeNull();
            expect(parseVoiceCommand("   ")).toBeNull();
        });

        it("mira solo las últimas 4 palabras", () => {
            expect(parseVoiceCommand("hola mundo como estas siguiente")).toBe("next");
            expect(parseVoiceCommand("siguiente hola mundo como estas")).toBeNull();
        });

        it("es insensible a tildes y mayúsculas", () => {
            expect(parseVoiceCommand("SIGUIENTE")).toBe("next");
            expect(parseVoiceCommand("CONTINÚA")).toBe("next");
            expect(parseVoiceCommand("ATRÁS")).toBe("prev");
            expect(parseVoiceCommand("CERRAR")).toBe("close");
        });
    });
});