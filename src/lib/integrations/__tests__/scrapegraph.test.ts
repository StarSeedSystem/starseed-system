// INV1025D — cliente TS del extractor local de ScrapeGraphAI (127.0.0.1:8793 via el proxy). Fetch simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_HTML_BYTES, extraer, health, urlEsInterna, validarEntrada } from "../clients/scrapegraph";

const PUBLICA = "https://ejemplo.com/lanzamiento"; const ENTRADA_URL = { url: PUBLICA, prompt: "Extrae los datos clave" };

type Peticion = { method?: string; path?: string; apiKey?: string; auth?: string; body?: unknown };
let peticion: Peticion | null = null;
beforeEach(() => {
  vi.stubGlobal("window", {}); peticion = null; // el cliente solo trabaja en el navegador
});
afterEach(() => vi.unstubAllGlobals());

/** Fetch simulado contra el proxy: captura la petición y responde lo dado. */
function proxyRespondido(cuerpo: unknown): void {
  vi.stubGlobal("fetch", async (_url: unknown, opts: { body?: string } = {}) => {
    if (typeof opts.body === "string") peticion = JSON.parse(opts.body) as Peticion;
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

/** Estrecha el unión: si es ok:true falla aquí mismo y devuelve su error. */
function errorDe(val: { ok: boolean; error?: string }): string {
  expect(val.ok).toBe(false); return val.error ?? "";
}

describe("urlEsInterna — hosts prohibidos (anti-SSRF)", () => {
  it("marca loopback, LAN, link-local y nombres internos", () => {
    ["localhost", "127.0.0.1", "10.0.0.9", "192.168.1.2", "172.16.0.1", "172.31.9.9", "169.254.1.1", "casa.local",
      "equipo.internal", "::1", "fe80::1", "fd00::5"].forEach((h) => expect(urlEsInterna(h)).toBe(true));
  });

  it("no marca hosts públicos ni rangos vecinos no reservados", () => {
    ["ejemplo.com", "8.8.8.8", "172.32.0.1", "os.starseed"].forEach((h) => expect(urlEsInterna(h)).toBe(false));
    expect(urlEsInterna("")).toBe(true);
  });
});

describe("validarEntrada — reglas de la lectura", () => {
  it("acepta URL pública y arma el cuerpo con prompt y esquema", () => {
    const esquema = { type: "object", properties: { titulo: { type: "string" } } };
    expect(validarEntrada({ ...ENTRADA_URL, esquema })).toEqual({
      ok: true, cuerpo: { url: PUBLICA, prompt: "Extrae los datos clave", esquema }, fuente: PUBLICA,
    });
  });

  it("rechaza lo que el extractor no debe recibir", () => {
    expect(errorDe(validarEntrada({ url: "http://127.0.0.1:8793/x", prompt: "p" }))).toContain("interna");
    expect(errorDe(validarEntrada({ url: "ftp://ejemplo.com", prompt: "p" }))).toContain("http");
    expect(errorDe(validarEntrada({ html: "x".repeat(MAX_HTML_BYTES + 1), prompt: "p" }))).toContain("400 KB");
    expect(errorDe(validarEntrada({ url: PUBLICA, prompt: "   " }))).toContain("prompt");
    expect(errorDe(validarEntrada({ url: PUBLICA, prompt: "x".repeat(1001) }))).toContain("1.000");
    expect(errorDe(validarEntrada({ url: PUBLICA, prompt: "p", esquema: [1] }))).toContain("objeto JSON");
    expect(errorDe(validarEntrada({ prompt: "p" }))).toContain("origen");
    expect(validarEntrada(undefined).ok).toBe(false);
  });
});

describe("extraer — con fetch simulado", () => {
  it("éxito: POST /extraer con Bearer y datos normalizados", async () => {
    proxyRespondido({ ok: true, status: 200, data: { ok: true, dato: { titulo: "Nueva versión" } } });
    const res = await extraer({ endpoint: "http://127.0.0.1:8793", apiKey: "clave-1" }, ENTRADA_URL);
    expect(peticion?.method).toBe("POST");
    expect(peticion?.path).toBe("/extraer");
    expect(peticion?.auth).toBe("bearer"); expect(peticion?.apiKey).toBe("clave-1");
    expect((peticion?.body as { url: string }).url).toContain("ejemplo.com");
    expect(res.data?.datos).toEqual({ titulo: "Nueva versión" });
    expect(res.data?.fuente).toBe(PUBLICA); expect(res.data?.bytes).toBeGreaterThan(0);
  });

  it("sin clave va sin Bearer; el HTML ya leído viaja como origen", async () => {
    proxyRespondido({ ok: true, status: 200, data: { ok: true, dato: "tabla" } });
    const res = await extraer({ endpoint: "http://127.0.0.1:8793" }, { html: "<main>hola</main>", prompt: "extraer" });
    expect(peticion?.auth).toBe("none");
    expect((peticion?.body as { html: string }).html).toBe("<main>hola</main>");
    expect(res.data?.fuente).toBe("html");
  });

  it("401 y servicio caído: error claro en español, sin rutas ni conversión en éxito", async () => {
    proxyRespondido({ ok: false, status: 401, error: "La herramienta respondió 401.", data: { error: "token inválido" } });
    const sinClave = await extraer({ endpoint: "http://127.0.0.1:8793" }, ENTRADA_URL);
    expect(sinClave.ok).toBe(false); expect(sinClave.error).toContain("clave");

    proxyRespondido({ ok: false, error: "No se pudo contactar la herramienta: conexión rechazada." });
    const caido = await extraer({ endpoint: "http://127.0.0.1:8793" }, ENTRADA_URL);
    expect(caido.ok).toBe(false);
    expect(caido.error).toContain("herramienta"); expect(caido.error).not.toMatch(/\/home\/|127\.0\.0\.1/);
  });

  it("entrada inválida no toca la red: ni una sola llamada", async () => {
    let llamadas = 0;
    vi.stubGlobal("fetch", async () => { llamadas += 1; return new Response("{}", { status: 200 }); });
    const res = await extraer({ endpoint: "http://127.0.0.1:8793" }, { url: "http://localhost:8793", prompt: "p" });
    expect(res.ok).toBe(false); expect(llamadas).toBe(0);
  });

  it("motivo robots o noai: resultado correcto, y sin datos útiles: error honesto", async () => {
    proxyRespondido({ ok: true, status: 200, data: { ok: false, motivo: "robots" } });
    const conRobots = await extraer({ endpoint: "http://127.0.0.1:8793" }, ENTRADA_URL);
    expect(conRobots).toEqual({ ok: true, data: { datos: null, fuente: PUBLICA, bytes: 0, motivo: "robots", aviso: "el sitio no permite esta lectura" } });

    proxyRespondido({ ok: false, status: 403, error: "La herramienta respondió 403.", data: { motivo: "noai" } });
    const conNoai = await extraer({ endpoint: "http://127.0.0.1:8793" }, ENTRADA_URL);
    expect(conNoai).toEqual({ ok: true, data: { datos: null, fuente: PUBLICA, bytes: 0, motivo: "noai", aviso: "el sitio no permite esta lectura" } });

    proxyRespondido({ ok: true, status: 200, data: { ok: false, error: "SmartScraperGraph error sincronía" } });
    expect((await extraer({ endpoint: "http://127.0.0.1:8793" }, ENTRADA_URL)).error).toContain("SmartScraperGraph");
  });
});

describe("health — GET /salud por el proxy", () => {
  it("pregunta el método y ruta correctos, y degrada honesto", async () => {
    proxyRespondido({ ok: true, status: 200, data: { ok: true, puerto: 8793 } });
    await health({ endpoint: "http://127.0.0.1:8793" });
    expect(peticion?.method).toBe("GET"); expect(peticion?.path).toBe("/salud");

    proxyRespondido({ ok: false, error: "Tiempo de espera agotado." });
    expect((await health({ endpoint: "http://127.0.0.1:8793" })).ok).toBe(false);
  });
});
