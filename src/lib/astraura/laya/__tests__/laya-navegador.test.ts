// Pruebas de Laya en navegador y apps (LYS1018H). Sin red, sin disco y sin cargar modelos: el perfil
// del medio se mide con un entorno falso y la disponibilidad de `vendor/laya-ts` va inyectada.
import { describe, expect, it } from "vitest";
import { perfilDelMedio, type EntornoMedio } from "@/lib/astraura/capas/perfil-medio";
import { planLayaLocal, type DisponibilidadLaya } from "../laya-navegador";

const MB = 1024 * 1024;
const DISPONIBLE: DisponibilidadLaya = { layaTsDisponible: true, modeloExportado: true };

const entorno = (cambios: Partial<EntornoMedio> = {}): EntornoMedio => ({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webgpuMaxBufferBytes: 256 * MB,
  wasmDisponible: true,
  wasmSimd: true,
  crossOriginIsolated: true,
  cuotaBytes: 60 * 1024 * MB,
  usoBytes: 0,
  persistente: true,
  visible: true,
  bateriaNivel: 0.9,
  ramLibreMb: 8192,
  ...cambios,
});

const pwa = (cambios: Partial<EntornoMedio> = {}) =>
  perfilDelMedio(entorno({ esPWA: true, ...cambios }));
describe("planLayaLocal · lo que aún no existe", () => {
  it("sin vendor/laya-ts ni modelo exportado devuelve cargar:false con ese motivo", () => {
    const plan = planLayaLocal(pwa());
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toContain("tarea O");
  });
  it("basta con que falte uno de los dos para no cargar", () => {
    expect(planLayaLocal(pwa(), { layaTsDisponible: true }).cargar).toBe(false);
    expect(planLayaLocal(pwa(), { modeloExportado: true }).cargar).toBe(false);
  });
});

describe("planLayaLocal · visita web y servidor", () => {
  it("una visita web nunca carga Laya: va por la malla", () => {
    const plan = planLayaLocal(perfilDelMedio(entorno()), DISPONIBLE);
    expect(plan).toMatchObject({ cargar: false, modelo: null });
    expect(plan.motivo).toContain("malla");
  });
  it("un servidor usa su Laya propio, no el del aparato", () => {
    const plan = planLayaLocal(perfilDelMedio(entorno({ plataformaForzada: "servidor" })), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("servidor");
  });
});

describe("planLayaLocal · PWA", () => {
  it("con WebGPU, persistencia, 2 GB de almacenamiento y 4 GB de memoria carga multilingual", () => {
    expect(planLayaLocal(pwa(), DISPONIBLE)).toMatchObject({ cargar: true, modelo: "multilingual" });
  });
  it("con 4 GB justos de memoria baja a multilingual-int8", () => {
    expect(planLayaLocal(pwa({ ramLibreMb: 4096 }), DISPONIBLE)).toMatchObject({
      cargar: true,
      modelo: "multilingual-int8",
    });
  });
  it("sin WebGPU no carga: va por la malla", () => {
    const plan = planLayaLocal(pwa({ webgpuMaxBufferBytes: null }), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("WebGPU");
  });
  it("sin almacenamiento persistente no carga", () => {
    expect(planLayaLocal(pwa({ persistente: false }), DISPONIBLE).motivo).toContain("persistente");
  });
  it("con menos de 2 GB de almacenamiento no carga", () => {
    const plan = planLayaLocal(pwa({ cuotaBytes: 1536 * MB }), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("2 GB");
  });
  it("con menos de 4 GB de memoria no carga", () => {
    const plan = planLayaLocal(pwa({ ramLibreMb: 3000 }), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("4 GB");
  });
});

describe("planLayaLocal · apps nativas", () => {
  const nativa = (plataforma: "tauri" | "android" | "ios", discoLibreBytes: number) =>
    perfilDelMedio(entorno({ plataformaForzada: plataforma, discoLibreBytes }));
  it("carga multilingual si el modelo cabe en su presupuesto", () => {
    expect(planLayaLocal(nativa("tauri", 100 * 1024 * MB), DISPONIBLE)).toMatchObject({
      cargar: true,
      modelo: "multilingual",
    });
  });
  it("con presupuesto ajustado carga multilingual-int8", () => {
    expect(planLayaLocal(nativa("android", 6 * 1024 * MB), DISPONIBLE)).toMatchObject({
      cargar: true,
      modelo: "multilingual-int8",
    });
  });
  it("si no cabe ni el int8 no carga", () => {
    const plan = planLayaLocal(nativa("ios", 1 * 1024 * MB), DISPONIBLE);
    expect(plan).toMatchObject({ cargar: false, modelo: null });
    expect(plan.motivo).toContain("presupuesto");
  });
});

describe("planLayaLocal · segundo plano", () => {
  it("con batería por debajo del 20 % no carga", () => {
    const plan = planLayaLocal(pwa({ bateriaNivel: 0.15 }), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("batería");
  });
  it("con la pestaña oculta no carga", () => {
    const plan = planLayaLocal(pwa({ visible: false }), DISPONIBLE);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("oculta");
  });
});
