/**
 * Pruebas del adaptador SD-Turbo con WebGPU (IMG1011H, parte 1 de 3).
 * Solo funciones puras, sin red ni GPU real. El motor está simulado.
 */
import { describe, it, expect } from "vitest";
import {
  detectarWebGPU,
  simularCargaMotorSDTurbo,
  simularDescargaPesos,
  flujoWebGPUSD,
  LICENCIA_SD_TURBO,
  ESTADO_LICENCIA_SD_TURBO,
  PESOS_SD_TURBO_BYTES_ESTIMADOS,
} from "../webgpu-sd-turbo";
import type { EstadoWebGPU, OpcionesWebGPUSD } from "../webgpu-sd-turbo";

describe("detección de WebGPU (simulada)", () => {
  it("sin navigator.gpu declara que no está disponible", () => {
    // En el entorno de tests, navigator.gpu puede no existir.
    const r = detectarWebGPU();
    expect(typeof r.mensaje).toBe("string");
    expect(typeof r.disponible).toBe("boolean");
    if (!r.disponible) {
      expect(r.mensaje).toMatch(/no está disponible/);
    }
  });

  it("cuando está disponible, reporta WebGPU y ofrece mensaje en español", () => {
    const r = detectarWebGPU();
    if (r.disponible) {
      expect(r.mensaje).toMatch(/WebGPU detectado/);
      expect(r.adaptador).toBeDefined();
    }
  });
});

describe("licencia registrada (catálogo §1)", () => {
  it("SD-Turbo lleva licencia sin comprobar del todo", () => {
    expect(LICENCIA_SD_TURBO).toContain("Stability AI");
    expect(ESTADO_LICENCIA_SD_TURBO).toBe("sin comprobar del todo");
  });
});

describe("simulación del motor SD-Turbo", () => {
  const opcionesActivas: OpcionesWebGPUSD = { activado: true, permitirDescargaPesos: true };
  const opcionesInactivas: OpcionesWebGPUSD = { activado: false, permitirDescargaPesos: false };

  it("sin WebGPU, el motor no carga", () => {
    const webgpu: EstadoWebGPU = { disponible: false, mensaje: "Sin WebGPU" };
    const r = simularCargaMotorSDTurbo(opcionesActivas, webgpu);
    expect(r.cargado).toBe(false);
    expect(r.mensaje).toContain("No hay WebGPU");
  });

  it("con WebGPU pero sin activación por la persona, no carga", () => {
    const webgpu: EstadoWebGPU = { disponible: true, mensaje: "Con WebGPU" };
    const r = simularCargaMotorSDTurbo(opcionesInactivas, webgpu);
    expect(r.cargado).toBe(false);
    expect(r.mensaje).toContain("no está activado");
  });

  it("con WebGPU activado pero sin permiso de descarga, no carga y avisa del tamaño", () => {
    const webgpu: EstadoWebGPU = { disponible: true, mensaje: "Con WebGPU" };
    const sinPermiso = { activado: true, permitirDescargaPesos: false };
    const r = simularCargaMotorSDTurbo(sinPermiso, webgpu);
    expect(r.cargado).toBe(false);
    expect(r.mensaje).toContain("Falta permiso");
    expect(r.bytesEstimados).toBe(PESOS_SD_TURBO_BYTES_ESTIMADOS);
  });

  it("con WebGPU activado y permiso de descarga, carga y marca pesos en caché", () => {
    const webgpu: EstadoWebGPU = { disponible: true, mensaje: "Con WebGPU" };
    const r = simularCargaMotorSDTurbo(opcionesActivas, webgpu);
    expect(r.cargado).toBe(true);
    expect(r.pesosEnCache).toBe(true);
    expect(r.bytesEstimados).toBe(PESOS_SD_TURBO_BYTES_ESTIMADOS);
    expect(r.mensaje).toContain("onnxruntime-web");
  });
});

describe("simulación de descarga de pesos", () => {
  it("sin permiso no descarga nada automáticamente", () => {
    const r = simularDescargaPesos({ activado: true, permitirDescargaPesos: false });
    expect(r.descargado).toBe(false);
    expect(r.bytesDescargados).toBe(0);
    expect(r.mensaje).toContain("Sin permiso");
  });

  it("sin activación no solicita descarga", () => {
    const r = simularDescargaPesos({ activado: false, permitirDescargaPesos: true });
    expect(r.descargado).toBe(false);
    expect(r.mensaje).toContain("no está activado");
  });

  it("con permiso y activación simula descarga a caché (sin red)", () => {
    const r = simularDescargaPesos({ activado: true, permitirDescargaPesos: true });
    expect(r.descargado).toBe(true);
    expect(r.bytesDescargados).toBe(PESOS_SD_TURBO_BYTES_ESTIMADOS);
    expect(r.mensaje).toMatch(/caché del navegador/);
  });
});

describe("flujo completo WebGPU + SD-Turbo", () => {
  it("flujo con todo activo recomienda navegador y menciona licencia", () => {
    const r = flujoWebGPUSD({ activado: true, permitirDescargaPesos: true });
    expect(typeof r.mensajeFinal).toBe("string");
    expect(r.mensajeFinal).toContain(ESTADO_LICENCIA_SD_TURBO);
    // Si WebGPU está disponible, recomienda navegador o neurona según carga.
    expect(["navegador", "neurona", "malla"]).toContain(r.capaRecomendada);
  });

  it("flujo con inactividad delega y menciona licencia", () => {
    const r = flujoWebGPUSD({ activado: false, permitirDescargaPesos: false });
    expect(r.mensajeFinal).toContain(ESTADO_LICENCIA_SD_TURBO);
  });
});
