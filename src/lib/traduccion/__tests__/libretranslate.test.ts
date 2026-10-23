import { describe, expect, it } from "vitest";
import {
    agruparEnLotes,
    crearClienteLibreTranslate,
    ErrorLibreTranslate,
    mensajeDeError,
} from "../libretranslate";
type Llamada = { url: string; init?: RequestInit; cuerpo: unknown };

function respuesta(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

function montarCliente(manejador: (url: string, init?: RequestInit) => Response, limite = 5000) {
    const llamadas: Llamada[] = [];
    const falso = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
        llamadas.push({ url: String(entrada), init, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        return manejador(String(entrada), init);
    }) as typeof fetch;
    return { cliente: crearClienteLibreTranslate({ base: "http://127.0.0.1:5000/", fetch: falso, limiteCaracteres: limite }), llamadas };
}

describe("agruparEnLotes", () => {
    it("parte por caracteres, conserva el orden y deja solo el texto que supera el límite", () => {
        expect(agruparEnLotes(["aaaa", "bb", "ccccc"], 6)).toEqual([["aaaa", "bb"], ["ccccc"]]);
        expect(agruparEnLotes(["uno", "dos", "tres"], 6)).toEqual([["uno", "dos"], ["tres"]]);
        expect(agruparEnLotes(["1234567890"], 5)).toEqual([["1234567890"]]);
        expect(agruparEnLotes([], 5)).toEqual([]);
    });
});

describe("traducir", () => {
    it("manda POST /translate con source, target, format y devuelve el idioma detectado", async () => {
        const { cliente, llamadas } = montarCliente(() =>
            respuesta({ translatedText: "Hola", detectedLanguage: { confidence: 0.98, language: "en" } }),
        );
        const resultado = await cliente.traducir({ q: "Hello", source: "auto", target: "es", format: "html" });
        expect(resultado).toEqual({ translatedText: "Hola", detectedLanguage: { confidence: 0.98, language: "en" } });
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0].url).toBe("http://127.0.0.1:5000/translate");
        expect(llamadas[0].init?.method).toBe("POST");
        expect(llamadas[0].cuerpo).toEqual({ q: "Hello", source: "auto", target: "es", format: "html" });
    });

    it("parte una lista en lotes y vuelve a juntarla en el mismo orden", async () => {
        const { cliente, llamadas } = montarCliente((_url, init) => {
            const q = (JSON.parse(String(init?.body)).q as string[]).map((t) => `[${t}]`);
            return respuesta({ translatedText: q, detectedLanguage: { confidence: 0.7, language: "en" } });
        }, 6);
        const resultado = await cliente.traducir({ q: ["uno", "dos", "tres"], target: "es" });
        expect(resultado.translatedText).toEqual(["[uno]", "[dos]", "[tres]"]);
        expect(resultado.detectedLanguage).toEqual({ confidence: 0.7, language: "en" });
        expect(llamadas.map((l) => (l.cuerpo as { q: string[] }).q)).toEqual([["uno", "dos"], ["tres"]]);
    });
});

describe("clave de API y validaciones", () => {
    it("solo manda api_key si el llamador la pasa y no la guarda entre llamadas", async () => {
        const { cliente, llamadas } = montarCliente(() => respuesta({ translatedText: "ok" }));
        await cliente.traducir({ q: "hola", target: "en", api_key: "secreta" });
        await cliente.traducir({ q: "hola", target: "en" });
        expect((llamadas[0].cuerpo as Record<string, unknown>).api_key).toBe("secreta");
        expect(llamadas[1].cuerpo).not.toHaveProperty("api_key");
    });

    it("no llama con una lista vacía y exige el idioma de destino", async () => {
        const { cliente, llamadas } = montarCliente(() => respuesta({ translatedText: "x" }));
        expect(await cliente.traducir({ q: [], target: "es" })).toEqual({ translatedText: [] });
        expect(llamadas).toHaveLength(0);
        await expect(cliente.traducir({ q: "hola", target: "  " })).rejects.toThrow("Falta el idioma de destino");
    });
});

describe("errores", () => {
    it("traduce 400, 403, 429 y 500 a mensajes claros en español", async () => {
        for (const estado of [400, 403, 429, 500]) {
            const { cliente } = montarCliente(() => respuesta({ error: "x" }, estado));
            const error: unknown = await cliente.traducir({ q: "hola", target: "en" }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ErrorLibreTranslate);
            expect((error as ErrorLibreTranslate).estado).toBe(estado);
            expect((error as ErrorLibreTranslate).message).toBe(mensajeDeError(estado));
            expect((error as ErrorLibreTranslate).message).toContain(String(estado));
        }
    });

    it("avisa cuando no hay conexión y cuando la traducción viene mal formada", async () => {
        const caido = montarCliente(() => { throw new Error("sin red"); }).cliente;
        await expect(caido.salud()).rejects.toThrow("No se pudo conectar con LibreTranslate");
        const raro = montarCliente(() => respuesta({ translatedText: 7 })).cliente;
        await expect(raro.traducir({ q: "hola", target: "en" })).rejects.toThrow("formato inesperado");
    });
});

describe("idiomas, detectar y salud", () => {
    it("lee GET /languages y descarta filas sin código o nombre", async () => {
        const { cliente, llamadas } = montarCliente(() => respuesta([
            { code: "es", name: "Español", targets: ["en", "fr"] },
            { code: "en", name: "Inglés" },
            { code: 3, name: "Malo" },
        ]));
        expect(await cliente.idiomas()).toEqual([
            { code: "es", name: "Español", targets: ["en", "fr"] },
            { code: "en", name: "Inglés", targets: [] },
        ]);
        expect(llamadas[0].url).toBe("http://127.0.0.1:5000/languages");
    });

    it("detecta con POST /detect y lee GET /health", async () => {
        const { cliente, llamadas } = montarCliente((_url, init) => {
            if (String(_url).endsWith("/health")) return respuesta({ status: "ok" });
            const q = JSON.parse(String(init?.body)).q as string | string[];
            const una = { confidence: 0.9, language: "es" };
            return respuesta(Array.isArray(q) ? q.map(() => una) : [una]);
        });
        expect(await cliente.detectar("hola")).toEqual({ confidence: 0.9, language: "es" });
        expect(llamadas[0].url).toBe("http://127.0.0.1:5000/detect");
        await expect(cliente.salud()).resolves.toEqual({ status: "ok" });
        expect(llamadas[1].url).toBe("http://127.0.0.1:5000/health");
    });
});
