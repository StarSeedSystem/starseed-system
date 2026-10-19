import { describe, expect, it } from "vitest";
import { type PerfilMedio } from "../capas/perfil-medio";
import { planLayaLocal, type PlanLayaLocal } from ".";

const WEB_PUERTO_PERFIL: PerfilMedio = {
  base: { ramGb: 8, cpuCores: 8 },
  plataforma: "web",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 0, usoMb: 0, libreMb: 12, persistente: false },
  bateria: { nivel: 1, cargando: true, baja: false },
  ramLibreMb: 6144,
  saveData: false,
  tipoConexion: null,
  visible: true,
};

const PWA_PERFIL: PerfilMedio = {
  base: { ramGb: 4, cpuCores: 4 },
  plataforma: "pwa",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 0, usoMb: 0, libreMb: 1024, persistente: true },
  bateria: { nivel: 1, cargando: true, baja: false },
  ramLibreMb: 3072,
  saveData: false,
  tipoConexion: null,
  visible: true,
};

const NATIVO_ANDROID_PERFIL: PerfilMedio = {
  base: { ramGb: 6, cpuCores: 6 },
  plataforma: "android",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 0, usoMb: 0, libreMb: 2048, persistente: true },
  bateria: { nivel: 1, cargando: true, baja: false },
  ramLibreMb: 4608,
  saveData: false,
  tipoConexion: null,
  visible: true,
};

const SERVIDOR_PERFIL: PerfilMedio = {
  base: { ramGb: 32, cpuCores: 16 },
  plataforma: "servidor",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 100 * 1024, usoMb: 20 * 1024, libreMb: 80 * 1024, persistente: true },
  bateria: { nivel: 1, cargando: true, baja: false },
  ramLibreMb: 22528,
  saveData: false,
  tipoConexion: null,
  visible: true,
};

const BATERIA_BAJA_PERFIL: PerfilMedio = {
  ...WEB_PUERTO_PERFIL,
  bateria: { nivel: 0.15, cargando: false, baja: true },
  saveData: false,
};

const SAVE_DATA_PERFIL: PerfilMedio = {
  ...WEB_PUERTO_PERFIL,
  saveData: true,
};

const OCULTO_PERFIL: PerfilMedio = {
  ...WEB_PUERTO_PERFIL,
  visible: false,
};

describe("planLayaLocal", () => {
  it("devuelve cargar:false para navegador de visita (web)", () => {
    const plan = planLayaLocal(WEB_PUERTO_PERFIL);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "navegador de visita: nunca carga Laya (va por la malla)",
    });
  });

  it("devuelve cargar:true para PWA con presupuesto suficiente", () => {
    const plan = planLayaLocal(PWA_PERFIL);
    expect(plan).toEqual({
      cargar: true,
      modelo: "multilingual",
      motivo: "PWA con WebGPU, RAM 4 GB y ≥2 GB de almacenamiento persistente",
    });
  });

  it("devuelve cargar:false para PWA sin persist()", () => {
    const pwaSinPersist: PerfilMedio = { ...PWA_PERFIL, almacenamiento: { ...PWA_PERFIL.almacenamiento, persistente: false } };
    const plan = planLayaLocal(pwaSinPersist);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "PWA sin persist() concedido: solo reflejo en caché",
    });
  });

  it("devuelve cargar:true para app nativa (Android) con presupuesto", () => {
    const plan = planLayaLocal(NATIVO_ANDROID_PERFIL);
    expect(plan.cargar).toBe(true);
    expect(plan.modelo).toBe("multilingual");
    expect(plan.motivo).toContain("app nativa con presupuesto suficiente");
  });

  it("devuelve cargar:false para app nativa sin presupuesto", () => {
    const nativoSinRam: PerfilMedio = {
      ...NATIVO_ANDROID_PERFIL,
      base: { ...NATIVO_ANDROID_PERFIL.base, ramGb: 2 },
      almacenamiento: { ...NATIVO_ANDROID_PERFIL.almacenamiento, libreMb: 512 },
    };
    const plan = planLayaLocal(nativoSinRam);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "app nativa sin presupuesto suficiente: disco 384 MB, RAM 512 MB, capas reflejo, memoria, palabra, razon",
    });
  });

  it("devuelve cargar:false para servidor (no carga Laya)", () => {
    const plan = planLayaLocal(SERVIDOR_PERFIL);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "servidor: Laya no se ejecuta en el backend",
    });
  });

  it("devuelve cargar:false para medio en segundo plano (batería baja)", () => {
    const plan = planLayaLocal(BATERIA_BAJA_PERFIL);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "medio en segundo plano (pestaña oculta, batería baja o saveData)",
    });
  });

  it("devuelve cargar:false para medio en segundo plano (oculto)", () => {
    const plan = planLayaLocal(OCULTO_PERFIL);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "medio en segundo plano (pestaña oculta, batería baja o saveData)",
    });
  });

  it("devuelve cargar:false para medio en segundo plano (saveData)", () => {
    const plan = planLayaLocal(SAVE_DATA_PERFIL);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "medio en segundo plano (pestaña oculta, batería baja o saveData)",
    });
  });

  it("devuelve cargar:false cuando vendor/laya-ts o modelo no existen", () => {
    const originalVendor = (globalThis as any).vendor;
    const originalLayaModelo = (globalThis as any).layaModelo;
    (globalThis as any).vendor = { layaTs: {} };
    (globalThis as any).layaModelo = "test-modelo";

    const plan = planLayaLocal(WEB_PUERTO_PERFIL);

    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts o modelo exportado (tarea O) no existen todavía",
    });

    (globalThis as any).vendor = originalVendor;
    (globalThis as any).layaModelo = originalLayaModelo;
  });

  it("devuelve cargar:false para el caso por defecto (web)", () => {
    const plan = planLayaLocal(WEB_PUERTO_PERFIL);
    expect(plan.cargar).toBe(false);
  });
});