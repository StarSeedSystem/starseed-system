import { describe, expect, it } from "vitest";
<<<<<<< HEAD

import { crearClienteLibreTranslate } from "@/lib/traduccion/libretranslate";
type Peticion = { url: string; init?: RequestInit; metodo?: string; cuerpo?: unknown };
type RespuestaSimulada = { estado?: number; cuerpo?: unknown; falla?: boolean };

function conJson(cuerpo: unknown, estado = 200) {
    return { cuerpo, estado };
}

function crearFetchFalso(responder: (llamada: Peticion) => RespuestaSimulada | Promise<RespuestaSimulada>) {
    const llamadas: Peticion[] = [];
    const f = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const peticion: Peticion = { url: String(url), init, metodo: init?.method };
        if (init?.body && typeof init.body === "string") {
            try {
                peticion.cuerpo = JSON.parse(init.body);
            } catch {
                peticion.cuerpo = init.body;
            }
        }
        llamadas.push(peticion);
        const r = await responder(peticion);
        if (r.falla) throw new Error("conexión rechazada");
        return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), { status: r.estado ?? 200 });
=======
import { crearClienteLibreTranslate, type FetchLike } from "../libretranslate";

const BASE = "http://127.0.0.1:5000/";
interface Llamada { metodo: string; url: string; cuerpo: Record<string, unknown> | undefined }
const datosDelCuerpo = (crudo: BodyInit | null | undefined): Record<string, unknown> | undefined =>
    typeof crudo === "string" ? (JSON.parse(crudo) as Record<string, unknown>) : undefined;
const conJson = (datos: unknown, estado = 200): Response =>
    new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });

function crearFetchFalso(responder: (llamada: Llamada) => Response): { f: FetchLike; llamadas: Llamada[] } {
    const llamadas: Llamada[] = [];
    const f: FetchLike = async (entrada, init) => {
        const llamada: Llamada = { metodo: init?.method ?? "GET", url: String(entrada), cuerpo: datosDelCuerpo(init?.body) };
        llamadas.push(llamada);
        return responder(llamada);
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
    };
    return { f, llamadas };
}

<<<<<<< HEAD
const BASE = "http://127.0.0.1:5000";

describe("libretranslate (rama)", () => {
=======
describe("LibreTranslate · traducir", () => {
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
    it("manda POST {base}/translate y devuelve translatedText", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: "hello" }));
        const r = await crearClienteLibreTranslate({ base: BASE, fetch: f }).traducir({ q: "hola", source: "es", target: "en", format: "text" });
        expect(r.translatedText).toBe("hello");
        expect(llamadas).toHaveLength(1);
<<<<<<< HEAD
        expect(llamadas[0]).toMatchObject({ metodo: "POST", url: `${BASE}/translate` });
=======
        expect(llamadas[0]).toMatchObject({ metodo: "POST", url: `${BASE}translate` });
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
        expect(llamadas[0]?.cuerpo).toEqual({ q: "hola", source: "es", target: "en", format: "text" });
    });

    it("con source auto devuelve detectedLanguage y manda «auto» tal cual", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: "hello", detectedLanguage: { language: "en", confidence: 0.97 } }));
        const r = await crearClienteLibreTranslate({ base: BASE, fetch: f }).traducir({ q: "hola mundo", source: "auto", target: "en", format: "text" });
        expect(r.translatedText).toBe("hello");
        expect(r.detectedLanguage?.language).toBe("en");
        expect(llamadas[0]?.cuerpo).toEqual({ q: "hola mundo", source: "auto", target: "en", format: "text" });
    });

    it("api_key viaja solo cuando quien llama la pasa y no se queda guardada", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: "x" }));
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch: f });
        await cliente.traducir({ q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA" });
        await cliente.traducir({ q: "b", source: "es", target: "en", format: "text" });
        expect(llamadas[0]?.cuerpo).toEqual({ q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA" });
        expect(llamadas[1]?.cuerpo).not.toHaveProperty("api_key");
    });

    it("una lista en un solo lote conserva el orden de los textos", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson({ translatedText: ["HELLO", "THERE", "THIRD"] }));
        const r = await crearClienteLibreTranslate({ base: BASE, fetch: f }).traducir({ q: ["uno", "dos", "tres"], source: "en", target: "es", format: "text" });
        expect(r.translatedText).toEqual(["HELLO", "THERE", "THIRD"]);
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0]?.cuerpo).toEqual({ q: ["uno", "dos", "tres"], source: "en", target: "es", format: "text" });
    });

    it("trocea por limiteCaracteres y respeta el orden al recomponer", async () => {
        const textos = ["aaaaa", "bbbbb", "ccccc"];
<<<<<<< HEAD
        const { f, llamadas } = crearFetchFalso((llamada: Peticion) => conJson({ translatedText: ((llamada.cuerpo as any)?.q ?? []).map((t: string) => t.toUpperCase()) }));
=======
        const { f, llamadas } = crearFetchFalso((llamada) => conJson({ translatedText: ((llamada.cuerpo?.q ?? []) as string[]).map((t) => t.toUpperCase()) }));
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
        const r = await crearClienteLibreTranslate({ base: BASE, fetch: f, limiteCaracteres: 12 }).traducir({ q: textos, source: "en", target: "es", format: "text" });
        expect(r.translatedText).toEqual(["AAAAA", "BBBBB", "CCCCC"]);
        expect(llamadas).toHaveLength(2);
        expect(llamadas[0]?.cuerpo).toEqual({ q: textos.slice(0, 2), source: "en", target: "es", format: "text" });
        expect(llamadas[1]?.cuerpo).toEqual({ q: textos.slice(2), source: "en", target: "es", format: "text" });
    });
<<<<<<< HEAD

    it("idiomas() hace GET {base}/languages", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson([{ code: "es", name: "Español" }]));
        expect(await crearClienteLibreTranslate({ base: BASE, fetch: f }).idiomas()).toEqual([{ code: "es", name: "Español" }]);
        expect(llamadas[0]).toMatchObject({ metodo: "GET", url: `${BASE}/languages` });
=======
});

describe("LibreTranslate · consultas", () => {
    it("idiomas() hace GET {base}/languages", async () => {
        const datos = { idiomas: [{ code: "es", name: "Español" }] };
        const { f, llamadas } = crearFetchFalso(() => conJson(datos));
        expect(await crearClienteLibreTranslate({ base: BASE, fetch: f }).idiomas()).toEqual(datos);
        expect(llamadas[0]).toMatchObject({ metodo: "GET", url: `${BASE}languages` });
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
    });

    it("detectar(q) hace POST {base}/detect con q en el cuerpo", async () => {
        const { f, llamadas } = crearFetchFalso(() => conJson([{ confidence: 0.9, language: "es" }]));
        const r = await crearClienteLibreTranslate({ base: BASE, fetch: f }).detectar("buenos días");
<<<<<<< HEAD
        expect(llamadas[0]).toMatchObject({ metodo: "POST", url: `${BASE}/detect`, cuerpo: { q: "buenos días" } });
=======
        expect(llamadas[0]).toMatchObject({ metodo: "POST", url: `${BASE}detect`, cuerpo: { q: "buenos días" } });
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
        expect(Array.isArray(r)).toBe(true);
    });

    it("salud() hace GET {base}/health", async () => {
<<<<<<< HEAD
        const { f, llamadas } = crearFetchFalso(() => conJson({}));
        expect(await crearClienteLibreTranslate({ base: BASE, fetch: f }).salud()).toBe(true);
        expect(llamadas[0]).toMatchObject({ metodo: "GET", url: `${BASE}/health` });
    });

=======
        const { f, llamadas } = crearFetchFalso(() => conJson({ ok: true }));
        expect(await crearClienteLibreTranslate({ base: BASE, fetch: f }).salud()).toEqual({ ok: true });
        expect(llamadas[0]).toMatchObject({ metodo: "GET", url: `${BASE}health` });
    });
});

describe("LibreTranslate · errores", () => {
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
    it("responde en español y distingue 400, 403, 429 y 500", async () => {
        const mensajes: string[] = [];
        for (const estado of [400, 403, 429, 500]) {
            const { f } = crearFetchFalso(() => conJson({ error: "detalle del fallo" }, estado));
            try {
                await crearClienteLibreTranslate({ base: BASE, fetch: f }).traducir({ q: "a", source: "es", target: "en", format: "text" });
                throw new Error(`el estado ${estado} debía fallar`);
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
                const mensaje = (e as Error).message;
<<<<<<< HEAD
                expect(mensaje).toContain(String(estado));
=======
                expect(mensaje).toContain(`respondió ${estado}`);
>>>>>>> 25f4c6ba0 (salvavidas · RTTRD1020C: trabajo del agente antes de las puertas (tsc / vitest))
                expect(mensaje.length).toBeGreaterThan(5);
                mensajes.push(mensaje);
            }
        }
        expect(mensajes).toHaveLength(4);
        expect(new Set(mensajes).size).toBe(4);
    });
});
