import { describe, it, expect } from "vitest";
import { planLayaLocal } from "../laya-navegador";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

function basePerfil(overrides: Partial<PerfilMedio> = {}): PerfilMedio {
  return {
    base: { plataforma: "web", ramGb: 8, nucleos: 4, arq: "x86_64", nivel: "pleno" as const, bateria: false, conexion: "rapida" as const },
    plataforma: "web",
    webgpu: { disponible: false, maxBufferMb: null },
    wasm: { disponible: false, simd: false, hilos: false },
    almacenamiento: { cuotaMb: null, usoMb: null, libreMb: null, persistente: false },
    bateria: { nivel: 1, cargando: false, baja: false },
    ramLibreMb: null,
    saveData: false,
    tipoConexion: null,
    visible: true,
    ...overrides,
  };
}

describe("planLayaLocal", () => {
  it("visita web devuelve false con motivo malla", () => {
    const p = basePerfil({ plataforma: "web" });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.modelo).toBeNull();
    expect(res.motivo).toContain("visita web");
  });

  it("pestaña oculta (segundo plano) devuelve false", () => {
    const p = basePerfil({ plataforma: "pwa", visible: false });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.motivo).toContain("segundo plano");
  });

  it("batería baja devuelve false", () => {
    const p = basePerfil({
      plataforma: "pwa",
      bateria: { nivel: 0.1, cargando: false, baja: true },
    });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.motivo).toContain("segundo plano");
  });

  it("PWA con requisitos cumple pero modelo no exportado → false", () => {
    const p = basePerfil({
      plataforma: "pwa",
      webgpu: { disponible: true, maxBufferMb: 2048 },
      almacenamiento: { cuotaMb: 3000, usoMb: 0, libreMb: 3000, persistente: true },
      base: { plataforma: "pwa", ramGb: 8, nucleos: 4, arq: "x86_64", nivel: "pleno" as const, bateria: false, conexion: "rapida" as const },
    });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.modelo).toBeNull();
    expect(res.motivo).toContain("tarea O pendiente");
  });

  it("App nativa sin presupuesto devuelve false", () => {
    const p = basePerfil({
      plataforma: "tauri",
      almacenamiento: { cuotaMb: 100, usoMb: 0, libreMb: 100, persistente: true },
      base: { plataforma: "tauri", ramGb: 1, nucleos: 2, arq: "x86_64", nivel: "pleno" as const, bateria: false, conexion: "rapida" as const },
    });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.motivo).toContain("presupuesto suficiente");
  });

  it("Servidor con RAM suficiente pero modelo no exportado → false", () => {
    const p = basePerfil({
      plataforma: "servidor",
      ramLibreMb: 4096,
      base: { plataforma: "web", ramGb: 16, nucleos: 8, arq: "x86_64", nivel: "pleno" as const, bateria: false, conexion: "rapida" as const },
    });
    const res = planLayaLocal(p);
    expect(res.cargar).toBe(false);
    expect(res.motivo).toContain("tarea O pendiente");
  });
});