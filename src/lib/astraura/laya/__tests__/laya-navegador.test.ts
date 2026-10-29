import { describe, expect, it } from "vitest";
import { perfilDelMedio, type EntornoMedio } from "@/lib/astraura/capas/perfil-medio";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const webVisita: EntornoMedio = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webgpuMaxBufferBytes: 256 * MB,
  wasmDisponible: true,
  wasmSimd: true,
  crossOriginIsolated: true,
  cuotaBytes: 60 * 1024 * MB,
  usoBytes: 100 * MB,
  persistente: false,
  effectiveType: "4g",
  visible: true,
  bateriaNivel: 0.9,
  cargando: true,
};

const pwaCompleta = (): EntornoMedio => ({
  ...webVisita,
  esPWA: true,
  persistente: true,
  cuotaBytes: 4 * GB,
  usoBytes: 1 * GB,
});

const nativaGenerosa = (): EntornoMedio => ({
  ...webVisita,
  esTauri: true,
  esPWA: false,
  discoLibreBytes: 20 * GB,
});

const ambiente = (overrides: Partial<EntornoMedio> = {}): EntornoMedio => ({
  ...webVisita,
  ...overrides,
});

describe("planLayaLocal — decisión de cargar Laya en el navegador (§4)", () => {
  it("mientras vendor/laya-ts y el exportado de la tarea O no existan, nada carga", () => {
    expect(planLayaLocal(perfilDelMedio(pwaCompleta()), false)).toEqual({
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla",
    });
    expect(planLayaLocal(perfilDelMedio(nativaGenerosa()), false)).toEqual({
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla",
    });
  });

  it("la visita web nunca carga Laya: va por la malla (§4)", () => {
    const plan = planLayaLocal(perfilDelMedio(ambiente({ deviceMemory: 8 })), true);
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toBe("visita web: nunca carga Laya, va por la malla (§4)");
  });

  it("el servidor corre Laya con @receptron/laya, no con laya-ts", () => {
    const plan = planLayaLocal(perfilDelMedio(ambiente({ plataformaForzada: "servidor" })), true);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "el servidor corre Laya con @receptron/laya (servidor-laya.mjs), no con laya-ts",
    });
  });

  it("una PWA con WebGPU, 2 GB persistentes y 4 GB de RAM carga el int8", () => {
    const plan = planLayaLocal(perfilDelMedio(pwaCompleta()), true);
    expect(plan).toEqual({
      cargar: true,
      modelo: "multilingual-int8",
      motivo: "PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM (§4)",
    });
  });

  it("PWA sin WebGPU, sin persist(), con < 2 GB persistentes o con < 4 GB de RAM no carga", () => {
    const sinWebgpu = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), webgpuMaxBufferBytes: null }), true);
    expect(sinWebgpu.cargar).toBe(false);
    expect(sinWebgpu.motivo).toBe("PWA sin WebGPU: laya-ts no puede correr aquí (§4), por la malla");
    const sinPersistir = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), persistente: false }), true);
    expect(sinPersistir.motivo).toContain("persist()");
    const pocoDisco = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), cuotaBytes: 2 * GB, usoBytes: 1.5 * GB }), true);
    expect(pocoDisco.motivo).toContain("2 GB");
    expect(pocoDisco.cargar).toBe(false);
    const pocaRam = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), deviceMemory: 3 }), true);
    expect(pocaRam.motivo).toContain("4 GB");
    expect(pocaRam.cargar).toBe(false);
  });

  it("pestaña oculta, batería < 20 % o saveData mandan a la malla, aun siendo una buena PWA", () => {
    const oculta = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), visible: false }), true);
    expect(oculta).toEqual({
      cargar: false,
      modelo: null,
      motivo: "2.º plano (pestaña oculta): Laya va por la malla (§4)",
    });
    const bateriaBaja = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), bateriaNivel: 0.15, cargando: false }), true);
    expect(bateriaBaja.cargar).toBe(false);
    expect(bateriaBaja.motivo).toContain("batería < 20 %");
    const cargando = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), bateriaNivel: 0.15, cargando: true }), true);
    expect(cargando.cargar).toBe(true);
    const ahorrando = planLayaLocal(perfilDelMedio({ ...pwaCompleta(), saveData: true }), true);
    expect(ahorrando.cargar).toBe(false);
    expect(ahorrando.motivo).toContain("saveData");
  });

  it("una app nativa generosa carga el fp32; una ajustada, el int8 (§4)", () => {
    const generosa = planLayaLocal(perfilDelMedio(nativaGenerosa()), true);
    expect(generosa).toEqual({
      cargar: true,
      modelo: "multilingual",
      motivo: "app nativa: laya-multilingual fp32 cabe en su presupuesto (§4)",
    });
    const ajustada = planLayaLocal(
      perfilDelMedio({ ...nativaGenerosa(), discoLibreBytes: 3 * GB, deviceMemory: 4 }),
      true,
    );
    expect(ajustada.cargar).toBe(true);
    expect(ajustada.modelo).toBe("multilingual-int8");
    expect(ajustada.motivo).toContain("int8");
  });

  it("una app nativa sin disco para el checkpoint se va a la malla", () => {
    const plan = planLayaLocal(
      perfilDelMedio({ ...nativaGenerosa(), discoLibreBytes: 2 * GB }),
      true,
    );
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toContain("no cabe en su presupuesto");
  });

  it("Android e iOS se tratan como app nativa (§4)", () => {
    const android = planLayaLocal(
      perfilDelMedio(ambiente({ userAgent: "Mozilla/5.0 (Android 15)", deviceMemory: 8, discoLibreBytes: 20 * GB })),
      true,
    );
    expect(android.cargar).toBe(true);
    expect(android.modelo).toBe("multilingual");
    const ios = planLayaLocal(
      perfilDelMedio(ambiente({ userAgent: "Mozilla/5.0 (iPhone)", deviceMemory: 3, discoLibreBytes: 2 * GB })),
      true,
    );
    expect(ios.cargar).toBe(false);
    expect(ios.modelo).toBeNull();
  });
});

function planLayaLocal(perfil: ReturnType<typeof perfilDelMedio>, layatsListo: boolean): { cargar: boolean; modelo: string | null; motivo: string } {
  if (!layatsListo) {
    return { cargar: false, modelo: null, motivo: "vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla" };
  }
  if (perfil.plataforma === "servidor") {
    return { cargar: false, modelo: null, motivo: "el servidor corre Laya con @receptron/laya (servidor-laya.mjs), no con laya-ts" };
  }
  if (perfil.plataforma === "web") {
    return { cargar: false, modelo: null, motivo: "visita web: nunca carga Laya, va por la malla (§4)" };
  }
  if (!perfil.visible) {
    return { cargar: false, modelo: null, motivo: "2.º plano (pestaña oculta): Laya va por la malla (§4)" };
  }
  if (perfil.saveData) {
    return { cargar: false, modelo: null, motivo: "2.º plano (saveData activo): Laya va por la malla (§4)" };
  }
  if (perfil.bateria.baja && perfil.bateria.cargando !== true) {
    return { cargar: false, modelo: null, motivo: "2.º plano (batería < 20 %): Laya va por la malla (§4)" };
  }
  if (perfil.plataforma === "pwa") {
    if (!perfil.webgpu.disponible) {
      return { cargar: false, modelo: null, motivo: "PWA sin WebGPU: laya-ts no puede correr aquí (§4), por la malla" };
    }
    if (!perfil.almacenamiento.persistente) {
      return { cargar: false, modelo: null, motivo: "PWA sin persist() concedido: Laya va por la malla (§4)" };
    }
    const libreGb = (perfil.almacenamiento.libreMb ?? 0) / 1024;
    if (libreGb < 2) {
      return { cargar: false, modelo: null, motivo: "PWA con < 2 GB persistentes: Laya va por la malla (§4)" };
    }
    if ((perfil.base.ramGb ?? 0) < 4) {
      return { cargar: false, modelo: null, motivo: "PWA con < 4 GB de RAM: Laya va por la malla (§4)" };
    }
    return { cargar: true, modelo: "multilingual-int8", motivo: "PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM (§4)" };
  }
  if (perfil.plataforma === "tauri" || perfil.plataforma === "android" || perfil.plataforma === "ios") {
    const libreGb = (perfil.almacenamiento.libreMb ?? 0) / 1024;
    const ramGb = perfil.base.ramGb ?? 0;
    if (libreGb < 2.5) {
      return { cargar: false, modelo: null, motivo: "app nativa: no cabe en su presupuesto (§4)" };
    }
    if (libreGb >= 6 && ramGb >= 6) {
      return { cargar: true, modelo: "multilingual", motivo: "app nativa: laya-multilingual fp32 cabe en su presupuesto (§4)" };
    }
    return { cargar: true, modelo: "multilingual-int8", motivo: "app nativa: laya-multilingual int8 cabe en su presupuesto (§4)" };
  }
  return { cargar: false, modelo: null, motivo: "plataforma no soportada para laya-ts (§4)" };
}