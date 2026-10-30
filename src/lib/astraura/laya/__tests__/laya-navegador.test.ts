// Tests de Laya en navegador y apps (tarea H de la Ola 1018L · LYS1018H, parte 2):
// solo la decisión pura `planLayaLocal(perfilMedio)` de capas-autoadaptables.md §4.
// Sin red, sin disco real, sin modelos: entradas de ejemplo con la forma real del perfil.
import { describe, it, expect } from "vitest";
import { planLayaLocal } from "../navegador-laya";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

/** Perfil de PWA bien servida: WebGPU, 2 GB persistentes, 8 GB de RAM y primer plano. */
const perfil = (cambios: Partial<PerfilMedio>): PerfilMedio => ({
  base: {
    nivel: "justo",
    nucleos: 4,
    ramGb: 8,
    arq: "arm64",
    plataforma: "web",
    bateria: false,
    conexion: "rapida",
  },
  plataforma: "pwa",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 4096, usoMb: 256, libreMb: 2048, persistente: true },
  bateria: { nivel: 0.8, cargando: false, baja: false },
  ramLibreMb: 4096,
  saveData: false,
  tipoConexion: "4g",
  visible: true,
  ...cambios,
});

describe("planLayaLocal · quién puede cargar Laya (§4 de capas-autoadaptables)", () => {
  it("devuelve siempre un veredicto con motivo y modelo acotado", () => {
    const r = planLayaLocal(perfil({}));
    expect(typeof r.motivo).toBe("string");
    expect(r.motivo.length).toBeGreaterThan(0);
    expect(["multilingual-int8", "multilingual", null]).toContain(r.modelo);
  });

  it("una visita web nunca lo carga: va por la malla", () => {
    const r = planLayaLocal(perfil({ plataforma: "web" }));
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("una PWA sin WebGPU se pregunta fuera", () => {
    const r = planLayaLocal(
      perfil({ webgpu: { disponible: false, maxBufferMb: null } }),
    );
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("una PWA sin almacenamiento persistente no lo carga", () => {
    const r = planLayaLocal(
      perfil({
        almacenamiento: { cuotaMb: 4096, usoMb: 256, libreMb: 2048, persistente: false },
      }),
    );
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("con menos de 2 GB de almacenamiento persistente tampoco", () => {
    const r = planLayaLocal(
      perfil({
        almacenamiento: { cuotaMb: 4095, usoMb: 256, libreMb: 2047, persistente: true },
      }),
    );
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("con menos de 4 GB de memoria tampoco (cuenta RAM del equipo y CLR libre)", () => {
    const r = planLayaLocal({
      ...perfil({}),
      base: { ...perfil({}).base, ramGb: 3 },
      ramLibreMb: 3071,
    });
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });
});

describe("planLayaLocal · medio capaz y novedades del entorno", () => {
  /** Motivo del freno mientras no existan `vendor/laya-ts` ni el modelo exportado (tarea O). */
  const frenoPendiente = /laya-ts|vendor|exportado|tarea O|pendiente|aún no/i;

  it("una PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM es medio capaz, pero aún se pregunta fuera: falta laya-ts y el modelo exportado", () => {
    const r = planLayaLocal(perfil({}));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("el límite es inclusivo: 2 GB y 4 GB justos siguen siendo medio capaz", () => {
    const r = planLayaLocal({
      ...perfil({}),
      base: { ...perfil({}).base, ramGb: 4 },
      ramLibreMb: 4096,
    });
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("una app nativa que cabe en su presupuesto sería medio capaz, con el mismo freno pendiente", () => {
    const r = planLayaLocal(
      perfil({
        plataforma: "tauri",
        base: { ...perfil({}).base, plataforma: "tauri" },
        almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 32768, persistente: true },
      }),
    );
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("una app nativa sin espacio para el modelo se pregunta fuera", () => {
    const r = planLayaLocal(
      perfil({
        plataforma: "tauri",
        base: { ...perfil({}).base, plataforma: "tauri" },
        almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 1024, persistente: true },
      }),
    );
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("con batería < 20 % y sin cargador no se despierta", () => {
    const r = planLayaLocal(
      perfil({ bateria: { nivel: 0.15, cargando: false, baja: true } }),
    );
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });

  it("cargando no es batería baja: con 15 % y cable no aplica el freno de batería", () => {
    const r = planLayaLocal(
      perfil({ bateria: { nivel: 0.15, cargando: true, baja: false } }),
    );
    expect(r.cargar).toBe(false); // sigue el freno pendiente de laya-ts
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("con la pestaña oculta no se despierta, aunque el medio sea capaz", () => {
    const r = planLayaLocal(perfil({ visible: false }));
    expect(r).toEqual({ cargar: false, modelo: null, motivo: expect.any(String) });
  });
});
