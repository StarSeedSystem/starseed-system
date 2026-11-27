import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

describe("builtin-engines · caché de promesas rechazadas", () => {
  let originalWindow: typeof window;

  beforeEach(() => {
    originalWindow = global.window;

    global.window = {
      ...originalWindow,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      navigator: {
        gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
      },
    } as unknown as Window & typeof globalThis;

    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  it("webllmEnginePromise: promesa rechazada se limpia del caché permitiendo reintento", async () => {
    const { getWebllmEngine } = await import("../builtin-engines");

    // Mock del import dinámico que falla la primera vez
    let callCount = 0;
    const mockImport = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Error de red simulado"));
      }
      return Promise.resolve({
        CreateMLCEngine: vi.fn().mockResolvedValue({}),
      });
    });

    // Necesitamos exponer el Function constructor mock
    const originalFunction = global.Function;
    global.Function = vi.fn().mockImplementation((_, body) => {
      if (body.includes("import(u)")) {
        return mockImport;
      }
      return originalFunction(_, body);
    }) as any;

    try {
      // Primera llamada: falla
      await expect(getWebllmEngine("test-model")).rejects.toThrow("Error de red simulado");

      // Segunda llamada: debería reintentar (no devolver la misma promesa rechazada)
      await expect(getWebllmEngine("test-model")).resolves.toBeDefined();
      expect(callCount).toBe(2);
    } finally {
      global.Function = originalFunction;
    }
  });

  it("tfPipelinePromise: promesa rechazada se limpia del caché permitiendo reintento", async () => {
    const { getTransformersPipeline } = await import("../builtin-engines");

    let callCount = 0;
    const mockImport = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Error de red simulado"));
      }
      return Promise.resolve({
        pipeline: vi.fn().mockResolvedValue({}),
      });
    });

    const originalFunction = global.Function;
    global.Function = vi.fn().mockImplementation((_, body) => {
      if (body.includes("import(u)")) {
        return mockImport;
      }
      return originalFunction(_, body);
    }) as any;

    try {
      // Primera llamada: falla
      await expect(getTransformersPipeline("test-model")).rejects.toThrow("Error de red simulado");

      // Segunda llamada: debería reintentar
      await expect(getTransformersPipeline("test-model")).resolves.toBeDefined();
      expect(callCount).toBe(2);
    } finally {
      global.Function = originalFunction;
    }
  });
});