import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";

describe("trocearTexto", () => {
    it("parte un texto largo en trozos de <= max sin cortar palabras", () => {
        const texto = "Hola mundo. Esto es una prueba. Otra frase más. Y otra. " + "x".repeat(200);
        const trozos = trocearTexto(texto, 100);
        expect(trozos.length).toBeGreaterThan(1);
        for (const t of trozos) {
            expect(t.length).toBeLessThanOrEqual(100);
        }
        expect(trozos.join(" ")).toContain("Hola mundo");
    });

    it("corta por frontera de frase (puntuación + espacio)", () => {
        const trozos = trocearTexto("Primera frase. Segunda frase. Tercera.", 20);
        expect(trozos[0]).toBe("Primera frase.");
        expect(trozos[1]).toBe("Segunda frase.");
        expect(trozos[2]).toBe("Tercera.");
    });

    it("corta por coma si no hay frontera de frase", () => {
        const trozos = trocearTexto("Uno, dos, tres, cuatro, cinco", 12);
        expect(trozos[0]).toBe("Uno, dos,");
        expect(trozos[1]).toBe("tres,");
        expect(trozos[2]).toBe("cuatro,");
        expect(trozos[3]).toBe("cinco");
    });

    it("corta por espacio si no hay coma ni frase", () => {
        const trozos = trocearTexto("uno dos tres cuatro cinco", 10);
        expect(trozos[0]).toBe("uno dos");
        expect(trozos[1]).toBe("tres");
        expect(trozos[2]).toBe("cuatro");
        expect(trozos[3]).toBe("cinco");
    });

    it("parte forzada si una palabra supera max", () => {
        const trozos = trocearTexto("supercalifragilistico", 5);
        expect(trozos[0]).toBe("super");
        expect(trozos[1]).toBe("calif");
        expect(trozos[2]).toBe("ragil");
        expect(trozos[3]).toBe("istic");
        expect(trozos[4]).toBe("o");
    });

    it("texto vacío devuelve array vacío", () => {
        expect(trocearTexto("", 100)).toEqual([]);
        expect(trocearTexto("   ", 100)).toEqual([]);
    });
});

// Tests for hablarPorNube con trozos (mocked fetch)
describe("hablarPorNube - trozos", () => {
    const mockTimbre = {
        genero: "femenino",
        local: { voz: "test", speed: 1, instruct: "", seed: 0, pitch: 1 },
        sistema: { pitch: 1, rate: 1 },
        expr: {},
    };

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("pide trozos de <= 500 en orden y suena mientras el anterior reproduce", async () => {
        const { hablarPorNube } = await import("@/lib/aurora/voz-starseed/motor");

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(new Blob(["audio1"], { type: "audio/mpeg" })),
            })
            .mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(new Blob(["audio2"], { type: "audio/mpeg" })),
            })
            .mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(new Blob(["audio3"], { type: "audio/mpeg" })),
            });

        const originalFetch = global.fetch;
        global.fetch = fetchMock;

        const reproducirMock = vi.fn().mockResolvedValue(true);
        vi.doMock("@/lib/aurora/motor-local", () => ({
            reproducirLocal: reproducirMock,
            estadoMotorLocal: () => Promise.resolve({ listo: true }),
            esperarListo: () => Promise.resolve(true),
            hablarLocalPorFrases: () => Promise.resolve(true),
            precalentarMotorLocal: () => {},
        }), { virtual: true });

        const texto = "A".repeat(1500); // ~3-4 trozos de 500
        const resultado = await hablarPorNube(texto, mockTimbre, vi.fn());

        expect(resultado).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(reproducirMock).toHaveBeenCalledTimes(3);

        global.fetch = originalFetch;
    });

    it("reintenta una vez si un trozo falla y sigue con el resto", async () => {
        const { hablarPorNube } = await import("@/lib/aurora/voz-starseed/motor");

        let callCount = 0;
        const fetchMock = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 2) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                });
            }
            return Promise.resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
            });
        });

        const originalFetch = global.fetch;
        global.fetch = fetchMock;

        const reproducirMock = vi.fn().mockResolvedValue(true);
        vi.doMock("@/lib/aurora/motor-local", () => ({
            reproducirLocal: reproducirMock,
            estadoMotorLocal: () => Promise.resolve({ listo: true }),
            esperarListo: () => Promise.resolve(true),
            hablarLocalPorFrases: () => Promise.resolve(true),
            precalentarMotorLocal: () => {},
        }), { virtual: true });

        const texto = "A".repeat(1200); // 3 trozos
        const resultado = await hablarPorNube(texto, mockTimbre, vi.fn());

        expect(resultado).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(4); // 3 trozos + 1 reintento

        global.fetch = originalFetch;
    });

    it("devuelve false para el resto si un trozo falla tras reintento", async () => {
        const { hablarPorNube } = await import("@/lib/aurora/voz-starseed/motor");

        let callCount = 0;
        const fetchMock = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 2 || callCount === 3) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                });
            }
            return Promise.resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
            });
        });

        const originalFetch = global.fetch;
        global.fetch = fetchMock;

        const reproducirMock = vi.fn().mockResolvedValue(true);
        vi.doMock("@/lib/aurora/motor-local", () => ({
            reproducirLocal: reproducirMock,
            estadoMotorLocal: () => Promise.resolve({ listo: true }),
            esperarListo: () => Promise.resolve(true),
            hablarLocalPorFrases: () => Promise.resolve(true),
            precalentarMotorLocal: () => {},
        }), { virtual: true });

        const texto = "A".repeat(1200); // 3 trozos
        const resultado = await hablarPorNube(texto, mockTimbre, vi.fn());

        expect(resultado).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(3); // 1er trozo OK + 2 intentos del 2do = 3

        global.fetch = originalFetch;
    });
});

// Tests for hablarPorSistema con trozos (mocked speechSynthesis)
describe("hablarPorSistema - trozos", () => {
    const mockTimbre = {
        genero: "femenino",
        local: { voz: "test", speed: 1, instruct: "", seed: 0, pitch: 1 },
        sistema: { pitch: 1.1, rate: 1.2 },
        expr: {},
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        // Mock window para que el código crea que está en el navegador
        (global as any).window = {
            speechSynthesis: undefined,
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (global as any).window;
    });

    it("trocearTexto produce 3 trozos para 500 chars", () => {
        const trozos = trocearTexto("A".repeat(500), 200);
        expect(trozos.length).toBe(3);
        expect(trozos[0].length).toBe(200);
        expect(trozos[1].length).toBe(200);
        expect(trozos[2].length).toBe(100);
    });

    it("usa una utterance por trozo (<= 200) en fila sin cancel entre trozos", async () => {
        const { hablarPorSistema } = await import("@/lib/aurora/voz-starseed/motor");

        const speakMock = vi.fn();
        const cancelMock = vi.fn();

        const synth = {
            speak: speakMock,
            cancel: cancelMock,
            getVoices: () => [],
        };

        // Mock window.speechSynthesis
        Object.defineProperty((global as any).window, "speechSynthesis", {
            value: synth,
            writable: true,
            configurable: true,
        });

        const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null }> = [];
        const SpeechSynthesisUtteranceMock = vi.fn().mockImplementation((texto) => {
            const u = {
                text: texto,
                pitch: 1,
                rate: 1,
                lang: "es-ES",
                onstart: null,
                onend: null,
                onerror: null,
            };
            utterances.push(u);
            return u;
        });

        global.SpeechSynthesisUtterance = SpeechSynthesisUtteranceMock;

        const texto = "A".repeat(500); // ~3 trozos de 200
        const alEmpezar = vi.fn();

        const promise = hablarPorSistema(texto, mockTimbre, alEmpezar);

        // Dar tiempo a que se cree la primera utterance
        await Promise.resolve();
        
        // Resolver las promises de onend manualmente, esperando a que se creen
        let processed = 0;
        while (processed < 3) {
            if (utterances[processed]) {
                utterances[processed].onend?.();
                await Promise.resolve(); // flush microtasks
                processed++;
            } else {
                await Promise.resolve(); // esperar a que se cree el siguiente
            }
        }

        const resultado = await promise;

        expect(resultado).toBe(true);
        expect(SpeechSynthesisUtteranceMock).toHaveBeenCalledTimes(3);
        expect(cancelMock).toHaveBeenCalledTimes(1); // solo al inicio
        expect(speakMock).toHaveBeenCalledTimes(3);

        // Verificar que no se llama cancel entre trozos
        const cancelCalls = cancelMock.mock.calls.length;
        expect(cancelCalls).toBe(1);
    });

    it("aplica pitch y rate del timbre a cada utterance", async () => {
        const { hablarPorSistema } = await import("@/lib/aurora/voz-starseed/motor");

        const speakMock = vi.fn();
        const cancelMock = vi.fn();

        const synth = {
            speak: speakMock,
            cancel: cancelMock,
            getVoices: () => [],
        };

        Object.defineProperty(global, "speechSynthesis", {
            value: synth,
            writable: true,
            configurable: true,
        });

        const SpeechSynthesisUtteranceMock = vi.fn().mockImplementation((texto) => ({
            text: texto,
            pitch: 1,
            rate: 1,
            lang: "es-ES",
            onstart: null,
            onend: null,
            onerror: null,
        }));

        global.SpeechSynthesisUtterance = SpeechSynthesisUtteranceMock;

        const texto = "Hola mundo. " + "B".repeat(200);
        await hablarPorSistema(texto, mockTimbre, vi.fn());

        const utterances = SpeechSynthesisUtteranceMock.mock.results.map(r => r.value);
        for (const u of utterances) {
            expect(u.pitch).toBeCloseTo(1.1, 1);
            expect(u.rate).toBeCloseTo(1.2, 1);
            expect(u.lang).toBe("es-ES");
        }
    });
});