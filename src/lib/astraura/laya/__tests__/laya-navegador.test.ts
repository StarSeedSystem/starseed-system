// Pruebas de planLayaLocal (LYS1018H): funciones puras, sin red, sin disco y sin cargar modelos.
// El perfil del medio se fabrica a mano con la forma real de `perfil-medio.ts`.
import { describe, expect, it } from "vitest";
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import type { PerfilHardware } from "@/lib/astraura/perfil-hardware";
import {
  ESTADO_INICIAL_VENDOR,
  planLayaLocal,
  type EstadoVendorLaya,
} from "../laya-navegador";

const CON_VENDOR: EstadoVendorLaya = { vendorDisponible: true, modeloExportado: "int8" };
const MOTIVO_SIN_VENDOR =
  "vendor/laya-ts o modelo exportado (tarea O) aún no disponibles: Laya va por la malla o al A1";

function base(parcial: Partial<PerfilHardware>): PerfilHardware {
  return {
    nivel: "pleno",
    nucleos: 8,
    ramGb: 8,
    arq: "arm64",
    plataforma: "pwa",
    bateria: true,
    conexion: "rapida",
    ...parcial,
  };
}

function perfil(parcial: Partial<PerfilMedio> = {}): PerfilMedio {
  return {
    base: base({}),
    plataforma: "pwa",
    webgpu: { disponible: true, maxBufferMb: 512 },
    wasm: { disponible: true, simd: true, hilos: true },
    almacenamiento: { cuotaMb: 8192, usoMb: 512, libreMb: 8192, persistente: true },
    bateria: { nivel: 1, cargando: false, baja: false },
    ramLibreMb: 4096,
    saveData: false,
    tipoConexion: "4g",
    visible: true,
    ...parcial,
  };
}

describe("planLayaLocal · vendor y modelo exportado", () => {
  it("sin vendor ni modelo exportado (estado inicial) nunca carga en ningún medio", () => {
    for (const plataforma of ["web", "pwa", "tauri", "android", "ios"] as const) {
      const plan = planLayaLocal(perfil({ plataforma }), ESTADO_INICIAL_VENDOR);
      expect(plan).toEqual({ cargar: false, modelo: null, motivo: MOTIVO_SIN_VENDOR });
    }
  });

  it("con vendor pero sin modelo exportado tampoco carga", () => {
    const plan = planLayaLocal(perfil(), {
      vendorDisponible: true,
      modeloExportado: null,
    });
    expect(plan.cargar).toBe(false);
    expect(plan.modelo).toBeNull();
    expect(plan.motivo).toContain("tarea O");
  });

  it("elige multilingual-int8 con exportación int8 y multilingual con fp32", () => {
    expect(planLayaLocal(perfil(), CON_VENDOR).modelo).toBe("multilingual-int8");
    expect(planLayaLocal(perfil(), { vendorDisponible: true, modeloExportado: "fp32" }).modelo).toBe(
      "multilingual",
    );
  });
});

describe("planLayaLocal · visita web", () => {
  it("una visita web nunca carga, va por la malla", () => {
    const plan = planLayaLocal(perfil({ plataforma: "web" }), CON_VENDOR);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "visita web (web): Laya nunca se carga aquí, va por la malla (§4)",
    });
  });
});

describe("planLayaLocal · PWA", () => {
  it("PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM carga", () => {
    const plan = planLayaLocal(perfil(), CON_VENDOR);
    expect(plan).toEqual({
      cargar: true,
      modelo: "multilingual-int8",
      motivo: "PWA con WebGPU, ≥ 2048 MB persistentes y ≥ 4 GB de RAM: carga multilingual-int8 (§4)",
    });
  });

  it("PWA sin WebGPU no carga y lo dice", () => {
    const plan = planLayaLocal(
      perfil({ webgpu: { disponible: false, maxBufferMb: null } }),
      CON_VENDOR,
    );
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("sin WebGPU");
  });

  it("PWA con persistencia o almacenamiento insuficiente no carga", () => {
    const sinPersistir = planLayaLocal(
      perfil({ almacenamiento: { cuotaMb: 8192, usoMb: 512, libreMb: 8192, persistente: false } }),
      CON_VENDOR,
    );
    expect(sinPersistir.cargar).toBe(false);
    expect(sinPersistir.motivo).toContain("persistentes");
    const pocaCuota = planLayaLocal(
      perfil({ almacenamiento: { cuotaMb: 1024, usoMb: 0, libreMb: 1024, persistente: true } }),
      CON_VENDOR,
    );
    expect(pocaCuota.cargar).toBe(false);
  });

  it("PWA con menos de 4 GB de RAM no carga", () => {
    const plan = planLayaLocal(
      perfil({ base: base({ ramGb: 3, nivel: "justo" }) }),
      CON_VENDOR,
    );
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("GB de RAM");
  });
});

describe("planLayaLocal · app nativa", () => {
  it("una app nativa con presupuesto carga el checkpoint exportado", () => {
    const plan = planLayaLocal(
      perfil({ plataforma: "tauri", almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 8192, persistente: true } }),
      CON_VENDOR,
    );
    expect(plan).toEqual({
      cargar: true,
      modelo: "multilingual-int8",
      motivo: "app nativa: multilingual-int8 cabe en su presupuesto (§4)",
    });
  });

  it("una app nativa sin disco libre para el checkpoint fp32 no carga", () => {
    const plan = planLayaLocal(
      perfil({
        plataforma: "android",
        almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 900, persistente: true },
      }),
      { vendorDisponible: true, modeloExportado: "fp32" },
    );
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("no cabe");
  });
});

describe("planLayaLocal · 2.º plano", () => {
  it("pestaña oculta: nada carga", () => {
    const plan = planLayaLocal(perfil({ visible: false }), CON_VENDOR);
    expect(plan).toEqual({
      cargar: false,
      modelo: null,
      motivo: "batería < 20 % o pestaña oculta: no se despierta Laya local (§4)",
    });
  });

  it("batería < 20 % sin cargador: nada carga", () => {
    const plan = planLayaLocal(
      perfil({ bateria: { nivel: 0.15, cargando: false, baja: true } }),
      CON_VENDOR,
    );
    expect(plan.cargar).toBe(false);
    expect(plan.motivo).toContain("batería");
  });

  it("batería baja pero cargando: sí puede cargar", () => {
    const plan = planLayaLocal(
      perfil({ bateria: { nivel: 0.15, cargando: true, baja: true } }),
      CON_VENDOR,
    );
    expect(plan.cargar).toBe(true);
  });
});
