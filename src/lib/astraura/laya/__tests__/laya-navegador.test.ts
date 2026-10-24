// Tests del plan de Laya en navegador y apps (LYS1018H): una fila por regla de §4 del contrato
// `architecture/laya-y-habilidades.md`. Sin red, sin disco y sin cargar ningún modelo.
import { describe, expect, it } from "vitest";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import {
  PESO_FP32_MB,
  PESO_INT8_MB,
  planLayaLocal,
} from "@/lib/astraura/laya/laya-navegador";

const GB = 1024;

function perfil(cambios: Partial<PerfilMedio> = {}): PerfilMedio {
  return {
    base: {
      nivel: "alto",
      nucleos: 8,
      ramGb: 8,
      arq: "arm64",
      plataforma: "pwa",
      bateria: true,
      conexion: "rapida",
    },
    plataforma: "pwa",
    webgpu: { disponible: true, maxBufferMb: 256 },
    wasm: { disponible: true, simd: true, hilos: true },
    almacenamiento: { cuotaMb: 8192, usoMb: 1024, libreMb: 6144, persistente: true },
    bateria: { nivel: 0.9, cargando: false, baja: false },
    ramLibreMb: 4096,
    saveData: false,
    tipoConexion: "4g",
    visible: true,
    ...cambios,
  };
}

const listos = { artefactosListos: true };

describe("planLayaLocal · artefactos", () => {
  it("no carga mientras falten vendor/laya-ts y el checkpoint exportado (tarea O)", () => {
    const plan = planLayaLocal(perfil());
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toContain("tarea O");
  });

  it("tampoco carga en una PWA completa si faltan los artefactos", () => {
    expect(planLayaLocal(perfil(), { artefactosListos: false }).cargar).toBe(false);
  });
});

describe("planLayaLocal · visita web", () => {
  it("una visita web nunca carga Laya: va por la malla", () => {
    const plan = planLayaLocal(perfil({ plataforma: "web" }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toContain("malla");
  });
});

describe("planLayaLocal · PWA", () => {
  it("carga multilingual-int8 con WebGPU, 2 GB persistentes y 4 GB de RAM", () => {
    const plan = planLayaLocal(perfil(), listos);
    expect(plan).toEqual({ cargar: true, modelo: "multilingual-int8", motivo: expect.stringContaining("PWA") });
  });

  it("no carga sin WebGPU", () => {
    const plan = planLayaLocal(perfil({ webgpu: { disponible: false, maxBufferMb: null } }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("WebGPU");
  });

  it("no carga si el almacenamiento no es persistente", () => {
    const plan = planLayaLocal(perfil({ almacenamiento: { cuotaMb: 8192, usoMb: 1024, libreMb: 6144, persistente: false } }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("persistente");
  });

  it("no carga con menos de 2 GB libres", () => {
    const plan = planLayaLocal(perfil({ almacenamiento: { cuotaMb: 3000, usoMb: 1500, libreMb: 1500, persistente: true } }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("2 GB");
  });

  it("no carga con menos de 4 GB de memoria", () => {
    const plan = planLayaLocal(perfil({ base: { ...perfil().base, ramGb: 2 } }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("4 GB");
  });

  it("usa el checkpoint fp32 si no hay export int8", () => {
    const plan = planLayaLocal(perfil(), { artefactosListos: true, int8Disponible: false });
    expect(plan.cargar).toBe(true);
    expect(plan.modelo).toBe("multilingual");
  });
});

describe("planLayaLocal · segundo plano y batería", () => {
  it("no carga con batería por debajo del 20 %", () => {
    const plan = planLayaLocal(perfil({ bateria: { nivel: 0.15, cargando: false, baja: true } }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("batería");
  });

  it("no carga con la pestaña oculta", () => {
    const plan = planLayaLocal(perfil({ visible: false }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("oculta");
  });

  it("no carga con saveData activo", () => {
    const plan = planLayaLocal(perfil({ saveData: true }), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("saveData");
  });
});

describe("planLayaLocal · app nativa", () => {
  const tauri = (libreMb: number, ramGb = 8): PerfilMedio => {
    const p = perfil();
    return {
      ...p,
      plataforma: "tauri",
      base: { ...p.base, plataforma: "tauri", ramGb },
      almacenamiento: { cuotaMb: libreMb, usoMb: 0, libreMb, persistente: true },
    };
  };

  it("carga int8 si cabe en el presupuesto de una app nativa", () => {
    const plan = planLayaLocal(tauri(64 * GB), listos);
    expect(plan.cargar).toBe(true);
    expect(plan.modelo).toBe("multilingual-int8");
    expect(plan.motivo).toContain("nativa");
  });

  it("no carga si el disco del presupuesto no alcanza", () => {
    const plan = planLayaLocal(tauri(PESO_INT8_MB / 0.15 - 100), listos);
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("disco");
  });

  it("no carga si la memoria del presupuesto no alcanza para el fp32", () => {
    const plan = planLayaLocal(tauri(64 * GB, 2), { artefactosListos: true, int8Disponible: false });
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("memoria");
  });

  it("el fp32 sí cabe con memoria de sobra", () => {
    const plan = planLayaLocal(tauri(64 * GB, 8), { artefactosListos: true, int8Disponible: false });
    expect(plan.cargar).toBe(true);
    expect(plan.modelo).toBe("multilingual");
    expect(PESO_FP32_MB).toBeGreaterThan(PESO_INT8_MB);
  });

  it("no carga sin WebGPU ni WASM", () => {
    const p = tauri(64 * GB);
    const plan = planLayaLocal(
      { ...p, webgpu: { disponible: false, maxBufferMb: null }, wasm: { disponible: false, simd: false, hilos: false } },
      listos,
    );
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("WASM");
  });
});
