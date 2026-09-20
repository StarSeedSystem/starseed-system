import { vi, describe, test, expect, afterEach } from 'vitest';

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
    (decidirEnDispositivo as vi.Mock).mockResolvedValue(dispositivoRespuesta);

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(resultado.origen).toBe("dispositivo");
    expect(resultado.confianza).toBe(0.9);
  });

  test("device throws -> calls server and origen === 'servidor'", async () => {
    (decidirEnDispositivo as vi.Mock).mockRejectedValue(new Error("WASM error"));

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
    (decidirEnDispositivo as vi.Mock).mockImplementation(() =>
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
    (decidirEnDispositivo as vi.Mock).mockRejectedValueOnce(new Error("WASM error"));
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

    // Second call: device should not be called because of failure memory
    (decidirEnDispositivo as vi.Mock).mockClear();
    await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1); // Only called once (first time)
    expect(fetchMock).toHaveBeenCalledTimes(2); // Called twice (both times fell back to server)

    // After reset, device should be tried again
    reiniciarNeedleDispositivo();
    (decidirEnDispositivo as vi.Mock).mockResolvedValueOnce({
      ok: true,
      confianza: 0.8,
      llamadas: [{ nombre: "test", argumentos: {} }],
    });

    await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(2); // Now called twice
    expect(fetchMock).toHaveBeenCalledTimes(2); // Still 2 because the third call used device
  });
});

  test("device responds with high confidence -> no HTTP call, origen === 'dispositivo'", async () => {
    const dispositivoRespuesta: DecisionNeedle = {
      ok: true,
      confianza: 0.9,
      llamadas: [{ nombre: "test", argumentos: {} }],
    };
    (decidirEnDispositivo as vi.Mock).mockResolvedValue(dispositivoRespuesta);

    const resultado = await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1);
    expect(resultado.origen).toBe("dispositivo");
    expect(resultado.confianza).toBe(0.9);
  });

  test("device throws -> calls server and origen === 'servidor'", async () => {
    (decidirEnDispositivo as vi.Mock).mockRejectedValue(new Error("WASM error"));

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
    (decidirEnDispositivo as vi.Mock).mockImplementation(() =>
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
    (decidirEnDispositivo as vi.Mock).mockRejectedValueOnce(new Error("WASM error"));
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

    // Second call: device should not be called because of failure memory
    (decidirEnDispositivo as vi.Mock).mockClear();
    await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(1); // Only called once (first time)
    expect(fetchMock).toHaveBeenCalledTimes(2); // Called twice (both times fell back to server)

    // After reset, device should be tried again
    reiniciarNeedleDispositivo();
    (decidirEnDispositivo as vi.Mock).mockResolvedValueOnce({
      ok: true,
      confianza: 0.8,
      llamadas: [{ nombre: "test", argumentos: {} }],
    });

    await decidirConNeedle("local", consulta, herramientas, {
      enDispositivo: true,
      transporte: fetchMock,
    });

    expect(decidirEnDispositivo).toHaveBeenCalledTimes(2); // Now called twice
    expect(fetchMock).toHaveBeenCalledTimes(2); // Still 2 because the third call used device
  });
});