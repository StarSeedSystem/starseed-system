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
import { MOTORES } from "@/lib/imagenes/modelos";

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

    it("debe devolver 'ninguna' para plataforma android (conservador)", () => {
      const disp = { plataforma: "android" };
      expect(inferirTipoGPU(disp)).toBe("ninguna");
    });

    it("debe devolver 'nvidia' para 'Windows 11' (no distingue mayúsculas ni versión)", () => {
      const disp = { plataforma: "Windows 11" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
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

  describe("inferirRAMLibreGB", () => {
    it("debe estimar la RAM libre como la mitad de la clase convertida, con un piso de 1 GB", () => {
      expect(inferirRAMLibreGB({ ficha: { ramClase: "16 GB" } })).toBe(4);
      expect(inferirRAMLibreGB({ ficha: { ramClase: ">16 GB" } })).toBe(8);
      expect(inferirRAMLibreGB({ ficha: { ramClase: "8 GB" } })).toBe(2);
      expect(inferirRAMLibreGB({ ficha: { ramClase: "≤4 GB" } })).toBe(1);
    });

    it("debe usar valores conservadores sin ficha o con clase desconocida", () => {
      expect(inferirRAMLibreGB({})).toBe(2);
      expect(inferirRAMLibreGB({ ficha: { ramClase: "desconocida" } })).toBe(1);
    });
  });

  describe("neurona propia (capa neurona): mínimos conservadores", () => {
    it("debe dejar la VRAM como desconocida (null)", () => {
      expect(inferirVRAMGB({ plataforma: "darwin" })).toBeNull();
    });

    it("debe ofrecer el dispositivo como disponible (ocupada = false)", () => {
      expect(inferirOcupada({ plataforma: "darwin" })).toBe(false);
    });

    it("debe asumir que no hay modelos instalados todavía", () => {
      expect(inferirInstalados({ plataforma: "darwin" })).toEqual([]);
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

  describe("neurona cercana (capa malla): mínimos conservadores", () => {
    it("debe dejar la VRAM como desconocida (null) y la RAM libre en 2 GB", () => {
      const cerca = { plataforma: "linux" };
      expect(inferirVRAMGBDesdeCercana(cerca)).toBeNull();
      expect(inferirRAMLibreGBDesdeCercana(cerca)).toBe(2);
    });

    it("debe ofrecer solo los motores básicos si no se sabe la GPU", () => {
      const cerca = { plataforma: "desconocida" };
      expect(inferirMotoresDesdeCercana(cerca)).toEqual(["sdcpp", "onnx-web"]);
    });

    it("debe añadir comfyui y diffusers cuando la GPU no es ninguna", () => {
      const cerca = { plataforma: "linux" };
      const motores = inferirMotoresDesdeCercana(cerca);
      expect(motores).toContain("comfyui");
      expect(motores).toContain("diffusers");
    });

    it("debe considerarla disponible (ocupada = false) y sin modelos instalados", () => {
      const cerca = { plataforma: "linux" };
      expect(inferirOcupadaDesdeCercana(cerca)).toBe(false);
      expect(inferirInstaladosDesdeCercana(cerca)).toEqual([]);
    });
  });

  describe("modo RPC de stable-diffusion.cpp", () => {
    it("el catálogo lo declara experimental y SIN autenticación: apagado por defecto", () => {
      const nota = MOTORES.sdcpp.nota ?? "";
      expect(nota).toMatch(/RPC/);
      expect(nota).toMatch(/experimental/i);
      expect(nota).toMatch(/SIN autenticación/i);
    });
  });

  // Podemos añadir más tests según sea necesario
});
