// src/lib/imagenes/adaptadores/__tests__/malla-imagenes.test.ts
// Pruebas de las funciones PURAS del adaptador malla → NeuronaImg.
// Sin red, sin disco, sin vi.mock de módulos de Node (prohibido en este repo).

import { describe, it, expect } from "vitest";
import {
  gpuDesdePlataforma,
  ramLibreDesdeClase,
  motoresParaGpu,
  neuronaImgDeDispositivo,
  neuronaImgDeCercana,
  topeUsoAlcanzado,
  votacionAprueba,
  rpcSdcppDisponible,
  RPC_SDCPP_MALLA,
} from "@/lib/imagenes/adaptadores/malla-imagenes";
import type { DispositivoMallaRow, NeuronaCercanaRow } from "@/lib/network/malla-neuronas";

const dispositivo = (parcial: Partial<DispositivoMallaRow>): DispositivoMallaRow => ({
  neuronId: "n-1",
  nombre: "MacBook de Alex",
  plataforma: "darwin",
  tipo: "desktop",
  online: true,
  esEsteDispositivo: false,
  enlace: { estado: "conectado" },
  ...parcial,
});

const cercana = (parcial: Partial<NeuronaCercanaRow>): NeuronaCercanaRow => ({
  deviceId: "c-1",
  etiqueta: "Neurona del grupo",
  detectadaHaceMs: 1000,
  ofreceInternetPublico: false,
  ...parcial,
});

describe("gpuDesdePlataforma", () => {
  it("darwin/mac → apple", () => {
    expect(gpuDesdePlataforma("darwin")).toBe("apple");
    expect(gpuDesdePlataforma("macOS")).toBe("apple");
  });
  it("windows/linux → nvidia (supuesto conservador documentado)", () => {
    expect(gpuDesdePlataforma("Windows 11")).toBe("nvidia");
    expect(gpuDesdePlataforma("linux")).toBe("nvidia");
  });
  it("desconocida o ausente → ninguna", () => {
    expect(gpuDesdePlataforma("android")).toBe("ninguna");
    expect(gpuDesdePlataforma(undefined)).toBe("ninguna");
  });
});

describe("ramLibreDesdeClase", () => {
  it("estima la mitad de la clase declarada, con piso de 1 GB", () => {
    expect(ramLibreDesdeClase("8 GB")).toBe(4);
    expect(ramLibreDesdeClase("16 GB")).toBe(8);
    expect(ramLibreDesdeClase("≤4 GB")).toBe(2);
    expect(ramLibreDesdeClase(">16 GB")).toBe(16);
    expect(ramLibreDesdeClase("desconocida")).toBe(2);
    expect(ramLibreDesdeClase(undefined)).toBe(2);
  });
});

describe("motoresParaGpu", () => {
  it("sin GPU solo ofrece sdcpp y onnx-web", () => {
    expect(motoresParaGpu("ninguna")).toEqual(["sdcpp", "onnx-web"]);
  });
  it("con GPU añade comfyui y diffusers", () => {
    const m = motoresParaGpu("nvidia");
    expect(m).toContain("comfyui");
    expect(m).toContain("diffusers");
  });
});

describe("neuronaImgDeDispositivo", () => {
  it("convierte un dispositivo propio a capa «neurona»", () => {
    const n = neuronaImgDeDispositivo(dispositivo({ ficha: undefined }));
    expect(n.id).toBe("n-1");
    expect(n.capa).toBe("neurona");
    expect(n.gpu).toBe("apple");
    expect(n.vramGB).toBeNull();
    expect(n.ocupada).toBe(false);
  });
  it("marca ocupada si está offline o sin enlace conectado", () => {
    expect(neuronaImgDeDispositivo(dispositivo({ online: false })).ocupada).toBe(true);
    expect(
      neuronaImgDeDispositivo(dispositivo({ enlace: { estado: "sin-vinculo" } })).ocupada,
    ).toBe(true);
  });
  it("usa la ficha cuando existe (plataforma y RAM declaradas)", () => {
    const n = neuronaImgDeDispositivo(
      dispositivo({
        plataforma: "desconocida",
        ficha: {
          v: 1,
          syncDeviceId: "s",
          neuronDeviceId: "n-1",
          nombre: "PC del grupo",
          tipo: "desktop",
          plataforma: "linux",
          versionOS: "1",
          ramClase: "16 GB",
          backendLocal: false,
          capas: { local: true, mesh: true, nube: true, colectiva: true },
          at: 0,
        },
      }),
    );
    expect(n.gpu).toBe("nvidia");
    expect(n.ramLibreGB).toBe(8);
  });
});

describe("neuronaImgDeCercana", () => {
  it("convierte una neurona cercana a capa «malla» con mínimos conservadores", () => {
    const n = neuronaImgDeCercana(cercana({}));
    expect(n.id).toBe("c-1");
    expect(n.capa).toBe("malla");
    expect(n.gpu).toBe("ninguna");
    expect(n.ocupada).toBe(false);
  });
});

describe("gobierno y topes de la malla", () => {
  it("el tope diario frena el uso por persona (0 = sin límite declarado usa regla del llamador)", () => {
    expect(topeUsoAlcanzado(9, 10)).toBe(false);
    expect(topeUsoAlcanzado(10, 10)).toBe(true);
    expect(topeUsoAlcanzado(5, -1)).toBe(false);
  });
  it("ofrecer la GPU al grupo se decide por votación con mayoría simple", () => {
    expect(votacionAprueba(3, 4)).toBe(true);
    expect(votacionAprueba(2, 4)).toBe(false);
    expect(votacionAprueba(0, 0)).toBe(false);
  });
  it("el modo RPC de stable-diffusion.cpp queda APAGADO (experimental, sin auth)", () => {
    expect(RPC_SDCPP_MALLA.activo).toBe(false);
    expect(rpcSdcppDisponible()).toBe(false);
    expect(RPC_SDCPP_MALLA.motivo).toContain("autenticación");
  });
});
