import { describe, expect, it } from "vitest";

import { crearLotes, detectar, idiomas, salud, traducir } from "@/lib/traduccion/libretranslate";

/** fetch simulado: guarda cada petición y contesta con la lista, la última si se repite. */
function fetchSimulado(respuestas: { estado?: number; cuerpo?: unknown; falla?: boolean }[]): { fetcher: typeof fetch; peticiones: { url: string; init?: RequestInit }[] } {
  const peticiones: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const i = Math.min(peticiones.length, respuestas.length - 1);
    peticiones.push({ url: String(url), init });
    const r = respuestas[i] ?? { estado: 500 };
    if (r.falla) throw new Error("conexion rechazada");
    if (r.estado !== undefined && r.estado !== 200) return new Response(null, { status: r.estado });
    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: 200 });
  }) as typeof fetch;
  return { fetcher, peticiones };
}

const baseDemo = "http://127.0.0.1:5000";
const cuerpoCoal = (p: { init?: RequestInit }[], n: number): Record<string, unknown> => JSON.parse((p[n]?.init?.body as string) ?? "{}") as Record<string, unknown>;

describe("crearLotes", () => {
  it("agrupa sin pasar el límite y conserva el orden", () => {
    expect(crearLotes(["aaaa", "bbbb", "cc"], 8)).toEqual([["aaaa", "bbbb"], ["cc"]]);
  });

  it("un texto que solo supera el límite va solo", () => {
    expect(crearLotes(["12345678", "x"], 8)).toEqual([["12345678"], ["x"]]);
  });

  it("lista vacía no crea lotes", () => {
    expect(crearLotes([], 10)).toEqual([]);
  });
});

describe("traducir", () => {
  it("texto simple: POST /translate, texto de vuelta, base con barra se limpia", async () => {
    const { fetcher, peticiones } = fetchSimulado([{ cuerpo: { translatedText: "good morning" } }]);
    const r = await traducir({ base: `${baseDemo}/`, fetch: fetcher }, { q: "buenos días", source: "es", target: "en" });
    expect(r).toEqual({ traduccion: "good morning" });
    expect(peticiones[0]?.url).toBe(`${baseDemo}/translate`);
    expect(peticiones[0]?.init?.method).toBe("POST");
    expect(cuerpoCoal(peticiones, 0)).toEqual({ q: "buenos días", source: "es", target: "en", format: "text" });
  });

  it("lista por lotes bajo el límite, orden intacto", async () => {
    const { fetcher, peticiones } = fetchSimulado([{ cuerpo: { translatedText: ["AAA", "BBB"] } }, { cuerpo: { translatedText: ["CC"] } }]);
    const r = await traducir({ base: baseDemo, fetch: fetcher, limiteCaracteres: 6 }, { q: ["aaa", "bbb", "ccc"], source: "es", target: "en" });
    expect(r).toEqual({ traduccion: ["AAA", "BBB", "CC"] });
    expect(peticiones).toHaveLength(2);
    expect(cuerpoCoal(peticiones, 0).q).toEqual(["aaa", "bbb"]);
    expect(cuerpoCoal(peticiones, 1).q).toEqual(["ccc"]);
  });

  it("con source «auto» añade el idioma detectado del primer lote", async () => {
    const { fetcher } = fetchSimulado([
      { cuerpo: { translatedText: ["hi", "bye"], detectedLanguage: [{ confidence: 91, language: "es" }, { confidence: 88, language: "es" }] } },
    ]);
    const r = await traducir({ base: baseDemo, fetch: fetcher }, { q: ["hola", "adiós"], source: "auto", target: "en" });
    expect(r).toEqual({ traduccion: ["hi", "bye"], detectado: "es" });
  });

  it("sin «auto» no añade detectado", async () => {
    const { fetcher } = fetchSimulado([{ cuerpo: { translatedText: "hi" } }]);
    const r = await traducir({ base: baseDemo, fetch: fetcher }, { q: "hola", source: "es", target: "en" });
    expect("detectado" in r).toBe(false);
  });

  it("la clave va solo como api_key del cuerpo, si quien llama la pasa", async () => {
    const { fetcher, peticiones } = fetchSimulado([{ cuerpo: { translatedText: "hi" } }]);
    await traducir({ base: baseDemo, fetch: fetcher, claveApi: "clave-de-prueba" }, { q: "hola", source: "es", target: "en" });
    expect(cuerpoCoal(peticiones, 0).api_key).toBe("clave-de-prueba");
  });

  it("errores 400, 403, 429 y 500 en español claro", async () => {
    for (const estado of [400, 403, 429, 500]) {
      const { fetcher } = fetchSimulado([{ estado }]);
      await expect(traducir({ base: baseDemo, fetch: fetcher }, { q: "hola", source: "es", target: "en" })).rejects.toThrow(`(${estado})`);
    }
  });

  it("red caída: mensaje claro de conexión", async () => {
    const { fetcher } = fetchSimulado([{ falla: true }]);
    await expect(traducir({ base: baseDemo, fetch: fetcher }, { q: "hola", source: "es", target: "en" })).rejects.toThrow("No se pudo conectar");
  });
});

describe("idiomas, detectar y salud", () => {
  it("idiomas: GET /languages y solo entradas con código", async () => {
    const { fetcher, peticiones } = fetchSimulado([{ cuerpo: [{ code: "es", name: "Español" }, { name: "sin código" }] }]);
    const lista = await idiomas({ base: baseDemo, fetch: fetcher });
    expect(lista).toEqual([{ code: "es", name: "Español" }]);
    expect(peticiones[0]?.url).toBe(`${baseDemo}/languages`);
    expect(peticiones[0]?.init?.method).toBe("GET");
    expect(peticiones[0]?.init?.body).toBeUndefined();
  });

  it("detectar: POST /detect, con api_key solo si quien llama la pasa", async () => {
    const conClave = fetchSimulado([{ cuerpo: [{ confidence: 97, language: "es" }, { confidence: 3, language: "fr" }] }]);
    const lista = await detectar({ base: baseDemo, fetch: conClave.fetcher, claveApi: "clave-de-prueba" }, "hola");
    expect(lista).toEqual([{ language: "es", confidence: 97 }, { language: "fr", confidence: 3 }]);
    expect(cuerpoCoal(conClave.peticiones, 0)).toEqual({ q: "hola", api_key: "clave-de-prueba" });
    const sinClave = fetchSimulado([{ cuerpo: [] }]);
    await detectar({ base: baseDemo, fetch: sinClave.fetcher }, "hola");
    expect(cuerpoCoal(sinClave.peticiones, 0)).toEqual({ q: "hola" });
  });

  it("salud: true cuando el servidor contesta `{}`", async () => {
    const { fetcher, peticiones } = fetchSimulado([{ cuerpo: {} }]);
    expect(await salud({ base: baseDemo, fetch: fetcher })).toBe(true);
    expect(peticiones[0]?.url).toBe(`${baseDemo}/health`);
  });

  it("salud: false con success false o servidor caído", async () => {
    const malo = fetchSimulado([{ cuerpo: { success: false } }]);
    expect(await salud({ base: baseDemo, fetch: malo.fetcher })).toBe(false);
    const caido = fetchSimulado([{ estado: 503 }]);
    expect(await salud({ base: baseDemo, fetch: caido.fetcher })).toBe(false);
  });
});
