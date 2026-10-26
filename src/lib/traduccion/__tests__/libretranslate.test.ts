import { describe, expect, it } from "vitest";
import {
  crearLotes,
  detectar,
  idiomas,
  salud,
  traducir,
  type InstanciaLibreTranslate,
} from "../libretranslate";

type Llamada = { url: string; metodo?: string; cuerpo?: Record<string, unknown> };

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}

function montar(manejador: (url: string, init?: RequestInit) => Response, extra: Partial<InstanciaLibreTranslate> = {}) {
  const llamadas: Llamada[] = [];
  const falso: typeof fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const cuerpo = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    llamadas.push({ url, metodo: init?.method, cuerpo });
    return manejador(url, init);
  };
  const instancia: InstanciaLibreTranslate = { base: "http://127.0.0.1:5000/", fetch: falso, ...extra };
  return { instancia, llamadas };
}

describe("crearLotes · parte por caracteres y conserva el orden", () => {
  it("junta textos hasta el tope y deja el que no cabe para el lote siguiente", () => {
    expect(crearLotes(["aaaa", "bb", "ccccc"], 6)).toEqual([["aaaa", "bb"], ["ccccc"]]);
    expect(crearLotes(["uno", "dos", "tres"], 6)).toEqual([["uno", "dos"], ["tres"]]);
    expect(crearLotes(["1234567890"], 5)).toEqual([["1234567890"]]);
    expect(crearLotes([], 5)).toEqual([]);
  });
});

describe("traducir · texto, lista, lotes y clave", () => {
  it("manda POST /translate y devuelve el texto con el idioma detectado", async () => {
    const { instancia, llamadas } = montar(() => respuesta({ translatedText: "Hola", detectedLanguage: { language: "en", confidence: 98 } }));
    await expect(traducir(instancia, { q: "Hello", source: "auto", target: "es", format: "html" })).resolves.toEqual({ traduccion: "Hola", detectado: "en" });
    expect(llamadas[0]).toMatchObject({ url: "http://127.0.0.1:5000/translate", metodo: "POST", cuerpo: { q: "Hello", source: "auto", target: "es", format: "html" } });
  });
  it("usa format «text» por defecto y no inventa idioma detectado si el origen es explícito", async () => {
    const { instancia, llamadas } = montar(() => respuesta({ translatedText: "Hello" }));
    await expect(traducir(instancia, { q: "Hola", source: "es", target: "en" })).resolves.toEqual({ traduccion: "Hello" });
    expect(llamadas[0].cuerpo).toMatchObject({ format: "text" });
  });
  it("respeta el orden de una lista y la parte en lotes por el límite configurable", async () => {
    const { instancia, llamadas } = montar((_url, init) => {
      const q = (JSON.parse(String(init?.body)).q as string[]).map((t) => `[${t}]`);
      return respuesta({ translatedText: q, detectedLanguage: { language: "en", confidence: 90 } });
    }, { limiteCaracteres: 6 });
    await expect(traducir(instancia, { q: ["uno", "dos", "tres"], source: "auto", target: "es" })).resolves.toEqual({ traduccion: ["[uno]", "[dos]", "[tres]"], detectado: "en" });
    expect(llamadas.map((l) => l.cuerpo?.q)).toEqual([["uno", "dos"], ["tres"]]);
  });
  it("elige la detección de mayor confianza entre los lotes", async () => {
    let n = 0;
    const datos = () => respuesta({ translatedText: ["x"], detectedLanguage: { language: n === 0 ? "en" : "de", confidence: n++ === 0 ? 70 : 95 } });
    const { instancia } = montar(datos, { limiteCaracteres: 2 });
    await expect(traducir(instancia, { q: ["aa", "bb"], source: "auto", target: "es" })).resolves.toMatchObject({ detectado: "de" });
  });
  it("solo manda api_key si la instancia la tiene y nunca la pone en la URL", async () => {
    const conClave = montar(() => respuesta({ translatedText: "ok" }), { claveApi: "secreta" });
    await traducir(conClave.instancia, { q: "hola", source: "es", target: "en" });
    expect(conClave.llamadas[0].cuerpo).toHaveProperty("api_key", "secreta");
    expect(conClave.llamadas[0].url).not.toContain("secreta");
    const sinClave = montar(() => respuesta({ translatedText: "ok" }));
    await traducir(sinClave.instancia, { q: "hola", source: "es", target: "en" });
    expect(sinClave.llamadas[0].cuerpo).not.toHaveProperty("api_key");
  });
});

describe("traducir · errores claros en español", () => {
  it("traduce 400, 403, 429 y 500 con su estado y una pista en español", async () => {
    const pistas: Record<number, string> = { 400: "revisa los idiomas", 403: "clave de API", 429: "saturada", 500: "Error interno" };
    for (const estado of [400, 403, 429, 500]) {
      const { instancia } = montar(() => respuesta({}, estado));
      const error = (await traducir(instancia, { q: "hola", source: "es", target: "en" }).catch((e: unknown) => e)) as Error;
      expect(error.message).toContain(String(estado));
      expect(error.message).toContain(pistas[estado]);
    }
  });
  it("avisa sin conexión y cuando la respuesta no trae tantas traducciones como textos", async () => {
    const caido = montar(() => { throw new Error("sin red"); }).instancia;
    await expect(traducir(caido, { q: "hola", source: "es", target: "en" })).rejects.toThrow("No se pudo conectar con LibreTranslate");
    const corto = montar(() => respuesta({ translatedText: ["solo una"] })).instancia;
    await expect(traducir(corto, { q: ["a", "b"], source: "es", target: "en" })).rejects.toThrow("otra cantidad de traducciones");
  });
});

describe("idiomas · GET /languages", () => {
  it("lee la lista y descarta las filas sin código", async () => {
    const { instancia, llamadas } = montar(() => respuesta([{ code: "es", name: "Español" }, { code: "", name: "Malo" }, { code: "en", name: "Inglés" }]));
    await expect(idiomas(instancia)).resolves.toEqual([{ code: "es", name: "Español" }, { code: "en", name: "Inglés" }]);
    expect(llamadas[0]).toMatchObject({ url: "http://127.0.0.1:5000/languages", metodo: "GET" });
  });
});

describe("detectar · POST /detect", () => {
  it("devuelve los candidatos y solo manda api_key si la instancia la tiene", async () => {
    const { instancia, llamadas } = montar(() => respuesta([{ language: "es", confidence: 92 }, { language: "en", confidence: 8 }]));
    await expect(detectar(instancia, "hola")).resolves.toEqual([{ language: "es", confidence: 92 }, { language: "en", confidence: 8 }]);
    expect(llamadas[0]).toMatchObject({ url: "http://127.0.0.1:5000/detect", metodo: "POST", cuerpo: { q: "hola" } });
    const conClave = montar(() => respuesta([{ language: "es", confidence: 92 }]), { claveApi: "secreta" });
    await detectar(conClave.instancia, "hola");
    expect(conClave.llamadas[0].cuerpo).toEqual({ q: "hola", api_key: "secreta" });
  });
});

describe("salud · GET /health", () => {
  it("responde true si el servicio está sano y false si falla o no hay conexión", async () => {
    const sano = montar(() => respuesta({ status: "ok" }));
    await expect(salud(sano.instancia)).resolves.toBe(true);
    expect(sano.llamadas[0]).toMatchObject({ url: "http://127.0.0.1:5000/health", metodo: "GET" });
    await expect(salud(montar(() => respuesta({ success: false })).instancia)).resolves.toBe(false);
    await expect(salud(montar(() => { throw new Error("sin red"); }).instancia)).resolves.toBe(false);
  });
});
