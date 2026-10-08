// Tests del perfil del medio (CPA1007B)
import { describe, expect, it } from "vitest";
import { medirPerfil, presupuestoMedio, type EntornoMedio } from "./../perfil-medio";

const fakeNav = (
  overrides: Partial<EntornoMedio["navigator"]> = {},
): EntornoMedio["navigator"] => ({
  userAgent:
    overrides.userAgent ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  connection: { effectiveType: "4g", saveData: false, ...overrides.connection },
  storage: overrides.storage ?? { estimate: () => Promise.resolve({}) },
  getBattery: () => Promise.resolve({ level: 1.0 }),
  visibilityState: "visible",
  crossOriginIsolated: true,
  standalone: false,
  platform: "Win32",
  ...overrides,
});

const baseEntorno = (navOverrides: Partial<EntornoMedio["navigator"]> = {}): EntornoMedio => ({
  getWebGLRenderingContext: () => ({}),
  navigator: fakeNav(navOverrides),
});

const entornoConPlataforma = (
  plataforma: "web" | "pwa" | "tauri" | "android" | "ios",
  navOverrides: Partial<EntornoMedio["navigator"]> = {},
): EntornoMedio => {
  let ua = "";
  let standalone = false;
  let __TAURI__ = false;

  if (plataforma === "pwa") {
    standalone = true;
  } else if (plataforma === "tauri") {
    __TAURI__ = true;
  } else if (plataforma === "ios") {
    ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  } else if (plataforma === "android") {
    ua = "Mozilla/5.0 (Linux; Android 14)";
  }

  return baseEntorno({
    ...navOverrides,
    userAgent: ua || baseEntorno().navigator!.userAgent,
    standalone,
    __TAURI__,
  });
};

describe("medirPerfil", () => {
  it("detecta WebGPU disponible cuando getWebGLRenderingContext está presente", () => {
    const e = baseEntorno();
    const p = medirPerfil(e);
    expect(p.webgpu.disponible).toBe(true);
  });

  it("detecta WebGPU no disponible cuando no hay getWebGLRenderingContext", () => {
    const e: EntornoMedio = { navigator: fakeNav() };
    const p = medirPerfil(e);
    expect(p.webgpu.disponible).toBe(false);
  });

  it("detecta crossOriginIsolated de navigator", () => {
    const e = baseEntorno({ crossOriginIsolated: true });
    const p = medirPerfil(e);
    expect(p.wasm.crossOriginIsolated).toBe(true);

    const e2 = baseEntorno({ crossOriginIsolated: false });
    const p2 = medirPerfil(e2);
    expect(p2.wasm.crossOriginIsolated).toBe(false);
  });

  it("detecta storage.estimate y obtiene cuota y uso", async () => {
    const est = () => Promise.resolve({ quota: 10 * 1024 * 1024, usage: 2 * 1024 * 1024 });
    const e = baseEntorno({ storage: { estimate: est } });
    const p = medirPerfil(e);
    expect(p.storage.cuota).toBe(10 * 1024 * 1024);
    expect(p.storage.uso).toBe(2 * 1024 * 1024);
  });

  it("detecta persistencia de storage", async () => {
    let persistCalled = false;
    const persist = () => {
      persistCalled = true;
      return Promise.resolve(true);
    };
    const e = baseEntorno({ storage: { persist, estimate: () => Promise.resolve({}) } });
    const p = medirPerfil(e);
    expect(persistCalled).toBe(true);
    expect(p.storage.persist).toBe(true);
  });

  it("detecta plataforma web por defecto", () => {
    const e = baseEntorno();
    const p = medirPerfil(e);
    expect(p.plataforma).toBe("web");
  });

  it("detecta plataforma pwa por standalone", () => {
    const e = baseEntorno({ standalone: true });
    const p = medirPerfil(e);
    expect(p.plataforma).toBe("pwa");
  });

  it("detecta plataforma tauri por __TAURI__", () => {
    const e = baseEntorno({ __TAURI__: true });
    const p = medirPerfil(e);
    expect(p.plataforma).toBe("tauri");
  });

  it("detecta plataforma ios por userAgent", () => {
    const e = baseEntorno({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    const p = medirPerfil(e);
    expect(p.plataforma).toBe("ios");
  });

  it("detecta plataforma android por userAgent", () => {
    const e = baseEntorno({
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    });
    const p = medirPerfil(e);
    expect(p.plataforma).toBe("android");
  });

  it("detecta saveData de connection", () => {
    const e = baseEntorno({ connection: { saveData: true } });
    const p = medirPerfil(e);
    expect(p.saveData).toBe(true);

    const e2 = baseEntorno({ connection: { saveData: false } });
    const p2 = medirPerfil(e2);
    expect(p2.saveData).toBe(false);
  });

  it("detecta saveData synchronously", () => {
    const e = baseEntorno({ connection: { saveData: true } });
    const p = medirPerfil(e);
    expect(p.saveData).toBe(true);
  });

  it("detecta conexión lenta por saveData", () => {
    const e = baseEntorno({ connection: { saveData: true } });
    const p = medirPerfil(e);
    expect(p.conexion).toBe("lenta");
  });

  it("detecta conexión lenta por effectiveType 2g", () => {
    const e = baseEntorno({ connection: { effectiveType: "2g" } });
    const p = medirPerfil(e);
    expect(p.conexion).toBe("lenta");
  });

  it("detecta conexión rapida por default", () => {
    const e = baseEntorno();
    const p = medirPerfil(e);
    expect(p.conexion).toBe("rapida");
  });

  it("detecta visibilidad visible por defecto", () => {
    const e = baseEntorno({ visibilityState: "visible" });
    const p = medirPerfil(e);
    expect(p.visibilidad).toBe(true);
  });

  it("detecta visibilidad hidden", () => {
    const e = baseEntorno({ visibilityState: "hidden" });
    const p = medirPerfil(e);
    expect(p.visibilidad).toBe(false);
  });
});

describe("presupuestoMedio", () => {
  it("web con WebGPU: hasta 6 capas reflejo (≤ 12 MB)", () => {
    const e = entornoConPlataforma("web");
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.disco_mb).toBe(12);
    expect(presupuesto.capas_guardables).toEqual(["reflejo"]);
    expect(presupuesto.motivo).toBe("Web, solo reflejo con hasta 6 capas Needle (≤ 12 MB)");
  });

  it("web sin WebGPU: solo 2 capas reflejo", () => {
    const e = { ...entornoConPlataforma("web"), getWebGLRenderingContext: undefined };
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.disco_mb).toBe(4);
    expect(presupuesto.capas_guardables).toEqual(["reflejo"]);
  });

  it("PWA instalada: reflejo completo + memoria + palabra (≤ 1 GB)", () => {
    const e = entornoConPlataforma("pwa");
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.disco_mb).toBe(1024);
    expect(presupuesto.capas_guardables).toContain("reflejo");
    expect(presupuesto.capas_guardables).toContain("memoria");
    expect(presupuesto.capas_guardables).toContain("palabra");
    expect(presupuesto.motivo).toBe("PWA instalada, reflejo completo + memoria + palabra (≤ 1 GB)");
  });

  it("nativo (Tauri/Android/iOS): hasta 15 % del disco libre (tope de 8 GB)", () => {
    const e = entornoConPlataforma("tauri", {
      storage: {
        estimate: () => Promise.resolve({ quota: 16 * 1024 * 1024 * 1024, usage: 2 * 1024 * 1024 * 1024 }),
      },
    });
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.disco_mb).toBeLessThanOrEqual(8 * 1024);
    expect(presupuesto.capas_guardables).toContain("reflejo");
    expect(presupuesto.motivo).toBe("Nativo, hasta el 15 % del disco libre (tope de 8 GB)");
  });

  it("servidor: todas las capas", () => {
    const e = entornoConPlataforma("servidor");
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.capas_guardables).toEqual([
      "reflejo",
      "memoria",
      "palabra",
      "razon",
      "profunda",
      "voz",
      "adaptador",
    ]);
    expect(presupuesto.motivo).toBe("Servidor, todo lo que quepa en RAM");
  });

  it("2.º plano excluye todo excepto reflejo", () => {
    const e = entornoConPlataforma("pwa", {
      visibilityState: "hidden",
      connection: { saveData: false },
      getBattery: () => Promise.resolve({ level: 0.1 }),
      storage: { estimate: () => Promise.resolve({}) },
    });
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.capas_guardables).toEqual([]);
    expect(presupuesto.segundo_plano).toBe(true);
    expect(presupuesto.motivo).toBe("2.º plano o batería baja o saveData o sin conexión");
  });

  it("saveData excluye todo excepto reflejo", () => {
    const e = entornoConPlataforma("pwa", {
      connection: { saveData: true },
    });
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.capas_guardables).toEqual([]);
    expect(presupuesto.segundo_plano).toBe(true);
    expect(presupuesto.motivo).toBe("2.º plano o batería baja o saveData o sin conexión");
  });

  it("batería baja excluye todo excepto reflejo", async () => {
    const e = entornoConPlataforma("pwa", {
      getBattery: () => Promise.resolve({ level: 0.1 }),
    });
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.capas_guardables).toEqual([]);
    expect(presupuesto.segundo_plano).toBe(true);
    expect(presupuesto.motivo).toBe("2.º plano o batería baja o saveData o sin conexión");
  });

  it("sin conexión excluye todo excepto reflejo", () => {
    const e = entornoConPlataforma("pwa", {
      connection: { effectiveType: "sin" },
    });
    const perfil = medirPerfil(e);
    const presupuesto = presupuestoMedio(perfil);
    expect(presupuesto.capas_guardables).toEqual([]);
    expect(presupuesto.segundo_plano).toBe(true);
    expect(presupuesto.motivo).toBe("2.º plano o batería baja o saveData o sin conexión");
  });
});
