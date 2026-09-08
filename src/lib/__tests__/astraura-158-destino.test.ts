/**
 * Test del puente a la neurona local (Ola 278 · OS5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo funciones puras: `urlPuenteLocal` (client) y `destinoEsLocal` (detector
 * de neurona local). No importa el route ni parchea módulos de Node (en este
 * repo esos tests fallan), por eso vive en módulos importables.
 */

import { describe, it, expect } from "vitest";
import { urlPuenteLocal } from "@/ai/providers/astraura-158";
import { destinoEsLocal } from "@/lib/astraura/destino-local";

describe("urlPuenteLocal", () => {
  it("enruta una ruta del backend por el puente con destino local", () => {
    expect(urlPuenteLocal("/api/ping")).toBe("/api/ai/astraura-158/api/ping?destino=local");
  });

  it("conserva una búsqueda previa junto a destino=local", () => {
    const url = urlPuenteLocal("/api/status", "fresco=1");
    expect(url).toContain("fresco=1");
    expect(url).toContain("destino=local");
    expect(url).toMatch(/^\/api\/ai\/astraura-158\/api\/status\?/);
  });

  it("sobrescribe un destino=local previo (idempotente)", () => {
    const url = urlPuenteLocal("/api/ping", "destino=nube");
    expect(url).toBe("/api/ai/astraura-158/api/ping?destino=local");
  });

  it("admite rutas sin barra inicial", () => {
    expect(urlPuenteLocal("api/ping")).toBe("/api/ai/astraura-158/api/ping?destino=local");
  });
});

describe("destinoEsLocal", () => {
  it("sigue identificando la neurona local por loopback", () => {
    expect(destinoEsLocal("http://127.0.0.1:8000")).toBe(true);
  });
});