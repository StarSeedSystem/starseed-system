// src/lib/aurora/voz-starseed/__tests__/nivel-estudio.test.ts
/**
 * Tests del nivel "estudio-estudio" (Ola 1018V · Voz de Astraura + VoiceStudio)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba pura de la selección con medidas falsas:
 * - VoiceStudio vivo y ≥ 8 GB libres → nivel "estudio-estudio"
 * - VoiceStudio vivo pero < 8 GB libres → nivel "estudio"
 * - VoiceStudio muerto → nivel "estudio"
 * 
 * El primer mensaje de una conversación usa el motor con menos latencia medida que
 * tenga la voz de esa persona; "estudio-estudio" solo para lectura larga, doblaje y audiolibros;
 * nunca se parte un mensaje entre dos motores.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolverNivel } from "../motor";
import type { Capacidades } from "../capacidades";

// Mock del descubrimiento de VoiceStudio
function crearMockDescubrimiento(vivo: boolean, motivo?: string) {
  const fn = vi.fn(async () => {
    if (vivo) {
      return { vivo: true, version: "0.5.7", ofrece: ["voz", "transcripcion"] };
    }
    return { vivo: false, motivo: motivo || "Servicio no disponible" };
  });
  return fn;
}

// Mock de detectarCapacidades
function crearMockCapacidades(memoriaGB: number | undefined, daemonLocal: boolean): Capacidades {
  const fn = vi.fn(async () => ({ memoriaGB, daemonLocal, movil: false, webgpu: false, wasmSimd: false }));
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolverNivel con VoiceStudio", () => {
  it("debe usar nivel estudio-estudio cuando VoiceStudio está vivo y hay ≥ 8 GB libres", async () => {
    const mockCapacidades = crearMockCapacidades(8, true);
    const mockDescubrimiento = crearMockDescubrimiento(true);
    
    vi.stubGlobal("fetch", mockDescubrimiento());
    vi.stubGlobal("detectarCapacidades", mockCapacidades);
    
    const resultado = await resolverNivel();
    expect(resultado).toBe("estudio-estudio");
  });

  it("debe usar nivel estudio cuando VoiceStudio está vivo pero hay < 8 GB libres", async () => {
    const mockCapacidades = crearMockCapacidades(6, true);
    const mockDescubrimiento = crearMockDescubrimiento(true);
    
    vi.stubGlobal("fetch", mockDescubrimiento());
    vi.stubGlobal("detectarCapacidades", mockCapacidades);
    
    const resultado = await resolverNivel();
    expect(resultado).toBe("estudio");
  });

  it("debe usar nivel estudio cuando VoiceStudio está muerto", async () => {
    const mockCapacidades = crearMockCapacidades(8, true);
    const mockDescubrimiento = crearMockDescubrimiento(false, "Servicio no disponible");
    
    vi.stubGlobal("fetch", mockDescubrimiento());
    vi.stubGlobal("detectarCapacidades", mockCapacidades);
    
    const resultado = await resolverNivel();
    expect(resultado).toBe("estudio");
  });

  it("debe respetar el nivel explícito por encima de VoiceStudio disponible", async () => {
    const mockCapacidades = crearMockCapacidades(8, true);
    const mockDescubrimiento = crearMockDescubrimiento(true);
    
    vi.stubGlobal("fetch", mockDescubrimiento());
    vi.stubGlobal("detectarCapacidades", mockCapacidades);
    vi.stubGlobal("nivelPreferido", vi.fn(() => "auto"));
    
    const resultado = await resolverNivel("alta");
    expect(resultado).toBe("alta");
  });

  it("debe usar preferencia del usuario cuando no es 'auto'", async () => {
    const mockCapacidades = crearMockCapacidades(8, true);
    const mockDescubrimiento = crearMockDescubrimiento(true);
    
    vi.stubGlobal("fetch", mockDescubrimiento());
    vi.stubGlobal("detectarCapacidades", mockCapacidades);
    vi.stubGlobal("nivelPreferido", vi.fn(() => "ligera"));
    
    const resultado = await resolverNivel();
    expect(resultado).toBe("ligera");
  });
});