import { describe, expect, it } from "vitest";

import { crearClienteLibreTranslate, crearLotes, type FetchLike } from "@/lib/traduccion/libretranslate";

type RespuestaFalsa = { estado?: number; cuerpo?: unknown; falla?: boolean };

/** `fetch` simulado: guarda cada petición y contesta con la lista (la última si se repite). */
function fetchSimulado(respuestas: RespuestaFalsa[]) {
    const peticiones: { url: string; init?: RequestInit }[] = [];
    const fetcher: FetchLike = async (url, init) => {
        const i = Math.min(peticiones.length, respuestas.length - 1);
        peticiones.push({ url: String(url), init });
        const r = respuestas[i] ?? { estado: 500 };
        if (r.falla) throw new Error("conexión rechazada");
        if (r.estado !== undefined && r.estado !== 200) return new Response(null, { status: r.estado });
        return new Response(JSON.stringify(r.cuerpo ?? {}), { status: 200 });
    };
    return { fetcher, peticiones };
}

const baseDemo = "http://127.0.0.1:5100";
const cuerpoDe = (peticiones: { init?: RequestInit }[], n: number): Record<string, unknown> =>
    JSON.parse((peticiones[n]?.init?.body as string) ?? "{}") as Record<string, unknown>;

function conRespuestas(respuestas: RespuestaFalsa[], opciones?: { claveApi?: string; limiteCaracteres?: number }) {
    const sim = fetchSimulado(respuestas);
    return { ...sim, api: crearClienteLibreTranslate({ base: baseDemo, fetch: sim.fetcher, ...opciones }) };
}

describe("crearLotes", () => {
    it("agrupa sin pasar el límite, conserva el orden y deja solo el texto grande", () => {
        expect(crearLotes(["aaaa", "bbbb", "cc"], 8)).toEqual([["aaaa", "bbbb"], ["cc"]]);
        expect(crearLotes(["12345678", "x"], 8)).toEqual([["12345678"], ["x"]]);
        expect(crearLotes([], 10)).toEqual([]);
    });
});

describe("traducir", () => {
    it("texto simple: POST /translate, texto de vuelta y base con barra se limpia", async () => {
        const sim = fetchSimulado([{ cuerpo: { translatedText: "good morning" } }]);
        const api = crearClienteLibreTranslate({ base: `${baseDemo}/`, fetch: sim.fetcher });
        const r = await api.traducir({ q: "buenos días", source: "es", target: "en" });
        expect(r).toEqual({ translatedText: "good morning" });
        expect(sim.peticiones[0]?.url).toBe(`${baseDemo}/translate`);
        expect(sim.peticiones[0]?.init?.method).toBe("POST");
        expect(sim.peticiones[0]?.init?.headers).toMatchObject({ "Content-Type": "application/json" });
        expect(cuerpoDe(sim.peticiones, 0)).toEqual({ q: "buenos días", source: "es", target: "en", format: "text" });
    });
    it("lista por lotes bajo el límite y orden intacto", async () => {
        const sim = fetchSimulado([
            { cuerpo: { translatedText: ["AAA", "BBB"] } },
            { cuerpo: { translatedText: ["CCC"] } },
        ]);
        const api = crearClienteLibreTranslate({ base: baseDemo, fetch: sim.fetcher, limiteCaracteres: 6 });
        const r = await api.traducir({ q: ["aaa", "bbb", "ccc"], source: "es", target: "en" });
        expect(r).toEqual({ translatedText: ["AAA", "BBB", "CCC"] });
        expect(sim.peticiones).toHaveLength(2);
        expect(cuerpoDe(sim.peticiones, 0).q).toEqual(["aaa", "bbb"]);
        expect(cuerpoDe(sim.peticiones, 1).q).toEqual(["ccc"]);
    });
    it("con source «auto» añade el idioma detectado del primer lote", async () => {
        const { api } = conRespuestas([{
            cuerpo: { translatedText: ["hi", "bye"], detectedLanguage: { confidence: 91, language: "es" } },
        }]);
        const r = await api.traducir({ q: ["hola", "adiós"], source: "auto", target: "en" });
        expect(r).toEqual({ translatedText: ["hi", "bye"], detectedLanguage: { language: "es", confidence: 91 } });
    });
    it("sin «auto» no añade detectedLanguage aunque el servidor lo mande", async () => {
        const { api } = conRespuestas([{ cuerpo: { translatedText: "hi", detectedLanguage: { language: "es", confidence: 90 } } }]);
        const r = await api.traducir({ q: "hola", source: "es", target: "en" });
        expect("detectedLanguage" in r).toBe(false);
    });
    it("la clave va solo como api_key, si quien llama la pasa; nunca por defecto", async () => {
        const conClave = conRespuestas([{ cuerpo: { translatedText: "hi" } }], { claveApi: "clave-de-prueba" });
        await conClave.api.traducir({ q: "hola", source: "es", target: "en" });
        expect(cuerpoDe(conClave.peticiones, 0).api_key).toBe("clave-de-prueba");
        const sinClave = conRespuestas([{ cuerpo: { translatedText: "hi" } }]);
        await sinClave.api.traducir({ q: "hola", source: "es", target: "en" });
        expect("api_key" in cuerpoDe(sinClave.peticiones, 0)).toBe(false);
    });
    it("errores 400, 403, 429 y 500 en español claro", async () => {
        for (const estado of [400, 403, 429, 500]) {
            const { api } = conRespuestas([{ estado }]);
            await expect(api.traducir({ q: "hola", source: "es", target: "en" })).rejects.toThrow(`(${estado})`);
        }
    });
    it("red caída y respuesta con otra cantidad: errores claros", async () => {
        const caida = conRespuestas([{ falla: true }]);
        await expect(caida.api.traducir({ q: "hola", source: "es", target: "en" })).rejects.toThrow("No se pudo conectar");
        const corta = conRespuestas([{ cuerpo: { translatedText: ["solo una"] } }]);
        await expect(corta.api.traducir({ q: ["a", "b"], source: "es", target: "en" })).rejects.toThrow("otra cantidad");
    });
});

describe("idiomas, detectar y salud", () => {
    it("idiomas: GET /languages y solo entradas con código", async () => {
        const { api, peticiones } = conRespuestas([{ cuerpo: [{ code: "es", name: "Español" }, { name: "sin código" }] }]);
        expect(await api.idiomas()).toEqual([{ code: "es", name: "Español" }]);
        expect(peticiones[0]?.url).toBe(`${baseDemo}/languages`);
        expect(peticiones[0]?.init?.method).toBe("GET");
        expect(peticiones[0]?.init?.body).toBeUndefined();
    });
    it("detectar: POST /detect, con api_key solo si quien llama la pasa", async () => {
        const conClave = conRespuestas([{ cuerpo: [{ confidence: 97, language: "es" }, { confidence: 3, language: "fr" }] }], { claveApi: "clave-de-prueba" });
        expect(await conClave.api.detectar("hola")).toEqual([{ language: "es", confidence: 97 }, { language: "fr", confidence: 3 }]);
        expect(cuerpoDe(conClave.peticiones, 0)).toEqual({ q: "hola", api_key: "clave-de-prueba" });
        const sinClave = conRespuestas([{ cuerpo: [] }]);
        await sinClave.api.detectar("hola");
        expect(cuerpoDe(sinClave.peticiones, 0)).toEqual({ q: "hola" });
    });
    it("salud: true si contesta `{}`; false con success false o servidor caído", async () => {
        const sano = conRespuestas([{ cuerpo: {} }]);
        expect(await sano.api.salud()).toBe(true);
        expect(sano.peticiones[0]?.url).toBe(`${baseDemo}/health`);
        const malo = conRespuestas([{ cuerpo: { success: false } }]);
        expect(await malo.api.salud()).toBe(false);
        const caido = conRespuestas([{ estado: 503 }]);
        expect(await caido.api.salud()).toBe(false);
    });
});
