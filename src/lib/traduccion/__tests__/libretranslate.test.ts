import { describe, expect, it } from "vitest";
import {
  crearClienteLibreTranslate,
  ErrorLibreTranslate,
  type FetchLike,
  type OpcionesLibreTranslate,
} from "@/lib/traduccion/libretranslate";

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });

function montar(responder: (url: string, init?: RequestInit) => unknown, extra: Partial<OpcionesLibreTranslate> = {}) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, init });
    const r = responder(url, init);
    return r instanceof Response ? r : json(r);
  };
  return { cliente: crearClienteLibreTranslate({ base: "http://lt.local/", fetch, ...extra }), llamadas };
}

const cuerpoDe = (l: { init?: RequestInit }) => JSON.parse(String(l.init?.body));

function servidor(over: Record<string, unknown> = {}) {
  return (url: string, init?: RequestInit): unknown => {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/languages")) return over.languages ?? [{ code: "en", name: "inglés", targets: ["es"] }];
    if (url.includes("/detect")) return over.detect ?? [{ language: "es", confidence: 0.9 }];
    if (url.includes("/health")) return over.health ?? { status: "ok" };
    if (url.includes("/translate")) {
      const q = Array.isArray(cuerpo.q) ? cuerpo.q : [cuerpo.q];
      return over.translate ?? { translatedText: q.map((t: string) => `EN:${t}`), detectedLanguage: { language: "es", confidence: 0.98 } };
    }
    return {};
  };
}

describe("cliente de LibreTranslate", () => {
  it("traduce un texto y devuelve el idioma detectado", async () => {
    const { cliente, llamadas } = montar(servidor());
    const r = await cliente.traducir({ q: "hola", target: "en" });
    expect(r.translatedText).toBe("EN:hola");
    expect(r.detectedLanguage).toEqual({ language: "es", confidence: 0.98 });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("http://lt.local/translate");
    expect(llamadas[0].init?.method).toBe("POST");
    expect(cuerpoDe(llamadas[0])).toEqual({ q: "hola", source: "auto", target: "en", format: "text" });
    expect(cuerpoDe(llamadas[0]).api_key).toBeUndefined();
  });

  it("manda la api_key solo si se la pasan y no la guarda", async () => {
    const { cliente, llamadas } = montar(servidor(), { apiKey: "k-123" });
    await cliente.traducir({ q: "hola", target: "en" });
    await cliente.idiomas();
    await cliente.detectar("hola");
    expect(cuerpoDe(llamadas[0]).api_key).toBe("k-123");
    expect(cuerpoDe(llamadas[2]).api_key).toBe("k-123");
    expect(llamadas[1].url).toContain("api_key=k-123");
    expect(JSON.stringify(cliente)).not.toContain("k-123");
  });

  it("parte en lotes por caracteres sin perder el orden", async () => {
    const { cliente, llamadas } = montar(servidor(), { limiteCaracteres: 10 });
    const r = await cliente.traducir({ q: ["uno", "dos", "tres", "cuatro"], target: "en" });
    expect(llamadas.map((l) => cuerpoDe(l).q)).toEqual([["uno", "dos", "tres"], ["cuatro"]]);
    expect(r.translatedText).toEqual(["EN:uno", "EN:dos", "EN:tres", "EN:cuatro"]);
  });

  it("parte un texto largo por palabras y conserva el orden", async () => {
    const { cliente, llamadas } = montar(servidor(), { limiteCaracteres: 5 });
    const r = await cliente.traducir({ q: "hola mundo feliz", target: "en" });
    expect(llamadas).toHaveLength(3);
    expect(r.translatedText).toBe("EN:hola EN:mundo EN:feliz");
  });

  it("no parte el HTML dentro de una etiqueta", async () => {
    const { cliente, llamadas } = montar(servidor(), { limiteCaracteres: 6 });
    const r = await cliente.traducir({ q: "<p>hola mundo</p>", target: "en", format: "html" });
    expect(llamadas).toHaveLength(1);
    expect(r.translatedText).toBe("EN:<p>hola mundo</p>");
  });

  it("lee idiomas, detecta y consulta la salud", async () => {
    const { cliente, llamadas } = montar(servidor());
    expect(await cliente.idiomas()).toEqual([{ code: "en", name: "inglés", targets: ["es"] }]);
    expect(await cliente.detectar("  hola  ")).toEqual([{ language: "es", confidence: 0.9 }]);
    expect(await cliente.salud()).toEqual({ status: "ok" });
    expect(llamadas.map((l) => l.url)).toEqual(["http://lt.local/languages", "http://lt.local/detect", "http://lt.local/health"]);
    expect(cuerpoDe(llamadas[1])).toEqual({ q: "hola" });
  });

  it("traduce los errores 400, 403, 429 y 500 a español claro", async () => {
    for (const [estado, texto] of [[400, "rechazó"], [403, "no autoriza"], [429, "saturado"], [500, "falló en su servidor"]] as const) {
      const { cliente } = montar(() => new Response("{}", { status: estado }));
      await expect(cliente.salud()).rejects.toThrow(texto);
    }
  });

  it("avisa sin red, sin JSON y valida base y destino", async () => {
    const sinRed = montar(() => { throw new Error("sin red"); }).cliente;
    await expect(sinRed.salud()).rejects.toBeInstanceOf(ErrorLibreTranslate);
    await expect(sinRed.salud()).rejects.toThrow("No se pudo llegar");
    await expect(montar(() => new Response("no es json")).cliente.salud()).rejects.toThrow("no es JSON");
    expect(() => crearClienteLibreTranslate({ base: "  " })).toThrow("Indica la dirección");
    const { cliente } = montar(servidor());
    await expect(cliente.traducir({ q: "hola", target: " " })).rejects.toThrow("destino");
  });

  it("una lista vacía no hace peticiones", async () => {
    const { cliente, llamadas } = montar(servidor());
    expect((await cliente.traducir({ q: [], target: "en" })).translatedText).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });
});
