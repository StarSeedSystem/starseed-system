// INV1025D — cliente TS del extractor local de ScrapeGraphAI (fetch simulado).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntradaExtraccion } from "../clients/scrapegraph";
import { LIMITE_HTML, PROMPT_MAXIMO, errorAmable, esUrlPublica, extraer, salud, validarEntrada } from "../clients/scrapegraph";
import type { IntegrationConfig } from "../types";

const CFG: IntegrationConfig = { enabled: true, endpoint: "http://127.0.0.1:8793", apiKey: "TOKEN-SERVICIO" };
const ENTRADA: EntradaExtraccion = { url: "https://ejemplo.org/proyecto", prompt: "Extrae el título" };
const LANZA = Symbol("fallo-de-red");
let llamada: { url: string; cuerpo: Record<string, unknown> } | null = null;

/** Stub de fetch: responde como el proxy con `json`, o lanza un fallo de red. */
function proxyResponde(json: unknown): void {
  vi.stubGlobal("fetch", json === LANZA
    ? async (): Promise<Response> => { throw new Error("fetch failed"); }
    : async (url: unknown, opciones: Record<string, unknown> = {}) => {
      llamada = { url: String(url), cuerpo: JSON.parse(String(opciones.body || "{}")) as Record<string, unknown> };
      return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
    });
}

/** Cuerpo de la última llamada hecha al proxy (o vacío si no la hubo). */
function cuerpoUltima(): Record<string, unknown> { return (llamada ?? { url: "", cuerpo: {} as Record<string, unknown> }).cuerpo; }

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
  llamada = null;
});
afterEach(() => vi.unstubAllGlobals());
describe("esUrlPublica y validarEntrada — funciones puras", () => {
  it("solo acepta http/https públicos (sin redes internas)", () => {
    expect(esUrlPublica("https://ejemplo.org/a")).toBe(true);
    expect(esUrlPublica("http://localhost:9999/extraer")).toBe(false);
    expect(esUrlPublica("http://192.168.1.3/a")).toBe(false);
    expect(esUrlPublica("http://169.254.169.254/latest")).toBe(false);
    expect(esUrlPublica("ftp://ejemplo.org/doc")).toBe(false);
    expect(esUrlPublica("ejemplo.org")).toBe(false);
  });
  it("rechaza fuentes dobles, vacías o enormes y prompts fuera de rango", () => {
    expect(validarEntrada(ENTRADA)).toBe("");
    expect(validarEntrada({ ...ENTRADA, html: "<p>hola</p>" })).toContain("una sola fuente");
    expect(validarEntrada({ prompt: "hola" })).toContain("una URL o un HTML");
    expect(validarEntrada({ html: "x".repeat(LIMITE_HTML + 1), prompt: "hola" })).toContain("400 KB");
    expect(validarEntrada({ ...ENTRADA, prompt: "   " })).toContain("instrucción");
    expect(validarEntrada({ ...ENTRADA, prompt: "a".repeat(PROMPT_MAXIMO + 1) })).toContain("1000");
    expect(validarEntrada({ ...ENTRADA, esquema: ["a"] as unknown as Record<string, unknown> })).toContain("objeto JSON");
  });
});
describe("extraer — llamada por el proxy con fetch simulado", () => {
  it("éxito: mapea datos, fuente y bytes; envía url+prompt+esquema con Bearer", async () => {
    proxyResponde({ ok: true, status: 200, data: { ok: true, datos: { titulo: "Proyecto" }, fuente: "https://ejemplo.org/proyecto", bytes: 1200 } });
    const res = await extraer(CFG, { ...ENTRADA, prompt: "  Extrae el título  ", esquema: { titulo: "string" } });
    expect(res.ok).toBe(true); expect(res.data?.datos).toEqual({ titulo: "Proyecto" });
    expect(res.data?.fuente).toBe("https://ejemplo.org/proyecto"); expect(res.data?.bytes).toBe(1200);
    const c = cuerpoUltima();
    expect(c.path).toBe("/extraer");
    expect(c.auth).toBe("bearer");
    const b = c.body as Record<string, unknown>;
    expect(b.url).toBe("https://ejemplo.org/proyecto");
    expect(b.prompt).toBe("Extrae el título");
    expect(b.esquema).toEqual({ titulo: "string" });
    expect(Object.keys(b).sort()).toEqual(["esquema", "prompt", "url"]);
  });
  it("éxito con HTML ya leído; el cuerpo no lleva claves", async () => {
    proxyResponde({ ok: true, status: 200, data: { ok: true, datos: ["a"], bytes: 8 } });
    const res = await extraer(CFG, { html: "<p>hola</p>", prompt: "lista" });
    expect(res.ok).toBe(true);
    expect(res.data?.datos).toEqual(["a"]);
    const b = cuerpoUltima().body as Record<string, unknown>;
    expect(b.html).toBe("<p>hola</p>");
    // El cuerpo solo lleva url|html + prompt: la clave va en el Bearer del proxy.
    expect("url" in b).toBe(false); expect(JSON.stringify(b)).not.toContain("TOKEN");
  });
  it("401: error amable sin la clave", async () => {
    proxyResponde({ ok: false, status: 401, error: "La herramienta respondió 401." });
    const res = await extraer(CFG, ENTRADA);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("El extractor local rechazó la clave del servicio.");
  });
  it("servicio caído: mensaje honesto sin rutas internas", async () => {
    proxyResponde(LANZA);
    const res = await extraer(CFG, ENTRADA);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("No se pudo contactar el extractor local. Comprueba que el servicio esté arrancado en esta máquina.");
  });
  it("motivo robots o noai: resultado correcto, no un fallo", async () => {
    proxyResponde({ ok: false, status: 200, error: "El sitio no permite esta lectura (robots).", data: { motivo: "robots" } });
    const robots = await extraer(CFG, ENTRADA);
    expect(robots.ok).toBe(true);
    expect(robots.data?.datos).toBeNull();
    expect(robots.data?.motivo).toBe("robots");
    proxyResponde({ ok: false, status: 200, error: "Este sitio no autoriza IA (noai)." });
    const noai = await extraer(CFG, ENTRADA);
    expect(noai.ok).toBe(true);
    expect(noai.data?.motivo).toBe("noai");
  });
  it("entrada inválida no toca la red y endpoint vacío avisa en español", async () => {
    proxyResponde({ ok: true, status: 200, data: {} });
    const res = await extraer(CFG, { url: "http://localhost:8793", prompt: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("http/https");
    expect(llamada).toBeNull();
    const sinEndpoint = await extraer({ enabled: true }, ENTRADA);
    expect(sinEndpoint.ok).toBe(false);
    expect(sinEndpoint.error).toContain("Configura");
  });
});
describe("salud y errorAmable", () => {
  it("salud consulta GET /salud", async () => {
    proxyResponde({ ok: true, status: 200, data: { ok: true, estado: "lista" } });
    const res = await salud(CFG);
    expect(res.ok).toBe(true);
    expect(cuerpoUltima().path).toBe("/salud");
  });
  it("errorAmable quita rutas y direcciones internas", () => {
    const limpio = errorAmable("Fallo en /home/usuario/.starseed/venvs/scrapegraph/servicio.py línea 9 (127.0.0.1:8793)");
    expect(limpio).not.toContain("/home"); expect(limpio).not.toContain("127.0.0.1");
  });
});