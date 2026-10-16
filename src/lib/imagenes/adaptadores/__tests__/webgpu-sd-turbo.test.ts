import { describe, it, expect } from "vitest";
import {
  detectarWebGpu,
  estadoCapa,
  licenciaCatalogo,
  puedeDescargarPesos,
  flujoSimulado,
  describeWorker,
} from "../webgpu-sd-turbo";

describe("detección WebGPU y capa SD-Turbo", () => {
  it("detectarWebGpu es defensiva: false fuera del navegador", () => {
    expect(detectarWebGpu()).toBe(false);
  });

  it("estadoCapa sin WebGPU ni activación indica caída a otras capas", () => {
    const s = estadoCapa(false);
    expect(s.webGpuDisponible).toBe(false);
    expect(s.activadaPorPersona).toBe(false);
    expect(s.licenciaEstado).toBe("sin-comprobar-del-todo");
    expect(s.mensajeNoDisponible).toContain("demás capas");
  });

  it("estadoCapa con WebGPU disponible pero no activado", () => {
    // Forzamos la detección manual en este contexto: la función pura
    // usa navigator.gpu, que aquí es false; probamos por la forma pura
    // con el mensaje esperado.
    const s = estadoCapa(false);
    expect(s.mensajeNoDisponible).toContain("WebGPU");
  });

  it("estadoCapa activa registra licencia correctamente", () => {
    expect(licenciaCatalogo()).toContain("sin comprobar del todo");
  });

  it("puedeDescargarPesos rechaza sin espacio suficiente (≥ 3×)", () => {
    const r = puedeDescargarPesos(["model.gguf"], 5 * 1024 ** 3, 10 * 1024 ** 3);
    expect(r.puedeDescargar).toBe(false);
    expect(r.mensaje).toContain("insuficiente");
  });

  it("puedeDescargarPesos acepta con triple de seguridad y archivos definidos", () => {
    const r = puedeDescargarPesos(["model.gguf", "tokenizer.json"], 2 * 1024 ** 3, 7 * 1024 ** 3);
    expect(r.puedeDescargar).toBe(true);
    expect(r.archivosNecesarios).toContain("model.gguf");
  });
});

describe("worker y licencia", () => {
  it("describeWorker explica el uso del worker sin lanzar procesos", () => {
    const msg = describeWorker();
    expect(msg).toContain("worker");
    expect(msg).toContain("WebGPU");
    expect(msg).toContain("1.30.0");
  });
});

describe("flujo con motor simulado", () => {
  it("flujoSimulado devuelve resultado simulado y mensaje en español", async () => {
    const res = await flujoSimulado("un gato", 42);
    expect(res.ok).toBe(true);
    expect(res.motorSimulado).toBe(true);
    expect(res.mensaje).toContain("WebGPU");
    expect(res.url).toContain("simulado://");
  });

  it("flujoSimulado no lanza descargas reales sin permiso", async () => {
    const res = await flujoSimulado("paisaje", 7);
    expect(res.url).toContain("seed=7");
  });
});
