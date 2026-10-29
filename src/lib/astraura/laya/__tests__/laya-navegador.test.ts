// Pruebas de `planLayaLocal` (LYS1018H): sin red, sin disco, sin modelo cargado.
// Las respuestas de Laya son de ejemplo con la forma real; aquí solo se prueba la decisión pura.
import { describe, expect, it } from "vitest";
import { planLayaLocal, type ResultadoPlanLaya } from "../laya-navegador";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

function basePerfil(partial: Partial<PerfilMedio> = {}): PerfilMedio {
  return {
    base: { nivel: "justo", nucleos: 4, ramGb: 6, arq: "arm64", plataforma: "web", bateria: false, conexion: "rapida" },
    plataforma: "web",
    webgpu: { disponible: false, maxBufferMb: null },
    wasm: { disponible: false, simd: false, hilos: false },
    almacenamiento: { cuotaMb: null, usoMb: null, libreMb: null, persistente: false },
    bateria: { nivel: 0.9, cargando: true, baja: false },
    ramLibreMb: 4096,
    saveData: false,
    tipoConexion: null,
    visible: true,
    ...partial,
  } as PerfilMedio;
}

describe("planLayaLocal · medio", () => {
  it("visita web: nunca carga local (va por la malla)", () => {
    const r = planLayaLocal(basePerfil({ plataforma: "web", base: { nivel: "remoto", nucleos: 2, ramGb: 2, arq: "x86_64", plataforma: "web", bateria: false, conexion: "rapida" } }));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toContain("malla");
  });

  it("PWA con WebGPU, persistente y ≥ 2 GB / ≥ 4 GB: aún no carga por archivo faltante", () => {
    const r = planLayaLocal(basePerfil({
      plataforma: "pwa",
      webgpu: { disponible: true, maxBufferMb: 256 },
      almacenamiento: { cuotaMb: 4096, usoMb: 100, libreMb: 4096, persistente: true },
      base: { nivel: "pleno", nucleos: 8, ramGb: 8, arq: "arm64", plataforma: "pwa", bateria: false, conexion: "rapida" },
    }));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toContain("vendor/laya-ts");
    expect(r.motivo).toContain("PWA");
  });

  it("app nativa (tauri): podría caber, pero archivo faltante", () => {
    const r = planLayaLocal(basePerfil({
      plataforma: "tauri",
      base: { nivel: "pleno", nucleos: 8, ramGb: 16, arq: "arm64", plataforma: "tauri", bateria: false, conexion: "rapida" },
      almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 10240, persistente: true },
    }));
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("app nativa");
    expect(r.motivo).toContain("archivo");
  });

  it("batería < 20 % sin cargar: no carga", () => {
    const r = planLayaLocal(basePerfil({
      plataforma: "tauri",
      bateria: { nivel: 0.1, cargando: false, baja: true },
      base: { nivel: "pleno", nucleos: 8, ramGb: 16, arq: "arm64", plataforma: "tauri", bateria: true, conexion: "rapida" },
    }));
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("batería");
  });

  it("pestaña oculta: no carga", () => {
    const r = planLayaLocal(basePerfil({ visible: false, plataforma: "pwa" }));
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("pestaña oculta");
  });

  it("devuelve siempre `multilingual-int8` | `multilingual` | null; hoy null", () => {
    const r = planLayaLocal(basePerfil());
    expect(["multilingual-int8", "multilingual", null] as unknown[]).toContain(r.modelo);
    expect(r.modelo).toBeNull();
  });

  it("motivo siempre menciona archivo faltante (tarea O pendiente)", () => {
    const casos = [
      basePerfil({ plataforma: "web" }),
      basePerfil({ plataforma: "pwa", webgpu: { disponible: true, maxBufferMb: 512 } }),
      basePerfil({ plataforma: "tauri" }),
    ];
    for (const c of casos) {
      const r = planLayaLocal(c);
      expect(r.motivo).toContain("vendor/laya-ts");
    }
  });
});
