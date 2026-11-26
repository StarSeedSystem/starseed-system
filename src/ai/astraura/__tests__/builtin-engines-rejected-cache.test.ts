import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("builtin-engines: caché de promesa rechazada", () => {
  let originalWindow: typeof window;
  let mockImport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalWindow = global.window as unknown as typeof window;
    global.window = {
      ...originalWindow,
      navigator: { gpu: {} },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;

    mockImport = vi.fn();
    vi.stubGlobal("Function", vi.fn((...args) => {
      if (args[0] === "u" && args[1] === "return import(u)") {
        return mockImport;
      }
      return new Function(...args);
    }));

    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.unstubAllGlobals();
  });

  it("getWebllmEngine: tras un fallo permite reintento y carga correctamente", async () => {
    const { getWebllmEngine } = await import("../builtin-engines");

    mockImport
      .mockRejectedValueOnce(new Error("CDN falló"))
      .mockResolvedValueOnce({
        CreateMLCEngine: vi.fn().mockResolvedValue({ chat: { completions: { create: vi.fn() } } }),
      });

    await expect(getWebllmEngine("test-model")).rejects.toThrow("CDN falló");

    const engine = await getWebllmEngine("test-model");
    expect(engine).toBeDefined();
    expect(mockImport).toHaveBeenCalledTimes(2);
  });

  it("getTransformersPipeline: tras un fallo permite reintento y carga correctamente", async () => {
    const { getTransformersPipeline } = await import("../builtin-engines");

    mockImport
      .mockRejectedValueOnce(new Error("CDN falló"))
      .mockResolvedValueOnce({
        pipeline: vi.fn().mockResolvedValue({}),
      });

    await expect(getTransformersPipeline("test-model")).rejects.toThrow("CDN falló");

    const pipe = await getTransformersPipeline("test-model");
    expect(pipe).toBeDefined();
    expect(mockImport).toHaveBeenCalledTimes(2);
  });
});