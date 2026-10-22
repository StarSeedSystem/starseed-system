// src/lib/imagenes/adaptadores/__tests__/malla-imagenes.test.ts
// Tests unitarios para las funciones puras del adaptador de malla de imágenes
// Como estã¡n prohibidos vi.mock y similares, testeamos funciones puras directamente

import { describe, it, expect } from "vitest";
import { 
  inferirTipoGPU,
  inferirVRAMGB,
  inferirRAMLibreGB,
  convertirRamClaseAGB,
  inferirMotores,
  inferirInstalados,
  inferirOcupada,
  inferirTipoGPUDesdeCercana,
  inferirVRAMGBDesdeCercana,
  inferirRAMLibreGBDesdeCercana,
  inferirMotoresDesdeCercana,
  inferirInstaladosDesdeCercana,
  inferirOcupadaDesdeCercana
} from "@/lib/imagenes/adaptadores/malla-imagenes";

describe("malla-imagenes adaptador - funciones puras", () => {
  describe("inferirTipoGPU", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const disp = { plataforma: "darwin" };
      expect(inferirTipoGPU(disp)).toBe("apple");
    });

    it("debe devolver 'apple' para plataforma macOS", () => {
      const disp = { plataforma: "macOS" };
      expect(inferirTipoGPU(disp)).toBe("apple");
    });

    it("debe devolver 'nvidia' para plataforma windows", () => {
      const disp = { plataforma: "windows" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
    });

    it("debe devolver 'nvidia' para plataforma linux", () => {
      const disp = { plataforma: "linux" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
    });

    it("debe devolver 'ninguna' para plataforma desconocida", () => {
      const disp = { plataforma: "desconocida" };
      expect(inferirTipoGPU(disp)).toBe("ninguna");
    });

    it("debe devolver 'ninguna' para plataforma undefined", () => {
      const disp = { plataforma: undefined };
      expect(inferirTipoGPU(disp)).toBe("ninguna");
    });
  });

  describe("convertirRamClaseAGB", () => {
    it("debe convertir '≤4 GB' a 2", () => {
      expect(convertirRamClaseAGB("≤4 GB")).toBe(2);
    });

    it("debe convertir '8 GB' a 4", () => {
      expect(convertirRamClaseAGB("8 GB")).toBe(4);
    });

    it("debe convertir '16 GB' a 8", () => {
      expect(convertirRamClaseAGB("16 GB")).toBe(8);
    });

    it("debe convertir '>16 GB' a 16", () => {
      expect(convertirRamClaseAGB(">16 GB")).toBe(16);
    });

    it("debe devolver 2 para 'desconocida'", () => {
      expect(convertirRamClaseAGB("desconocida")).toBe(2);
    });

    it("debe devolver 2 para undefined", () => {
      expect(convertirRamClaseAGB(undefined as unknown as string)).toBe(2);
    });
  });

  describe("inferirMotores", () => {
    it("debe devolver al menos sdcpp y onnx-web", () => {
      const disp = {};
      const motores = inferirMotores(disp);
      expect(motores).toContain("sdcpp");
      expect(motores).toContain("onnx-web");
    });

    it("debe añadir comfyui y diffusers cuando la GPU no es ninguna", () => {
      const disp = { plataforma: "windows" }; // Esto hará que inferirTipoGPU devuelva nvidia
      const motores = inferirMotores(disp);
      expect(motores).toContain("comfyui");
      expect(motores).toContain("diffusers");
    });

    it("debe devolver exactamente sdcpp y onnx-web cuando no hay GPU", () => {
      const disp = { plataforma: "android" }; // Esto hará que inferirTipoGPU devuelva ninguna
      const motores = inferirMotores(disp);
      expect(motores).toEqual(["sdcpp", "onnx-web"]);
    });
  });

  // Tests similares para las funciones de cercanas...
  describe("inferirTipoGPUDesdeCercana", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const cerca = { plataforma: "darwin" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("apple");
    });
  });

  describe("neurona cercana (mínimos conservadores)", () => {
    it("sin plataforma conocida: sin GPU, 2 GB libres, libre y solo sdcpp/onnx-web", () => {
      const cerca = { plataforma: "android" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("ninguna");
      expect(inferirVRAMGBDesdeCercana(cerca)).toBeNull();
      expect(inferirRAMLibreGBDesdeCercana(cerca)).toBe(2);
      expect(inferirMotoresDesdeCercana(cerca)).toEqual(["sdcpp", "onnx-web"]);
      expect(inferirInstaladosDesdeCercana(cerca)).toEqual([]);
      expect(inferirOcupadaDesdeCercana(cerca)).toBe(false);
    });

    it("linux se supone nvidia y añade comfyui y diffusers", () => {
      const cerca = { plataforma: "linux" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("nvidia");
      expect(inferirMotoresDesdeCercana(cerca)).toEqual(["sdcpp", "comfyui", "diffusers", "onnx-web"]);
    });
  });

  describe("RAM libre y ocupación de un dispositivo propio", () => {
    it("respeta el piso de 1 GB y el valor por defecto sin ficha", () => {
      expect(inferirRAMLibreGB({ ficha: { ramClase: "≤4 GB" } })).toBe(1);
      expect(inferirRAMLibreGB({})).toBe(2);
    });

    it("VRAM desconocida, sin modelos instalados y no ocupada por defecto", () => {
      expect(inferirVRAMGB({})).toBeNull();
      expect(inferirInstalados({})).toEqual([]);
      expect(inferirOcupada({})).toBe(false);
    });
  });
});
