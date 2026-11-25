import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Set up window and document BEFORE any imports
beforeAll(() => {
  const mockStorage: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
  };

  const documentElementMock = {
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    hasAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    style: {},
  };

  const mockWindow = {
    localStorage: localStorageMock,
    document: { documentElement: documentElementMock },
    dispatchEvent: vi.fn(() => true),
    matchMedia: vi.fn(() => ({ matches: false })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  Object.defineProperty(globalThis, "window", {
    value: mockWindow,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: documentElementMock },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { deviceMemory: 8, hardwareConcurrency: 8 },
    writable: true,
    configurable: true,
  });
});

describe("device-tier — persistencia y aislamiento de ajustes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset mock storage
    (globalThis.window as any).localStorage.getItem.mockClear();
    (globalThis.window as any).localStorage.setItem.mockClear();
    (globalThis.window as any).localStorage.removeItem.mockClear();
    (globalThis.window as any).localStorage.clear.mockClear();
    (globalThis.document.documentElement.setAttribute as any).mockClear();
    (globalThis.window.dispatchEvent as any).mockClear();
  });

  async function importModule() {
    return await import("../device-tier");
  }

  describe("getPerfMode / setPerfMode — aislamiento de ajustes", () => {
    it("guarda y lee el modo correctamente", async () => {
      const { getPerfMode, setPerfMode } = await importModule();
      expect(getPerfMode()).toBe("auto");

      setPerfMode("alto");
      expect(getPerfMode()).toBe("alto");
      expect(globalThis.window.localStorage.getItem("starseed.perf.v1")).toBe("alto");

      setPerfMode("eco");
      expect(getPerfMode()).toBe("eco");

      setPerfMode("eficiente");
      expect(getPerfMode()).toBe("eficiente");
    });

    it("cambiar el modo NO afecta a otras claves de localStorage", async () => {
      const { setPerfMode } = await importModule();
      globalThis.window.localStorage.setItem("starseed.apariencia.tema", "dark");
      globalThis.window.localStorage.setItem("starseed.fondo.calidad.v1", "alta");
      globalThis.window.localStorage.setItem("starseed.neurons.prefs.v1", JSON.stringify({ foo: "bar" }));
      globalThis.window.localStorage.setItem("starseed.dock.items.v2", JSON.stringify([{ id: "test" }]));
      globalThis.window.localStorage.setItem("otra.app.config", "valor");

      setPerfMode("eficiente");

      expect(globalThis.window.localStorage.getItem("starseed.apariencia.tema")).toBe("dark");
      expect(globalThis.window.localStorage.getItem("starseed.fondo.calidad.v1")).toBe("alta");
      expect(globalThis.window.localStorage.getItem("starseed.neurons.prefs.v1")).toBe(JSON.stringify({ foo: "bar" }));
      expect(globalThis.window.localStorage.getItem("starseed.dock.items.v2")).toBe(JSON.stringify([{ id: "test" }]));
      expect(globalThis.window.localStorage.getItem("otra.app.config")).toBe("valor");
    });

    it("ciclo completo auto → alto → eco → eficiente → auto preserva otras claves", async () => {
      const { getPerfMode, setPerfMode } = await importModule();
      globalThis.window.localStorage.setItem("starseed.ajustes.usuario", "personalizado");

      setPerfMode("alto");
      setPerfMode("eco");
      setPerfMode("eficiente");
      setPerfMode("auto");

      expect(globalThis.window.localStorage.getItem("starseed.ajustes.usuario")).toBe("personalizado");
      expect(getPerfMode()).toBe("auto");
    });

    it("modo 'eficiente' se guarda correctamente y es recuperable", async () => {
      const { getPerfMode, setPerfMode } = await importModule();
      setPerfMode("eficiente");
      expect(globalThis.window.localStorage.getItem("starseed.perf.v1")).toBe("eficiente");
      expect(getPerfMode()).toBe("eficiente");
    });
  });

  describe("applyPerf / applyRendimiento — atributos en <html>", () => {
    it("applyPerf escribe data-perf (legacy)", async () => {
      const { setPerfMode, applyPerf } = await importModule();
      setPerfMode("alto");
      applyPerf();
      expect(globalThis.document.documentElement.setAttribute).toHaveBeenCalledWith("data-perf", "high");
    });

    it("applyRendimiento escribe data-rendimiento con el modo actual", async () => {
      const { setPerfMode, applyRendimiento } = await importModule();
      setPerfMode("eficiente");
      applyRendimiento();
      expect(globalThis.document.documentElement.setAttribute).toHaveBeenCalledWith("data-rendimiento", "eficiente");
    });

    it("inicializarRendimiento aplica ambos atributos", async () => {
      const { setPerfMode, inicializarRendimiento } = await importModule();
      setPerfMode("eco");
      const resultado = inicializarRendimiento();
      expect(resultado.perf).toBe("eco");
      expect(resultado.rendimiento).toBe("eco");
      expect(globalThis.document.documentElement.setAttribute).toHaveBeenCalledWith("data-perf", "eco");
      expect(globalThis.document.documentElement.setAttribute).toHaveBeenCalledWith("data-rendimiento", "eco");
    });
  });

  describe("resolveApplied — mapeo legacy", () => {
    it("mapea 'alto' → 'high'", async () => {
      const { setPerfMode, resolveApplied } = await importModule();
      setPerfMode("alto");
      expect(resolveApplied()).toBe("high");
    });

    it("mapea 'eco' → 'eco'", async () => {
      const { setPerfMode, resolveApplied } = await importModule();
      setPerfMode("eco");
      expect(resolveApplied()).toBe("eco");
    });

    it("mapea 'eficiente' → 'eco' (legacy)", async () => {
      const { setPerfMode, resolveApplied } = await importModule();
      setPerfMode("eficiente");
      expect(resolveApplied()).toBe("eco");
    });

    it("en 'auto' usa detectTier", async () => {
      const { setPerfMode, resolveApplied } = await importModule();
      setPerfMode("auto");
      expect(resolveApplied()).toBe("high");
    });
  });

  describe("funciones de consulta de fase/FPS/escala", () => {
    it("faseActivaModo refleja el modo actual", async () => {
      const { setPerfMode, faseActivaModo } = await importModule();
      setPerfMode("auto");
      expect(faseActivaModo("animaciones")).toBe(false);

      setPerfMode("eco");
      expect(faseActivaModo("animaciones")).toBe(true);
      expect(faseActivaModo("backdrop-filter")).toBe(false);

      setPerfMode("eficiente");
      expect(faseActivaModo("animaciones")).toBe(true);
      expect(faseActivaModo("backdrop-filter")).toBe(true);
      expect(faseActivaModo("requestAnimationFrame")).toBe(true);
    });

    it("fpsObjetivoModo devuelve el FPS del modo actual", async () => {
      const { setPerfMode, fpsObjetivoModo } = await importModule();
      setPerfMode("auto");
      expect(fpsObjetivoModo()).toBe(0);

      setPerfMode("eco");
      expect(fpsObjetivoModo()).toBe(30);

      setPerfMode("eficiente");
      expect(fpsObjetivoModo()).toBe(10);
    });

    it("escalaFondoModo devuelve la escala del modo actual", async () => {
      const { setPerfMode, escalaFondoModo } = await importModule();
      setPerfMode("alto");
      expect(escalaFondoModo()).toBe(1);

      setPerfMode("eco");
      expect(escalaFondoModo()).toBe(0.5);

      setPerfMode("eficiente");
      expect(escalaFondoModo()).toBe(0.35);
    });

    it("configModoActual devuelve la configuración completa del modo actual", async () => {
      const { setPerfMode, configModoActual } = await importModule();
      setPerfMode("eficiente");
      const config = configModoActual();
      expect(config.modo).toBe("eficiente");
      expect(config.fpsObjetivo).toBe(10);
      expect(config.escalaFondo).toBe(0.35);
      expect(config.fases.length).toBe(7);
    });
  });

  describe("allowHeavyFx / allowFullFx", () => {
    it("allowHeavyFx es false en eco y eficiente", async () => {
      const { setPerfMode, allowHeavyFx } = await importModule();
      setPerfMode("alto");
      expect(allowHeavyFx()).toBe(true);

      setPerfMode("eco");
      expect(allowHeavyFx()).toBe(false);

      setPerfMode("eficiente");
      expect(allowHeavyFx()).toBe(false);
    });

    it("allowFullFx solo true en alto", async () => {
      const { setPerfMode, allowFullFx } = await importModule();
      setPerfMode("auto");
      expect(allowFullFx()).toBe(true);

      setPerfMode("alto");
      expect(allowFullFx()).toBe(true);

      setPerfMode("eco");
      expect(allowFullFx()).toBe(false);

      setPerfMode("eficiente");
      expect(allowFullFx()).toBe(false);
    });
  });

  describe("detectTier — clasificación de hardware", () => {
    it("devuelve 'low' con memoria ≤ 3GB", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { deviceMemory: 2, hardwareConcurrency: 8 },
        writable: true,
        configurable: true,
      });
      const { detectTier } = await importModule();
      expect(detectTier()).toBe("low");
    });

    it("devuelve 'low' con núcleos ≤ 3", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { deviceMemory: 8, hardwareConcurrency: 2 },
        writable: true,
        configurable: true,
      });
      const { detectTier } = await importModule();
      expect(detectTier()).toBe("low");
    });

    it("devuelve 'mid' en móvil/tablet con recursos moderados", async () => {
      (globalThis.window.matchMedia as any).mockImplementation((query: string) => ({
        matches: query === "(pointer: coarse)",
      }));
      Object.defineProperty(globalThis, "navigator", {
        value: { deviceMemory: 4, hardwareConcurrency: 4 },
        writable: true,
        configurable: true,
      });
      const { detectTier } = await importModule();
      expect(detectTier()).toBe("mid");
    });

    it("devuelve 'high' en escritorio potente", async () => {
      (globalThis.window.matchMedia as any).mockImplementation(() => ({ matches: false }));
      Object.defineProperty(globalThis, "navigator", {
        value: { deviceMemory: 16, hardwareConcurrency: 12 },
        writable: true,
        configurable: true,
      });
      const { detectTier } = await importModule();
      expect(detectTier()).toBe("high");
    });
  });
});

describe("EFI1119B — energía y decisión de «auto» (sin tocar ajustes)", () => {
  async function importModule() {
    return await import("../device-tier");
  }

  it("normaliza el estado que manda la app nativa en macOS", async () => {
    const { normalizarEstadoEnergia } = await importModule();
    const e = normalizarEstadoEnergia({
      sistema: "macos",
      bateriaPct: 74,
      cargando: false,
      ahorroSistema: false,
      modoBajoConsumo: true,
      perfilEnergia: null,
      temperaturaC: null,
      tareasPesadas: [],
    });
    expect(e).not.toBeNull();
    expect(e?.sistema).toBe("macos");
    expect(e?.modoBajoConsumo).toBe(true);
  });

  it("normaliza Android, Linux y Windows con sus campos propios", async () => {
    const { normalizarEstadoEnergia } = await importModule();
    const android = normalizarEstadoEnergia({ sistema: "android", bateriaPct: 42, ahorroSistema: true, cargando: true });
    expect(android?.sistema).toBe("android");
    expect(android?.ahorroSistema).toBe(true);
    expect(android?.cargando).toBe(true);

    const linux = normalizarEstadoEnergia({ sistema: "linux", perfilEnergia: "ahorro", bateriaPct: 90 });
    expect(linux?.perfilEnergia).toBe("ahorro");

    const windows = normalizarEstadoEnergia({ sistema: "windows", ahorroSistema: true, bateriaPct: 55 });
    expect(windows?.sistema).toBe("windows");
  });

  it("recorta la batería y descarta temperaturas imposibles y tareas raras", async () => {
    const { normalizarEstadoEnergia } = await importModule();
    const e = normalizarEstadoEnergia({
      sistema: "web",
      bateriaPct: 140,
      temperaturaC: 900,
      tareasPesadas: ["llamada", "inventada"],
    });
    expect(e?.bateriaPct).toBe(100);
    expect(e?.temperaturaC).toBeNull();
    expect(e?.tareasPesadas).toEqual(["llamada"]);
  });

  it("una entrada vacía o basura no inventa estado", async () => {
    const { normalizarEstadoEnergia } = await importModule();
    expect(normalizarEstadoEnergia(null)).toBeNull();
    expect(normalizarEstadoEnergia("x")).toBeNull();
    expect(normalizarEstadoEnergia({})?.sistema).toBe("desconocido");
  });

  it("actualizarEnergia NO cambia el modo guardado ni escribe en localStorage", async () => {
    const { setPerfMode, actualizarEnergia, getPerfMode } = await importModule();
    setPerfMode("alto");
    (globalThis.window.localStorage.setItem as any).mockClear();

    actualizarEnergia({
      sistema: "android",
      bateriaPct: 4,
      cargando: false,
      ahorroSistema: true,
      modoBajoConsumo: false,
      perfilEnergia: null,
      temperaturaC: null,
      tareasPesadas: [],
    });

    expect(getPerfMode()).toBe("alto");
    expect(globalThis.window.localStorage.setItem).not.toHaveBeenCalled();
    expect(globalThis.document.documentElement.getAttribute).not.toHaveBeenCalledWith("starseed.perf.v1");
  });

  it("en «auto» la decisión se publica aparte, sin pisar el modo elegido", async () => {
    const { setPerfMode, actualizarEnergia, getPerfMode } = await importModule();
    setPerfMode("auto");
    const d = actualizarEnergia({
      sistema: "web",
      bateriaPct: 8,
      cargando: false,
      ahorroSistema: false,
      modoBajoConsumo: false,
      perfilEnergia: null,
      temperaturaC: null,
      tareasPesadas: [],
    });
    expect(d.modo).toBe("eficiente");
    expect(d.temporal).toBe(false);
    expect(getPerfMode()).toBe("auto");
    expect(globalThis.document.documentElement.setAttribute).toHaveBeenCalledWith("data-rendimiento-efectivo", "eficiente");
    expect(globalThis.window.localStorage.getItem("starseed.perf.v1")).toBe("auto");
  });

  it("en «auto» las consultas de modo usan la decisión efectiva", async () => {
    const { setPerfMode, actualizarEnergia, modoEfectivo, faseActivaModo, fpsObjetivoModo, escalaFondoModo } =
      await importModule();
    setPerfMode("auto");
    actualizarEnergia({
      sistema: "macos",
      bateriaPct: 7,
      cargando: false,
      ahorroSistema: false,
      modoBajoConsumo: false,
      perfilEnergia: null,
      temperaturaC: null,
      tareasPesadas: [],
    });
    expect(modoEfectivo()).toBe("eficiente");
    expect(faseActivaModo("animaciones")).toBe(true);
    expect(fpsObjetivoModo()).toBe(10);
    expect(escalaFondoModo()).toBe(0.35);
  });

  it("marcar y desmarcar una tarea pesada devuelve el modo sola al terminar", async () => {
    const { setPerfMode, actualizarEnergia, actualizarTareasPesadas } = await importModule();
    setPerfMode("auto");
    actualizarEnergia(null); // sin señales de batería: decide la gama y la tarea
    const enCurso = actualizarTareasPesadas(["transmision"]);
    expect(enCurso.temporal).toBe(true);
    expect(enCurso.modo).toBe("eco"); // gama alta: la transmisión baja a eco mientras dura

    const terminada = actualizarTareasPesadas([]);
    expect(terminada.temporal).toBe(false);
    expect(terminada.modo).toBe("alto");
  });
});
describe("CAP1125D — nodo sin pantalla: tope de 1 cuadro/s sin tocar el modo", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function importModule() {
    return await import("../device-tier");
  }

  const base = {
    sistema: "linux" as const,
    bateriaPct: null,
    cargando: null,
    ahorroSistema: false,
    modoBajoConsumo: false,
    perfilEnergia: null,
    temperaturaC: null,
    tareasPesadas: [],
  };

  it("normaliza sinPantalla y lo deja desconocido cuando falta o no es booleano", async () => {
    const { normalizarEstadoEnergia } = await importModule();
    expect(normalizarEstadoEnergia({ ...base, sinPantalla: true })?.sinPantalla).toBe(true);
    expect(normalizarEstadoEnergia({ ...base, sinPantalla: false })?.sinPantalla).toBe(false);
    expect(normalizarEstadoEnergia({ ...base })?.sinPantalla).toBeNull();
    expect(normalizarEstadoEnergia({ ...base, sinPantalla: "sí" })?.sinPantalla).toBeNull();
  });

  it("sin pantalla baja a 1 cuadro/s cualquier tope, también el de «alto» (0)", async () => {
    const { fpsConSinPantalla } = await importModule();
    expect(fpsConSinPantalla(0, true, [])).toBe(1);
    expect(fpsConSinPantalla(30, true, [])).toBe(1);
    expect(fpsConSinPantalla(10, true, [])).toBe(1);
    expect(fpsConSinPantalla(10, false, [])).toBe(10);
    expect(fpsConSinPantalla(0, null, [])).toBe(0);
    expect(fpsConSinPantalla(10, undefined, [])).toBe(10);
  });

  it("con control remoto o transmisión viva se ignora sinPantalla: quien controla sí ve", async () => {
    const { fpsConSinPantalla } = await importModule();
    expect(fpsConSinPantalla(30, true, ["control-remoto"])).toBe(30);
    expect(fpsConSinPantalla(10, true, ["transmision"])).toBe(10);
    expect(fpsConSinPantalla(0, true, ["control-remoto", "transmision"])).toBe(0);
    expect(fpsConSinPantalla(30, true, ["llamada"])).toBe(1);
  });

  it("fpsObjetivoModo aplica el tope sin cambiar el modo guardado y lo suelta al terminar el control", async () => {
    const { setPerfMode, getPerfMode, actualizarEnergia, actualizarTareasPesadas, fpsObjetivoModo } =
      await importModule();
    setPerfMode("eficiente");
    actualizarEnergia({ ...base, sinPantalla: true });
    expect(fpsObjetivoModo()).toBe(1);
    expect(getPerfMode()).toBe("eficiente");
    expect(globalThis.window.localStorage.getItem("starseed.perf.v1")).toBe("eficiente");

    actualizarTareasPesadas(["control-remoto"]);
    expect(fpsObjetivoModo()).toBe(10);

    actualizarTareasPesadas([]);
    expect(fpsObjetivoModo()).toBe(1);
    expect(getPerfMode()).toBe("eficiente");
  });
});
