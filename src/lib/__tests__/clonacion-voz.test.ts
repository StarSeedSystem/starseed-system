import { describe, expect, it, vi, afterEach } from "vitest";
import {
    MUESTRA_MIN_S,
    MUESTRA_MAX_S,
    TEXTO_MIN,
    TEXTO_MAX,
    langBase,
    validarDuracion,
    validarMuestra,
    validarTextoMuestra,
    validarTimbreId,
} from "../voces/clonacion";
import { sintetizarEnDaemon } from "../aurora/voz-starseed/daemon";

// Tests de la capa OS del flujo de clonación con poco audio (Ola 266, Forja
// fase 4, 2026-09-07): validaciones puras y el envío de `clon` al daemon.

describe("validaciones de la muestra de clonación", () => {
    it("la duración acepta el rango 3-20 s", () => {
        expect(validarDuracion(MUESTRA_MIN_S)).toBeNull();
        expect(validarDuracion(MUESTRA_MAX_S)).toBeNull();
        expect(validarDuracion(10.5)).toBeNull();
    });

    it("la duración rechaza demasiado corta, larga o ilegible", () => {
        expect(validarDuracion(MUESTRA_MIN_S - 0.1)).toContain("segundos");
        expect(validarDuracion(MUESTRA_MAX_S + 0.1)).toContain("segundos");
        expect(validarDuracion(Number.NaN)).toContain("duración");
        expect(validarDuracion(0)).toContain("duración");
    });

    it("el texto acepta el rango de 20-400 caracteres", () => {
        expect(validarTextoMuestra("a".repeat(TEXTO_MIN))).toBeNull();
        expect(validarTextoMuestra("a".repeat(TEXTO_MAX))).toBeNull();
    });

    it("el texto rechaza corto, largo o vacío", () => {
        expect(validarTextoMuestra("a".repeat(TEXTO_MIN - 1))).toContain("caracteres");
        expect(validarTextoMuestra("a".repeat(TEXTO_MAX + 1))).toContain("caracteres");
        expect(validarTextoMuestra("   ")).toContain("caracteres");
    });

    it("el timbre acepta ids seguros y rechaza el resto", () => {
        expect(validarTimbreId("aurora-2")).toBeNull();
        expect(validarTimbreId("ab")).toBeNull();
        expect(validarTimbreId("x")).toContain("timbre");
        expect(validarTimbreId("Mayúsculas_No")).toContain("timbre");
        expect(validarTimbreId("../malvado")).toContain("timbre");
        expect(validarTimbreId("a".repeat(41))).toContain("timbre");
    });

    it("la muestra exige consentimiento, audio y campos válidos", () => {
        const audio = new Blob(["x"]);
        const texto = "a".repeat(40);
        expect(validarMuestra({ audio, texto, timbreId: "ok", consentimiento: false })).toContain("consentimiento");
        expect(validarMuestra({ audio: new Blob([]), texto, timbreId: "ok", consentimiento: true })).toContain("audio");
        expect(validarMuestra({ audio, texto, timbreId: "ok", consentimiento: true })).toBeNull();
    });

    it("el idioma se reduce a su base en minúsculas", () => {
        expect(langBase("es-ES")).toBe("es");
        expect(langBase("EN_us")).toBe("en");
        expect(langBase(undefined)).toBe("es");
        expect(langBase("")).toBe("es");
    });
});

describe("sintetizarEnDaemon con clon activo", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function capturarSegundaPuerta(): Promise<{ url: string; body: Record<string, unknown> }> {
        return new Promise((resolve) => {
            let llamada = 0;
            vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
                llamada += 1;
                if (llamada === 1) {
                    // Primera puerta (tts-server crudo, 4500): no está.
                    throw new Error("sin tts-server crudo");
                }
                resolve({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
                return new Response(new Uint8Array([82, 73, 70, 70, 1]), {
                    status: 200,
                    headers: { "Content-Type": "audio/wav" },
                });
            }));
        });
    }

    it("envía `clon: true` al demonio Astraura cuando se pide", async () => {
        const visto = capturarSegundaPuerta();
        await sintetizarEnDaemon("hola", { voz: "aurora", speed: 1, clon: true });
        const { url, body } = await visto;
        expect(url).toContain(":4444/tts");
        expect(body.clon).toBe(true);
        expect(body.personality).toBe("aurora");
    });

    it("no envía `clon` cuando no se pide", async () => {
        const visto = capturarSegundaPuerta();
        await sintetizarEnDaemon("hola", { voz: "aurora", speed: 1 });
        const { body } = await visto;
        expect("clon" in body).toBe(false);
    });
});
