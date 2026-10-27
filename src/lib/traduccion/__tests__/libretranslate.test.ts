import { describe, expect, it } from "vitest";
import {
    crearLotes,
    detectar,
    idiomas,
    salud,
    traducir,
    type InstanciaLibreTranslate,
    type PeticionTraduccion,
} from "../libretranslate";

const LOTE_DEFECTO = 1800;

function fetchMock(respuestas: Map<string, unknown>) {
    return async (input: RequestInfo | URL, opciones?: RequestInit) => {
        const url = input.toString();
        const clave = `${opciones?.method ?? "GET"} ${url}`;
        const cuerpo = respuestas.get(clave);
        return new Response(JSON.stringify(cuerpo ?? {}), {
            status: cuerpo ? 200 : 404,
            headers: { "Content-Type": "application/json" },
        });
    };
}

const base = (fetchFn: typeof fetch): InstanciaLibreTranslate => ({
    base: "http://localhost:5000",
    fetch: fetchFn,
    limiteCaracteres: LOTE_DEFECTO,
});

describe("crearLotes", () => {
    it("agrupa sin superar el límite", () => {
        const lotes = crearLotes(["hola", "mundo", "esto"], 10);
        expect(lotes).toEqual([["hola", "mundo"], ["esto"]]);
    });

    it("texto grande va solo", () => {
        const largo = "a".repeat(100);
        expect(crearLotes([largo, "corto"], 50)).toEqual([[largo], ["corto"]]);
    });

    it("lista vacía devuelve vacía", () => {
        expect(crearLotes([])).toEqual([]);
    });
});

describe("traducir", () => {
    it("traduce texto simple", async () => {
        const mock = new Map();
        mock.set("POST http://localhost:5000/translate", { translatedText: "hola" });
        const inst = base(fetchMock(mock));
        const res = await traducir(inst, { q: "hello", source: "en", target: "es" });
        expect(res.traduccion).toBe("hola");
    });

    it("traduce lista respetando orden", async () => {
        const mock = new Map();
        mock.set("POST http://localhost:5000/translate", { translatedText: ["hola", "mundo"] });
        const inst = base(fetchMock(mock));
        const res = await traducir(inst, { q: ["hi", "world"], source: "en", target: "es" });
        expect(res.traduccion).toEqual(["hola", "mundo"]);
    });

    it("detecta idioma con source auto", async () => {
        const mock = new Map();
        mock.set("POST http://localhost:5000/translate", { translatedText: "hola", detectedLanguage: { language: "en" } });
        const inst = base(fetchMock(mock));
        const res = await traducir(inst, { q: "hello", source: "auto", target: "es" });
        expect(res.detectado).toBe("en");
    });

    it("lanza error si cantidad no coincide", async () => {
        const mock = new Map();
        mock.set("POST http://localhost:5000/translate", { translatedText: ["uno"] });
        const inst = base(fetchMock(mock));
        await expect(traducir(inst, { q: ["a", "b"], source: "en", target: "es" })).rejects.toThrow("cantidad");
    });
});

describe("idiomas", () => {
    it("devuelve lista filtrada", async () => {
        const mock = new Map();
        mock.set("GET http://localhost:5000/languages", [{ code: "es" }, { code: "" }]);
        const inst = base(fetchMock(mock));
        const res = await idiomas(inst);
        expect(res).toEqual([{ code: "es", name: undefined }]);
    });
});

describe("detectar", () => {
    it("devuelve candidatos", async () => {
        const mock = new Map();
        mock.set("POST http://localhost:5000/detect", [{ language: "es", confidence: 95 }]);
        const inst = base(fetchMock(mock));
        const res = await detectar(inst, "hola");
        expect(res[0]).toEqual({ language: "es", confidence: 95 });
    });
});

describe("salud", () => {
    it("true cuando success no es false", async () => {
        const mock = new Map();
        mock.set("GET http://localhost:5000/health", { success: true });
        const inst = base(fetchMock(mock));
        expect(await salud(inst)).toBe(true);
    });

    it("false ante error", async () => {
        const inst = { base: "http://localhost:5000", fetch: async (_input: RequestInfo | URL, _op?: RequestInit) => { throw new Error("x"); } };
        expect(await salud(inst)).toBe(false);
    });
});