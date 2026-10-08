import { describe, it, expect } from "vitest";
import { medirPerfilMedio, presupuestoMedio } from "../../perfil-medio";

describe("medirPerfilMedio", () => {
  it("detecta WebGPU y WASM flags", () => {
    const perfil = medirPerfilMedio({
      hardwareConcurrency: 4,
      deviceMemory: 8,
      userAgent: "Mozilla",
      esTauri: false,
      esPWA: false,
      webgpu: true,
      webgpuMaxBufferSize: 65536,
      wasmSimd: true,
      wasmThreads: true,
      persist: true,
      storageEstimate: { quota: 1000000, usage: 200000 },
      visible: true,
    });
    expect(perfil.webgpu).toBe(true);
    expect(perfil.maxBufferSize).toBe(65536);
    expect(perfil.wasmSimd).toBe(true);
    expect(perfil.persist).toBe(true);
  });
});

describe("presupuestoMedio", () => {
  const base: PerfilHardware = { nivel: "pleno", nucleos: 4, ramGb: 8, arq: "x86_64", plataforma: "web", bateria: false, conexion: "rapida" };
  it("web budget", () => {
    const p = presupuestoMedio(base);
    expect(p.disco_mb).toBe(12);
    // no additional capa property for this test
  });
});
