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

    it("debe devolver 'nvidia' para plataforma windows", () => {
      const disp = { plataforma: "windows" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
    });

    it("debe devolver 'ninguna' para plataforma desconocida", () => {
      const disp = { plataforma: "desconocida" };
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
  });

  // Tests similares para las funciones de cercanas...
  describe("inferirTipoGPUDesdeCercana", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const cerca = { plataforma: "darwin" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("apple");
    });
  });

  // Podemos añadir más tests según sea necesario
});
