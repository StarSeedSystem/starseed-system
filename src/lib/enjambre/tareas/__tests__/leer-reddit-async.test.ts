import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { leerRedditAsyncPatterns } from "../leer-reddit-async";

describe("leerRedditAsyncPatterns · tarea del enjambre (agent-reach)", () => {
  const token = "test-token";
  const url = "https://www.reddit.com/r/rust/comments/xyz123/async_patterns/";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extrae patrones cuando el proxy devuelve ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        content: "Patrón 1: Tokio\nPatrón 2: Futures\nPatrón 3: async-std",
        items: []
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(true);
    expect(r.data?.patrones).toContain("Tokio");
    expect(r.data?.patrones).toContain("Futures");
    expect(r.data?.patrones).toContain("async-std");
  });

  it("maneja NEED_LOGIN_BLOQUEADO con sugerencia de búsqueda web", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        codigo: "NEED_LOGIN_BLOQUEADO",
        error: "Canal con sesión apagado (R1): solo canales públicos sin iniciar sesión."
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("login");
    expect(r.sugerencia).toContain("web-search");
  });

  it("maneja NEED_SETUP devolviendo hint de instalación", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        codigo: "NEED_SETUP",
        error: "agent-reach no está instalado en esta neurona.",
        hint: "Instala Agent-Reach con: uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip"
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("uv tool install");
    expect(r.hint).not.toContain("pip install");
    expect(r.hint).not.toContain("npx");
  });

  it("maneja RATE_LIMITED sin reintentar en bucle", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        codigo: "RATE_LIMITED",
        error: "El origen limita las peticiones; prueba más tarde."
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(false);
    expect(r.reintentarEn).toBe(60);
    expect(r.error).toContain("limit");
  });

  it("maneja PLATFORM_BLOCKED sin cambiar de backend", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        codigo: "PLATFORM_BLOCKED",
        error: "La plataforma bloquea la lectura (captcha)."
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("bloquea");
  });

  it("rechaza URLs que no son de reddit.com", async () => {
    const r = await leerRedditAsyncPatterns({ token, payload: { url: "https://evil.com/steal" } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("reddit.com");
  });

  it("rechaza URLs con protocolo no https", async () => {
    const r = await leerRedditAsyncPatterns({ token, payload: { url: "http://www.reddit.com/r/rust" } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("https");
  });
});