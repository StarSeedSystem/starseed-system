import { describe, expect, it } from "vitest";

import { crearClienteLibreTranslate, crearLotes } from "@/lib/traduccion/libretranslate";
type Peticion = { url: string; init?: RequestInit };
type RespuestaSimulada = { estado?: number; cuerpo?: unknown; falla?: boolean };

/** fetch simulado: guarda cada petición y contesta con la lista; repite la última. */
function fetchSimulado(respuestas: RespuestaSimulada[]) {
    const peticiones: Peticion[] = [];
    const enviar = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const i = Math.min(peticiones.length, respuestas.length - 1);
        peticiones.push({ url: String(url), init });
        const r = respuestas[i] ?? { estado: 500 };
        if (r.falla) throw new Error("conexión rechazada");
        return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), { status: r.estado ?? 200 });
    };
    return { fetch: enviar, peticiones };
}

const base = "http://127.0.0.1:5000";
const cuerpoDe = (p: Peticion[], n: number): Record<string, unknown> => JSON.parse((p[n]?.init?.body as string) ?? "{}");

describe("crearLotes", () => {
    it("agrupa sin pasar el límite, conserva el orden y no crea lotes vacíos", () => {
        expect(crearLotes(["aaaa", "bbbb", "cc"], 8)).toEqual([["aaaa", "bbbb"], ["cc"]]);
        expect(crearLotes(["12345678", "x"], 8)).toEqual([["12345678"], ["x"]]);
        expect(crearLotes([], 10)).toEqual([]);
    });
});
describe("traducir", () => {
    it("texto simple: POST /translate, texto de vuelta y base con barra se limpia", async () => {
        const { fetch, peticiones } = fetchSimulado([{ cuerpo: { translatedText: "good morning" } }]);
        const cliente = crearClienteLibreTranslate({ base: `${base}/`, fetch });
        const r = await cliente.traducir({ q: "buenos días", source: "es", target: "en", format: "text" });
        expect(r).toEqual({ translatedText: "good morning" });
        expect(peticiones[0]?.url).toBe(`${base}/translate`);
        expect(peticiones[0]?.init?.method).toBe("POST");
        expect(cuerpoDe(peticiones, 0)).toEqual({ q: "buenos días", source: "es", target: "en", format: "text" });
    });

    it("lista por lotes bajo el límite, orden intacto", async () => {
        const { fetch, peticiones } = fetchSimulado([
            { cuerpo: { translatedText: ["AAA", "BBB"] } },
            { cuerpo: { translatedText: ["CC"] } },
        ]);
        const cliente = crearClienteLibreTranslate({ base, fetch, limiteCaracteres: 6 });
        const r = await cliente.traducir({ q: ["aaa", "bbb", "ccc"], source: "es", target: "en", format: "text" });
        expect(r).toEqual({ translatedText: ["AAA", "BBB", "CC"] });
        expect(peticiones).toHaveLength(2);
        expect(cuerpoDe(peticiones, 0).q).toEqual(["aaa", "bbb"]);
        expect(cuerpoDe(peticiones, 1).q).toEqual(["ccc"]);
    });

    it("con source «auto» añade el idioma detectado del primer lote", async () => {
        const { fetch } = fetchSimulado([
            { cuerpo: { translatedText: ["hi", "bye"], detectedLanguage: { confidence: 91, language: "es" } } },
        ]);
        const cliente = crearClienteLibreTranslate({ base, fetch });
        const r = await cliente.traducir({ q: ["hola", "adiós"], source: "auto", target: "en", format: "text" });
        expect(r).toEqual({ translatedText: ["hi", "bye"], detectedLanguage: { language: "es", confidence: 91 } });
    });

    it("sin «auto» no añade detectedLanguage", async () => {
        const { fetch } = fetchSimulado([{ cuerpo: { translatedText: "hi" } }]);
        const cliente = crearClienteLibreTranslate({ base, fetch });
        const r = await cliente.traducir({ q: "hola", source: "es", target: "en", format: "text" });
        expect("detectedLanguage" in r).toBe(false);
    });

    it("la clave va solo como api_key del cuerpo, si quien llama la pasa", async () => {
        const { fetch, peticiones } = fetchSimulado([{ cuerpo: { translatedText: "hi" } }]);
        const cliente = crearClienteLibreTranslate({ base, fetch });
        await cliente.traducir({ q: "hola", source: "es", target: "en", format: "text", api_key: "clave-de-prueba" });
        expect(cuerpoDe(peticiones, 0).api_key).toBe("clave-de-prueba");
        const sinClave = fetchSimulado([{ cuerpo: { translatedText: "hi" } }]);
        await crearClienteLibreTranslate({ base, fetch: sinClave.fetch }).traducir({ q: "hola", source: "es", target: "en", format: "text" });
        expect("api_key" in cuerpoDe(sinClave.peticiones, 0)).toBe(false);
    });

    it("errores 400, 403, 429 y 500 en español claro", async () => {
        for (const estado of [400, 403, 429, 500]) {
            const { fetch } = fetchSimulado([{ estado }]);
            await expect(crearClienteLibreTranslate({ base, fetch }).traducir({ q: "hola", source: "es", target: "en", format: "text" })).rejects.toThrow(`(${estado})`);
        }
    });

    it("red caída: mensaje claro de conexión", async () => {
        const { fetch } = fetchSimulado([{ falla: true }]);
        await expect(crearClienteLibreTranslate({ base, fetch }).traducir({ q: "hola", source: "es", target: "en", format: "text" })).rejects.toThrow("No se pudo conectar");
    });
});
describe("idiomas, detectar y salud", () => {
    it("idiomas: GET /languages y solo entradas con código", async () => {
        const { fetch, peticiones } = fetchSimulado([{ cuerpo: [{ code: "es", name: "Español" }, { name: "sin código" }] }]);
        const lista = await crearClienteLibreTranslate({ base, fetch }).idiomas();
        expect(lista).toEqual([{ code: "es", name: "Español" }]);
        expect(peticiones[0]?.url).toBe(`${base}/languages`);
        expect(peticiones[0]?.init?.method).toBe("GET");
    });

    it("detectar: POST /detect, con api_key solo si quien llama la pasa", async () => {
        const conClave = fetchSimulado([{ cuerpo: [{ confidence: 97, language: "es" }, { confidence: 3, language: "fr" }] }]);
        const cliente = crearClienteLibreTranslate({ base, fetch: conClave.fetch });
        expect(await cliente.detectar("hola", "clave-de-prueba")).toEqual([{ language: "es", confidence: 97 }, { language: "fr", confidence: 3 }]);
        expect(cuerpoDe(conClave.peticiones, 0)).toEqual({ q: "hola", api_key: "clave-de-prueba" });
        const sinClave = fetchSimulado([{ cuerpo: [] }]);
        await crearClienteLibreTranslate({ base, fetch: sinClave.fetch }).detectar("hola");
        expect(cuerpoDe(sinClave.peticiones, 0)).toEqual({ q: "hola" });
    });

    it("salud: true con `{}` y false con success false o servidor caído", async () => {
        const sano = fetchSimulado([{ cuerpo: {} }]);
        expect(await crearClienteLibreTranslate({ base, fetch: sano.fetch }).salud()).toBe(true);
        expect(sano.peticiones[0]?.url).toBe(`${base}/health`);
        const malo = fetchSimulado([{ cuerpo: { success: false } }]);
        expect(await crearClienteLibreTranslate({ base, fetch: malo.fetch }).salud()).toBe(false);
        const caido = fetchSimulado([{ estado: 503 }]);
        expect(await crearClienteLibreTranslate({ base, fetch: caido.fetch }).salud()).toBe(false);
    });
});
