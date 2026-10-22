import { describe, it, expect } from "vitest";
import {
  VERSION_ONNXRUNTIME_WEB,
  LICENCIA_SD_TURBO,
  sondearWebGPU,
  mensajeSinWebGPU,
  mensajePermisoDescarga,
  mensajeEspacioInsuficiente,
  SDTurboEngine,
  flujoPestana,
} from "./webgpu-sd-turbo.worker";

describe("webgpu-sd-turbo.worker", () => {
  it("versión de onnxruntime-web es la exacta del contrato", () => {
    expect(VERSION_ONNXRUNTIME_WEB).toBe("1.30.0");
  });

  it("licencia de SD-Turbo está registrada como sin comprobar del todo", () => {
    expect(LICENCIA_SD_TURBO).toContain("sin comprobar del todo");
  });

  it("mensaje sin WebGPU explica por qué no se descarga nada", () => {
    expect(mensajeSinWebGPU()).toContain("Se usan las demás capas");
  });

  it("mensaje de permiso indica que nada se descarga sin permiso", () => {
    expect(mensajePermisoDescarga(2512525333)).toContain("Nada se descarga sin permiso");
  });

  it("mensaje de espacio insuficiente compara libre y necesario", () => {
    expect(mensajeEspacioInsuficiente(7537675449, 1024000000)).toContain("solo hay");
  });

  it("sondearWebGPU devuelve un objeto con tres booleanos sin lanzar", async () => {
    const r = await sondearWebGPU();
    expect(typeof r.hayWebGPU).toBe("boolean");
    expect(typeof r.hayAdaptador).toBe("boolean");
    expect(typeof r.f16).toBe("boolean");
  });

  it("SDTurboEngine expone los métodos del contrato", async () => {
    const motor = new SDTurboEngine();
    expect(typeof motor.sondear).toBe("function");
    expect(typeof motor.hayPesosEnCache).toBe("function");
    expect(typeof motor.cuotaLibre).toBe("function");
    expect(typeof motor.descargarPesos).toBe("function");
    expect(typeof motor.generar).toBe("function");
  });

  it("flujoPestana con WebGPU falso rechaza y no descarga ni genera", async () => {
    const motor = new SDTurboEngine();
    const res = await flujoPestana({ prompt: "prueba", semilla: 1, permisoDescarga: false }, motor);
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("Sin WebGPU");
    expect(res.imagen).toBeUndefined();
  });
});
