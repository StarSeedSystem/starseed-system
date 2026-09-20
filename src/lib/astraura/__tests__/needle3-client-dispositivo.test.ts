/// <reference types="vitest" />
import { vi, describe, test, expect, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock the needle-wasm module before importing anything that uses it
vi.mock("../needle-wasm", () => ({
  decidirEnDispositivo: vi.fn(),
}));
// Reset module registry to ensure our mock is used
vi.resetModules();

import { decidirConNeedle, reiniciarNeedleDispositivo, type DecisionNeedle, type HerramientaNeedle } from "../needle3-client";
import { decidirEnDispositivo } from "../needle-wasm";

describe("needle3-client device decision", () => {
  const consulta = "test consulta";
  const herramientas: HerramientaNeedle[] = [
    {
      name: "test",
      description: "test tool",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  ];

  afterEach(() => {
    vi.clearAllMocks();
    reiniciarNeedleDispositivo();
  });

  test("device responds with high confidence -> no HTTP call, origen === 'dispositivo'", async () => {
    const dispositivoRespuesta: DecisionNeedle = {
      ok: true,
      confianza: 0.9,
      llamadas: [{ nombre: "test", argumentos: {} }],
    };
    (decidirEnDispositivo as Mock).mockResolvedValue(dispositivoRespuesta);

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(resultado.origen).toBe("dispositivo");
    expect(resultado.confianza).toBe(0.9);
  });

  test("device throws -> calls server and origen === 'servidor'", async () => {
    (decidirEnDispositivo as Mock).mockRejectedValue(new Error("WASM error"));

    // Mock fetch to return a server decision
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        confianza: 0.8,
        llamadas: [{ nombre: "test", argumentos: {} }],
      } as DecisionNeedle),
    }) as unknown as typeof fetch;

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.origen).toBe("servidor");
    expect(resultado.confianza).toBe(0.8);
  });

  test("device takes longer than timeoutDispositivoMs -> calls server", async () => {
    // Mock device to take a long time
    (decidirEnDispositivo as Mock).mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve({ ok: true, confianza: 0.9 }), 3000))
    );

    // Mock fetch to return immediately
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        confianza: 0.7,
        llamadas: [],
      } as DecisionNeedle),
    }) as unknown as typeof fetch;

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
      timeoutDispositivoMs: 100, // 100ms timeout
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.origen).toBe("servidor");
    expect(resultado.confianza).toBe(0.7);
  });

test("after a failure, second call does not retry device until reiniciarNeedleDispositivo", async () => {
      // First call: device fails
      (decidirEnDispositivo as Mock).mockRejectedValueOnce(new Error("WASM error"));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          confianza: 0.6,
          llamadas: [],
        } as DecisionNeedle),
      }) as unknown as typeof fetch;

      await decidirConNeedle("local", consulta, herramientas, {
        enDispositivo: true,
        transporte: fetchMock,
      });

      // After first call: device called once, server called once
      expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call: device should not be called because of failure memory
      await decidirConNeedle("local", consulta, herramientas, {
        enDispositivo: true,
        transporte: fetchMock,
      });

      // After second call: device still called once (not called again), server called twice
      expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // After reset, device should be tried again
      reiniciarNeedleDispositivo();
      (decidirEnDispositivo as Mock).mockResolvedValueOnce({
        ok: true,
        confianza: 0.8,
        llamadas: [{ nombre: "test", argumentos: {} }],
      });

      await decidirConNeedle("local", consulta, herramientas, {
        enDispositivo: true,
        transporte: fetchMock,
      });

      // After third call: device called twice (first and third), server called twice (first and second)
      expect(decidirEnDispositivo).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

  test("with enDispositivo: false and server down -> decidirEnDispositivo is never called", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Server connection refused")) as unknown as typeof fetch;

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: false,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Server connection refused");
  });

  test("with device failing + server failing -> WASM is called exactly once", async () => {
    (decidirEnDispositivo as Mock).mockRejectedValue(new Error("WASM init crash"));
    const fetchMock = vi.fn().mockRejectedValue(new Error("Server 503 Service Unavailable")) as unknown as typeof fetch;

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Server 503 Service Unavailable");
  });
});