// Pruebas por medio de planLayaLocal (LYS1018H): visita web, PWA, app nativa y servidor.
// PURAS: perfiles fabricados con perfilDelMedio (entorno inyectado); sin red ni modelos.
import { describe, it, expect } from "vitest";
import { perfilDelMedio, type EntornoMedio } from "@/lib/astraura/capas/perfil-medio";
import { LAYA_TS_LISTO, planLayaLocal } from "../laya-navegador";

const MB = 1024 * 1024;
const GB = 1024 * MB;

const ambiente = (extra: Partial<EntornoMedio> = {}): EntornoMedio => ({
  userAgent: "PruebaLaya/1.0",
  esTauri: false,
  esPWA: false,
  ...extra,
});

/** PWA con todo lo pedido por §4: WebGPU, 2 GB persistentes y 8 GB de RAM. */
const pwaCompleta = (): EntornoMedio => ({
  ...ambiente({ esPWA: true, deviceMemory: 8 }),
  webgpuMaxBufferBytes: 2 * GB,
  cuotaBytes: 12 * GB,
  usoBytes: 2 * GB,
  persistente: true,
});

/** App nativa generosa: 20 GB de disco libre y 8 GB de RAM. */
const nativaGenerosa = (): EntornoMedio => ({ ...ambiente({ esTauri: true, deviceMemory: 8 }), discoLibreBytes: 20 * GB });

describe("planLayaLocal", () => {
  it("mientras vendor/laya-ts y el exportado de la tarea O no existan, nada carga", () => {
    expect(LAYA_TS_LISTO).toBe(false);
    expect(planLayaLocal(perfilDelMedio(pwaCompleta()))).toEqual({
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla",
    });
    expect(planLayaLocal(perfilDelMedio(nativaGenerosa()))).toEqual({
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla",
    });
  });
});

describe("planLayaLocal con el exportado listo (tarea O)", () => {
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
    // Cargando el aparato el medio no está en 2.º plano: sí carga.
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
    // 3 GB de disco libre → presupuesto de 460 MB: no cabe el fp32 (1.300 MB) pero sí el int8.
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
