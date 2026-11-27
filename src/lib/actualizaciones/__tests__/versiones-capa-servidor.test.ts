import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("versionesDeEsteMedio - servidor", () => {
  const originalWindow = global.window;
  const originalCaches = global.caches;

  beforeEach(() => {
    vi.resetModules();
    global.window = undefined as unknown as Window & typeof globalThis;
    global.caches = undefined as unknown as CacheStorage;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.caches = originalCaches;
  });

  it("sin app nativa → capaBuild es undefined", async () => {
    global.window = undefined as unknown as Window & typeof globalThis;

    vi.resetModules();
    const { versionesDeEsteMedio } = await import("../versiones-locales");
    const v = await versionesDeEsteMedio();

    expect(v.servidor).toBeUndefined();
  });

  it("con estado simulado → capaBuild = web_corre", async () => {
    const mockEstado = {
      fase: "local",
      web_corre: "abc123def",
      capa: "capa123",
      version_paquete: "0.5.0",
    };

    const mockInvoke = vi.fn().mockResolvedValue(mockEstado);

    global.window = {
      __TAURI__: {
        core: { invoke: mockInvoke },
      },
    } as unknown as Window & typeof globalThis;

    vi.resetModules();
    const { versionesDeEsteMedio } = await import("../versiones-locales");
    const v = await versionesDeEsteMedio();

    expect(mockInvoke).toHaveBeenCalledWith("servidor_local_estado");
    expect(v.servidor).toBeDefined();
    expect(v.servidor?.capaBuild).toBe("abc123def");
    expect(v.servidor?.capa).toBe("capa123");
    expect(v.servidor?.versionPaquete).toBe("0.5.0");
  });

  it("fallo en Tauri → servidor undefined", async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error("fail"));

    global.window = {
      __TAURI__: {
        core: { invoke: mockInvoke },
      },
    } as unknown as Window & typeof globalThis;

    vi.resetModules();
    const { versionesDeEsteMedio } = await import("../versiones-locales");
    const v = await versionesDeEsteMedio();

    expect(mockInvoke).toHaveBeenCalledWith("servidor_local_estado");
    expect(v.servidor).toBeUndefined();
  });
});

describe("crearFichaNodo - nuevos campos", () => {
  beforeEach(() => {
    vi.resetModules();
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("sin datos nuevos → capaBuild undefined, rol undefined, slotsLibres undefined", async () => {
    const { crearFichaNodo } = await import("@/lib/network/capacidades-nodo");
    const ficha = crearFichaNodo({
      nodoId: "nodo1",
      medio: "navegador",
      ramLibreMb: 1024,
      cpu: 10,
    });

    expect(ficha.capaBuild).toBeUndefined();
    expect(ficha.appVersion).toBeUndefined();
    expect(ficha.rol).toBeUndefined();
    expect(ficha.slotsLibres).toBeUndefined();
  });

  it("con datos pasados explícitamente → capaBuild y appVersion se rellenan", async () => {
    const { crearFichaNodo } = await import("@/lib/network/capacidades-nodo");
    const ficha = crearFichaNodo({
      nodoId: "nodo1",
      medio: "navegador",
      ramLibreMb: 1024,
      cpu: 10,
      capaBuild: "abc123def",
      appVersion: "2026.11.06",
    });

    expect(ficha.capaBuild).toBe("abc123def");
    expect(ficha.appVersion).toBe("2026.11.06");
  });

  it("rol pasado explícitamente se respeta", async () => {
    const { crearFichaNodo } = await import("@/lib/network/capacidades-nodo");
    const ficha = crearFichaNodo({
      nodoId: "nodo1",
      medio: "navegador",
      ramLibreMb: 1024,
      cpu: 10,
      rol: "director",
    });

    expect(ficha.rol).toBe("director");
  });

  it("slotsLibres pasado explícitamente se respeta", async () => {
    const { crearFichaNodo } = await import("@/lib/network/capacidades-nodo");
    const ficha = crearFichaNodo({
      nodoId: "nodo1",
      medio: "navegador",
      ramLibreMb: 1024,
      cpu: 10,
      slotsLibres: 4,
    });

    expect(ficha.slotsLibres).toBe(4);
  });

  it("campos viejos no cambian", async () => {
    const { crearFichaNodo } = await import("@/lib/network/capacidades-nodo");
    const ficha = crearFichaNodo({
      nodoId: "nodo1",
      medio: "navegador",
      needle: { version: "1.0.0" },
      bitnet: { tokPorS: 50, ctx: 2048, ocupado: false },
      jev: true,
      ramLibreMb: 2048,
      cpu: 5,
      capas: ["needle@1.0.0", "bitnet@0.5.0"],
      tokS: { bitnet: 50 },
      bateriaPct: 80,
      enSegundoPlano: false,
      ambitos: ["propio", "cuenta"],
      discoLibreGb: 100,
      almacen: ["/data"],
    });

    expect(ficha.nodoId).toBe("nodo1");
    expect(ficha.medio).toBe("navegador");
    expect(ficha.needle).toEqual({ version: "1.0.0" });
    expect(ficha.bitnet).toEqual({ tokPorS: 50, ctx: 2048, ocupado: false });
    expect(ficha.jev).toBe(true);
    expect(ficha.ramLibreMb).toBe(2048);
    expect(ficha.cpu).toBe(5);
    expect(ficha.capas).toEqual(["needle@1.0.0", "bitnet@0.5.0"]);
    expect(ficha.tokS).toEqual({ bitnet: 50 });
    expect(ficha.bateriaPct).toBe(80);
    expect(ficha.enSegundoPlano).toBe(false);
    expect(ficha.ambitos).toEqual(["propio", "cuenta"]);
    expect(ficha.discoLibreGb).toBe(100);
    expect(ficha.almacen).toEqual(["/data"]);
  });
});

describe("medirFichaPropia - integra versiones y rol", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", { getBattery: vi.fn().mockResolvedValue({ level: 0.5 }) });
    vi.stubGlobal("document", { hidden: false });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("llama versionesDeEsteMedio y pasa capaBuild y appVersion", async () => {
    const mockVersiones = {
      interfaz: "2026.11.06",
      servidor: { capaBuild: "abc123def", capa: "capa123", versionPaquete: "0.5.0" },
    };

    vi.doMock("@/lib/actualizaciones/versiones-locales", () => ({
      versionesDeEsteMedio: vi.fn().mockResolvedValue(mockVersiones),
    }));

    vi.doMock("@/lib/aurora/medidas-voz", () => ({
      leerMedidas: vi.fn().mockReturnValue([]),
    }));

    vi.doMock("@/lib/network/identidad-dispositivo", () => ({
      neuronDeviceIdActual: vi.fn().mockReturnValue("neuron-1"),
    }));

    vi.doMock("@/lib/network/capacidades-nodo", async () => {
      const actual = await vi.importActual("@/lib/network/capacidades-nodo");
      return {
        ...actual,
        vozMedida: vi.fn().mockReturnValue(undefined),
      };
    });

    const { medirFichaPropia } = await import("@/lib/network/ficha-propia");
    const ficha = await medirFichaPropia({
      id: "device-1",
      platform: "mac",
      capas: ["needle@1.0.0"],
      tokS: { needle: 100 },
    });

    expect(ficha.capaBuild).toBe("abc123def");
    expect(ficha.appVersion).toBe("2026.11.06");
  });

  it("lee rol desde localStorage y lo pasa", async () => {
    const mockVersiones = {
      interfaz: "2026.11.06",
      servidor: undefined,
    };

    vi.doMock("@/lib/actualizaciones/versiones-locales", () => ({
      versionesDeEsteMedio: vi.fn().mockResolvedValue(mockVersiones),
    }));

    vi.doMock("@/lib/aurora/medidas-voz", () => ({
      leerMedidas: vi.fn().mockReturnValue([]),
    }));

    vi.doMock("@/lib/network/identidad-dispositivo", () => ({
      neuronDeviceIdActual: vi.fn().mockReturnValue("neuron-1"),
    }));

    vi.doMock("@/lib/network/capacidades-nodo", async () => {
      const actual = await vi.importActual("@/lib/network/capacidades-nodo");
      return {
        ...actual,
        vozMedida: vi.fn().mockReturnValue(undefined),
      };
    });

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => (key === "starseed.pruebas.rol.v1" ? "aparato-de-prueba" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const { medirFichaPropia } = await import("@/lib/network/ficha-propia");
    const ficha = await medirFichaPropia({
      id: "device-1",
      platform: "mac",
      capas: [],
      tokS: null,
    });

    expect(ficha.rol).toBe("aparato-de-prueba");
  });
});