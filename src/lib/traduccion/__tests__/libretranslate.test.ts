/* TRD1020A · Parte 2 — pruebas del cliente puro de LibreTranslate (fetch inyectado, sin red). Contrato: repos-libreria-1020d.md §4. */

import { describe, it, expect } from "vitest";
import { crearClienteLibreTranslate } from "../libretranslate";

const BASE = "http://lt.local";
type Cuerpo = Record<string, unknown> | null;
type Peticion = { url: string; metodo: string; cuerpo: Cuerpo };

function crearFetchFalso(respuesta: (p: { url: string; metodo: string; cuerpo: Cuerpo }) => Response) {
    const llamadas: Peticion[] = [];
    const f = async (entrada: string | URL | Request, init?: RequestInit) => {
        const url = String(entrada instanceof URL ? entrada.toString() : entrada);
        const cuerpo = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
        const metodo = (init?.method ?? "GET").toUpperCase();
        llamadas.push({ url, metodo, cuerpo });
        return respuesta({ url, metodo, cuerpo });
    };
    return { f, llamadas };
}

const conJson = (datos: unknown, estado = 200) =>
    new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });

describe("Cliente puro de LibreTranslate", () => {
    it("traducir manda POST {base}/translate y devuelve translatedText", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: "hello" }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        const r = await cliente.traducir({ q: "hola", source: "es", target: "en", format: "text" });
        expect(r.translatedText).toBe("hello");
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0]?.metodo).toBe("POST");
        expect(llamadas[0]?.url).toBe(`${BASE}/translate`);
        expect(llamadas[0]?.cuerpo).toEqual({ q: "hola", source: "es", target: "en", format: "text" });
    });

    it("con source auto devuelve también detectedLanguage y manda «auto»", async () => {
        const { f, llamadas } = crearFetchFalso(() =>
            conJson({ translatedText: "hello", detectedLanguage: { language: "en", confidence: 0.97 } }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        const r = await cliente.traducir({ q: "hola mundo", source: "auto", target: "en", format: "text" });
        expect(r.translatedText).toBe("hello");
        expect(r.detectedLanguage?.language).toBe("en");
        expect(llamadas[0]?.cuerpo).toEqual({ q: "hola mundo", source: "auto", target: "en", format: "text" });
    });
    it("api_key solo si quien llama la pasa, y nunca se queda guardada", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: "x" }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        await cliente.traducir({ q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA" });
        await cliente.traducir({ q: "b", source: "es", target: "en", format: "text" });
        expect(llamadas[0]?.cuerpo).toEqual({ q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA" });
        expect(llamadas[1]?.cuerpo).not.toHaveProperty("api_key");
    });
    it("traducir una lista en un lote devuelve los textos en el mismo orden", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: ["HELLO", "THERE", "THIRD"] }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        const r = await cliente.traducir({ q: ["uno", "dos", "tres"], source: "en", target: "es", format: "text" });
        expect(r.translatedText).toEqual(["HELLO", "THERE", "THIRD"]);
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0]?.cuerpo).toEqual({ q: ["uno", "dos", "tres"], source: "en", target: "es", format: "text" });
    });
    it("trocea por el límite de caracteres configurable y respeta el orden", async () => {
        const textos = ["aaaaa", "bbbbb", "ccccc"];
        const { f, llamadas } = crearFetchFalso((p) => {
            const trozos = ((p.cuerpo?.q ?? []) as string[]).map((t) => t.toUpperCase());
            return conJson({ translatedText: trozos });
        });
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f, limiteCaracteres: 12 });
        const r = await cliente.traducir({ q: textos, source: "en", target: "es", format: "text" });
        expect(r.translatedText).toEqual(["AAAAA", "BBBBB", "CCCCC"]);
        expect(llamadas).toHaveLength(2);
        expect(llamadas[0]?.cuerpo).toEqual({ q: textos.slice(0, 2), source: "en", target: "es", format: "text" });
        expect(llamadas[1]?.cuerpo).toEqual({ q: textos.slice(2), source: "en", target: "es", format: "text" });
    });
    it("idiomas() hace GET {base}/languages", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ idiomas: [{ code: "es", name: "Español" }] }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        expect(await cliente.idiomas()).toEqual({ idiomas: [{ code: "es", name: "Español" }] });
        expect(llamadas[0]?.metodo).toBe("GET");
        expect(llamadas[0]?.url).toBe(`${BASE}/languages`);
    });
    it("detectar(q) hace POST {base}/detect con q en el cuerpo", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson([{ confidence: 0.9, language: "es" }]));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        const r = await cliente.detectar("buenos días");
        expect(llamadas[0]?.metodo).toBe("POST");
        expect(llamadas[0]?.url).toBe(`${BASE}/detect`);
        expect(llamadas[0]?.cuerpo).toEqual({ q: "buenos días" });
        expect(Array.isArray(r)).toBe(true);
    });
    it("salud() hace GET {base}/health", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ ok: true }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        expect(await cliente.salud()).toEqual({ ok: true });
        expect(llamadas[0]?.metodo).toBe("GET");
        expect(llamadas[0]?.url).toBe(`${BASE}/health`);
    });

    it("responde en español claro y distinto a los errores 400, 403, 429 y 500", async () => {
        const estados = [400, 403, 429, 500];
        const mensajes: string[] = [];
        for (const estado of estados) {
            const { f } = crearFetchFalso(() => conJson({ error: "detalle del fallo" }, estado));
            const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
            try {
                await cliente.traducir({ q: "a", source: "es", target: "en", format: "text" });
                expect.unreachable("con un código de error debía fallar");
            } catch (e) {
                const mensaje = (e as Error).message;
                expect(e).toBeInstanceOf(Error);
                expect(mensaje.length).toBeGreaterThan(5);
                mensajes.push(mensaje);
            }
        }
        expect(mensajes).toHaveLength(4);
        for (const m of mensajes) {
            expect(mensajes.indexOf(m)).toBe(mensajes.lastIndexOf(m));
        }
    });
});
