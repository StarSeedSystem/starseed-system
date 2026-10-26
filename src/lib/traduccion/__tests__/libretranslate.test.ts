import { describe, expect, it } from "vitest";
import { crearClienteLibreTranslate, mensajeErrorHttp, partirEnLotes, urlApi } from "../libretranslate";

type Llamada = { url: string; metodo?: string; cuerpo?: Record<string, unknown> };

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}

function montar(manejador: (url: string, init?: RequestInit) => Response, limite?: number) {
  const llamadas: Llamada[] = [];
  const falso = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const cuerpo = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    llamadas.push({ url, metodo: init?.method, cuerpo });
    return manejador(url, init);
  };
  const cliente = crearClienteLibreTranslate({ base: "http://127.0.0.1:5000/", fetch: falso as typeof fetch, limiteCaracteres: limite });
  return { cliente, llamadas };
}

describe("urlApi y mensajeErrorHttp", () => {
  it("une base y ruta, y exige una base http(s) completa", () => {
    expect(urlApi("http://127.0.0.1:5000/", "/translate")).toBe("http://127.0.0.1:5000/translate");
    expect(() => urlApi("127.0.0.1:5000", "/translate")).toThrow("URL http(s) completa");
  });
  it("da un mensaje claro en español por estado y adjunta el detalle del servidor", () => {
    expect(mensajeErrorHttp(400)).toContain("400");
    expect(mensajeErrorHttp(403)).toContain("clave de API");
    expect(mensajeErrorHttp(429)).toContain("Límite de peticiones");
    expect(mensajeErrorHttp(500)).toContain("Fallo interno");
    expect(mensajeErrorHttp(400, "falta q")).toContain("falta q");
    expect(mensajeErrorHttp(418)).toContain("418");
  });
});
describe("partirEnLotes", () => {
  it("parte por caracteres, conserva el orden y deja solo el texto que supera el tope", () => {
    expect(partirEnLotes(["aaaa", "bb", "ccccc"], 6)).toEqual([["aaaa", "bb"], ["ccccc"]]);
    expect(partirEnLotes(["uno", "dos", "tres"], 6)).toEqual([["uno", "dos"], ["tres"]]);
    expect(partirEnLotes(["1234567890"], 5)).toEqual([["1234567890"]]);
    expect(partirEnLotes([], 5)).toEqual([]);
  });
});
describe("traducir", () => {
  it("manda POST /translate con source, target y format, y devuelve el texto y el idioma detectado", async () => {
    const { cliente, llamadas } = montar(() =>
      respuesta({ translatedText: ["Hola"], detectedLanguage: { confidence: 0.98, language: "en" } }),
    );
    const salida = await cliente.traducir({ q: "Hello", source: "auto", target: "es", format: "html" });
    expect(salida).toEqual({ traducido: "Hola", idiomaDetectado: { confidence: 0.98, language: "en" } });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("http://127.0.0.1:5000/translate");
    expect(llamadas[0].metodo).toBe("POST");
    expect(llamadas[0].cuerpo).toEqual({ q: ["Hello"], source: "auto", target: "es", format: "html" });
  });
  it("parte una lista en lotes por el tope de caracteres y la vuelve a juntar en orden", async () => {
    const { cliente, llamadas } = montar((_url, init) => {
      const q = (JSON.parse(String(init?.body)).q as string[]).map((t) => `[${t}]`);
      return respuesta({ translatedText: q, detectedLanguage: { confidence: 0.7, language: "en" } });
    }, 6);
    const salida = await cliente.traducir({ q: ["uno", "dos", "tres"], source: "en", target: "es" });
    expect(salida.traducido).toEqual(["[uno]", "[dos]", "[tres]"]);
    expect(salida.idiomaDetectado).toEqual({ confidence: 0.7, language: "en" });
    expect(llamadas.map((l) => l.cuerpo?.q)).toEqual([["uno", "dos"], ["tres"]]);
  });
  it("solo manda api_key cuando quien llama la pasa y no la conserva entre llamadas", async () => {
    const { cliente, llamadas } = montar(() => respuesta({ translatedText: ["ok"] }));
    await cliente.traducir({ q: "hola", source: "es", target: "en", api_key: "secreta" });
    await cliente.traducir({ q: "hola", source: "es", target: "en" });
    expect(llamadas[0].cuerpo).toHaveProperty("api_key", "secreta");
    expect(llamadas[1].cuerpo).not.toHaveProperty("api_key");
  });
});

describe("errores de traducir", () => {
  it("traduce 400, 403, 429 y 500 a mensajes claros en español con el detalle del servidor", async () => {
    for (const estado of [400, 403, 429, 500]) {
      const { cliente } = montar(() => respuesta({ error: "detalle del servidor" }, estado));
      const error: unknown = await cliente.traducir({ q: "hola", source: "es", target: "en" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(String(estado));
      expect((error as Error).message).toContain("detalle del servidor");
    }
  });
  it("avisa cuando no hay conexión y cuando la respuesta viene mal formada", async () => {
    const caido = montar(() => {
      throw new Error("sin red");
    }).cliente;
    await expect(caido.traducir({ q: "hola", source: "es", target: "en" })).rejects.toThrow("No se pudo contactar LibreTranslate");
    const raro = montar(() => respuesta({ translatedText: 7 })).cliente;
    await expect(raro.traducir({ q: "hola", source: "es", target: "en" })).rejects.toThrow("translatedText");
  });
});

describe("idiomas, detectar y salud", () => {
  it("lee GET /languages, admite clave por query y descarta filas sin código", async () => {
    const { cliente, llamadas } = montar(() =>
      respuesta([{ code: "es", name: "Español" }, { code: "en", name: "Inglés" }, { code: "", name: "Malo" }]),
    );
    expect(await cliente.idiomas()).toEqual([{ code: "es", name: "Español" }, { code: "en", name: "Inglés" }]);
    expect(llamadas[0].url).toBe("http://127.0.0.1:5000/languages");
    await cliente.idiomas("clave con espacio");
    expect(llamadas[1].url).toBe("http://127.0.0.1:5000/languages?api_key=clave%20con%20espacio");
  });
  it("detecta con POST /detect y solo manda api_key si se la pasan", async () => {
    const { cliente, llamadas } = montar(() => respuesta([{ language: "es", confidence: 0.9 }]));
    expect(await cliente.detectar("hola")).toEqual([{ language: "es", confidence: 0.9 }]);
    expect(llamadas[0].url).toBe("http://127.0.0.1:5000/detect");
    expect(llamadas[0].cuerpo).toEqual({ q: "hola" });
    await cliente.detectar("hola", "secreta");
    expect(llamadas[1].cuerpo).toEqual({ q: "hola", api_key: "secreta" });
  });
  it("consulta GET /health y responde false en vez de lanzar si no hay conexión", async () => {
    await expect(montar(() => respuesta({ status: "ok" })).cliente.salud()).resolves.toBe(true);
    const caido = montar(() => {
      throw new Error("sin red");
    }).cliente;
    await expect(caido.salud()).resolves.toBe(false);
  });
});
