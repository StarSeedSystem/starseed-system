import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { esUrlPublica, extraer, health, mensajeHumano, validarEntrada } from "../clients/scrapegraph";

beforeEach(() => vi.stubGlobal("window", {})); // el cliente solo trabaja en el navegador
afterEach(() => vi.unstubAllGlobals());

type Cuerpo = { path: string; method: string; auth: string; apiKey?: string; body?: unknown };
let cuerpo: Cuerpo = { path: "", method: "", auth: "" };
let peticiones = 0;

function fetchDe(respuesta: unknown): void {
  peticiones = 0;
  vi.stubGlobal("fetch", async (url: string, opciones: { body?: string } = {}) => {
    peticiones++;
    if (url === "/api/integrations/proxy") cuerpo = JSON.parse(String(opciones.body)) as Cuerpo;
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

const CFG = { endpoint: "http://127.0.0.1:8793", apiKey: "clave-local" };
const ENTRADA = { url: "https://ejemplo.org/proyecto", prompt: "Extraer qué hacen y proyectos" };

describe("validarEntrada / esUrlPublica — puros", () => {
  it("rechaza url interna, ambos, html enorme y prompt fuera de rango", () => {
    expect(validarEntrada({ url: "http://127.0.0.1:9002", prompt: "p" })).toContain("públicas");
    expect(validarEntrada({ url: "ftp://ejemplo.org", prompt: "p" })).toContain("públicas");
    expect(validarEntrada({ url: "https://a.dev", html: "<p>x</p>", prompt: "p" })).toContain("no los dos");
    const html = "x".repeat(400_001);
    expect(validarEntrada({ html, prompt: "p" })).toContain("400 KB");
    expect(validarEntrada({ url: "https://a.dev", prompt: "" })).toContain("qué extraer");
    expect(validarEntrada({ url: "https://a.dev", prompt: "a".repeat(1001) })).toContain("1000");
    expect(validarEntrada({ url: "https://a.dev", prompt: "p", esquema: ["no"] })).toContain("objeto JSON");
    expect(validarEntrada({ prompt: "p" })).toContain("Indica la URL");
  });

  it("acepta y rechaza URLs públicas según lo dicho", () => {
    expect(validarEntrada({ url: "https://ejemplo.org", prompt: "p", esquema: { tipo: "string" } })).toBeNull();
    expect(esUrlPublica("https://ejemplo.org")).toBe(true);
    expect(esUrlPublica("http://192.168.1.4/panel")).toBe(false);
    expect(esUrlPublica("localhost:9002/genesis")).toBe(false);
  });
});

describe("extraer — con fetch simulado", () => {
  it("éxito: llama a /extraer con Bearer y devuelve datos, fuente y bytes", async () => {
    fetchDe({ ok: true, data: { datos: { que: "hacen" }, fuente: ENTRADA.url as string, bytes: 512 } });
    const res = await extraer(CFG, ENTRADA);
    expect(res.ok).toBe(true);
    expect((res.data as { datos: unknown }).datos).toEqual({ que: "hacen" });
    expect((res.data as { fuente: string }).fuente).toBe(ENTRADA.url);
    expect((res.data as { bytes: number }).bytes).toBe(512);
    expect(cuerpo.path).toBe("/extraer");
    expect(cuerpo.auth).toBe("bearer");
    expect(cuerpo.apiKey).toBe("clave-local");
    expect(cuerpo.body).toEqual({ url: ENTRADA.url, prompt: ENTRADA.prompt });
    expect(peticiones).toBe(1);
  });

  it("401: cuenta el rechazo honesto, sin rutas ni host del servicio", async () => {
    fetchDe({ ok: false, error: "El servicio respondió 401 Unauthorized." });
    const res = await extraer(CFG, ENTRADA);
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain("Clave");
    expect(String(res.error)).not.toContain("8793");
  });

  it("servicio caído: mensaje de conexión, sin traza técnica", async () => {
    fetchDe({ ok: false, error: "Fallo de red: ECONNREFUSED contra http://127.0.0.1:8793." });
    const res = await extraer(CFG, ENTRADA);
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain("No se pudo conectar");
    expect(String(res.error)).not.toContain("ECONNREFUSED");
  });

  it("motivo robots o noai: resultado correcto con el aviso, no un fallo", async () => {
    fetchDe({ ok: false, error: "", data: { motivo: "robots" } });
    const conRs = await extraer(CFG, ENTRADA);
    expect(conRs.ok).toBe(true);
    expect((conRs.data as { aviso: string }).aviso).toBe("el sitio no permite esta lectura");
    fetchDe({ ok: false, error: "lectura bloqueada por noai", data: null });
    const conNoai = await extraer(CFG, ENTRADA);
    expect(conNoai.ok).toBe(true);
    expect((conNoai.data as { aviso: string }).aviso).toBe("el sitio no permite esta lectura");
  });

  it("entrada inválida: ni problema al proxy", async () => {
    fetchDe({ ok: true, data: {} });
    expect((await extraer(CFG, { url: "http://localhost:9002", prompt: "p" })).ok).toBe(false);
    expect((await extraer(CFG, { url: "https://a.dev", prompt: "" })).ok).toBe(false);
    expect((await extraer(CFG, { html: "x".repeat(400_001), prompt: "p" })).ok).toBe(false);
    expect((await extraer(CFG, { html: "<p></p>", prompt: "p", esquema: "no" })).ok).toBe(false);
    expect(peticiones).toBe(0);
  });
});

describe("health y mensajeHumano", () => {
  it("health: latido por GET /salud", async () => {
    fetchDe({ ok: true, data: { estado: "ok" } });
    const res = await health(CFG);
    expect(res.ok).toBe(true);
    expect(cuerpo.path).toBe("/salud");
    expect(cuerpo.method).toBe("GET");
    expect(peticiones).toBe(1);
  });

  it("mensajeHumano: apenas distancia", () => {
    expect(mensajeHumano()).toBe("El extractor local no pudo procesar la petición.");
    expect(mensajeHumano("Tiempo de espera agotado.")).toContain("tardó demasiado");
    expect(mensajeHumano("Fallo de red: desconocido.")).toContain("¿está arrancado?");
  });
});
