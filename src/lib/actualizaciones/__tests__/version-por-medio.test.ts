import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  medioActual,
  hayActualizacion,
  leerInstalada,
  versionPublicada,
} from "../version-por-medio";
import { OS_VERSION, NATIVE_VERSION } from "../../version/os-release";

// Mocks


vi.mock("../../version/os-release", () => ({
  OS_VERSION: "2026.10.10",
  NATIVE_VERSION: "0.3.0",
  esVersionMasNueva: vi.fn(() => true),
  compararVersiones: vi.fn(() => 1),
}));

describe("medioActual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 'web' por defecto", () => {
    expect(medioActual()).toBe("web");
  });

  it("devuelve 'web' con banderas vacías", () => {
    expect(medioActual({})).toBe("web");
  });

  it("detecta Tauri por banderas", () => {
    expect(medioActual({ tauri: true })).toBe("escritorio");
  });

  it("detecta plataforma Android por banderas", () => {
    expect(medioActual({ plataforma: "android" })).toBe("android");
  });

  it("detecta plataforma iOS por banderas", () => {
    expect(medioActual({ plataforma: "ios" })).toBe("ios");
  });

  it("detecta plataforma escritorio por banderas", () => {
    expect(medioActual({ plataforma: "escritorio" })).toBe("escritorio");
  });

  it("detecta PWA por banderas standalone", () => {
    expect(medioActual({ standalone: true })).toBe("pwa");
  });

  it("prioriza Tauri sobre el resto", () => {
    expect(medioActual({ tauri: true, plataforma: "android", standalone: true })).toBe("escritorio");
  });

  it("devuelve 'escritorio' si es Tauri en window", () => {
    global.window = { __TAURI__: true } as any;
    expect(medioActual()).toBe("escritorio");
  });

  it("devuelve 'pwa' si es standalone", () => {
    global.window = {
      matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }),
    } as any;
    expect(medioActual()).toBe("pwa");
  });

  it("devuelve userAgent Android", () => {
    global.window = {
      matchMedia: () => ({ matches: false }),
    } as any;
    Object.defineProperty(global.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    expect(medioActual()).toBe("android");
  });

  it("devuelve userAgent iOS", () => {
    global.window = {
      matchMedia: () => ({ matches: false }),
    } as any;
    Object.defineProperty(global.navigator, "userAgent", { value: "Mozilla/5.0 iPhone", configurable: true });
    expect(medioActual()).toBe("ios");
  });
});

describe("versionPublicada", () => {
  it("devuelve OS_VERSION para web/pwa", () => {
    expect(versionPublicada("web")).toBe(OS_VERSION);
    expect(versionPublicada("pwa")).toBe(OS_VERSION);
  });

  it("devuelve NATIVE_VERSION para escritorio/android", () => {
    expect(versionPublicada("escritorio")).toBe(NATIVE_VERSION);
    expect(versionPublicada("android")).toBe(NATIVE_VERSION);
  });
});

describe("leerInstalada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lee el build de /version.json si es web/pwa", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ build: "2026.10.09" }),
    } as any);
    expect(await leerInstalada()).toBe("2026.10.09");
  });

  it("devuelve null si no se puede leer", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Sin conexión"));
    expect(await leerInstalada()).toBeNull();
  });
});

describe("hayActualizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve false si no hay versiones", async () => {
    expect(await hayActualizacion({ medio: "web", instalada: null, publicada: null })).toBe(false);
  });

  it("usa esVersionMasNueva para web/pwa", async () => {
    expect(await hayActualizacion({ medio: "web", instalada: "2026.10.09", publicada: "2026.10.10" })).toBe(true);
  });

  it("usa esVersionMasNueva para escritorio/android", async () => {
    expect(await hayActualizacion({ medio: "escritorio", instalada: "0.3.0", publicada: "0.2.0" })).toBe(true);
  });
});