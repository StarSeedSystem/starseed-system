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
import type { DispositivoMallaRow, FichaDispositivo, NeuronaCercanaRow } from "@/lib/network/malla-neuronas";

const ficha = (o: Partial<FichaDispositivo> = {}): FichaDispositivo => ({
  v: 1, syncDeviceId: "s-1", neuronDeviceId: "n-1", nombre: "PC del grupo", tipo: "desktop", plataforma: "linux", versionOS: "1",
  ramClase: "16 GB", backendLocal: false, capas: { local: true, mesh: true, nube: true, colectiva: true }, at: 0, ...o,
});
const dispositivo = (o: Partial<DispositivoMallaRow> = {}): DispositivoMallaRow => ({
  neuronId: "n-1", syncDeviceId: "s-1", nombre: "Mac de casa", plataforma: "macOS", tipo: "desktop", online: true,
  esEsteDispositivo: false, enlace: { estado: "conectado" }, ficha: undefined, ...o,
});

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

  describe("neuronas cercanas (otras cuentas)", () => {
    it("usa mínimos conservadores: sin VRAM, 2 GB libres, sin instalados, no ocupada", () => {
      const c = { plataforma: "macOS" };
      expect(inferirTipoGPUDesdeCercana(c)).toBe("apple");
      expect(inferirVRAMGBDesdeCercana(c)).toBeNull();
      expect(inferirRAMLibreGBDesdeCercana(c)).toBe(2);
      expect(inferirInstaladosDesdeCercana(c)).toEqual([]);
      expect(inferirOcupadaDesdeCercana(c)).toBe(false);
    });

    it("sin GPU solo ofrece sdcpp y onnx-web; con GPU añade comfyui y diffusers", () => {
      expect(inferirMotoresDesdeCercana({ plataforma: "android" })).toEqual(["sdcpp", "onnx-web"]);
      const m = inferirMotoresDesdeCercana({ plataforma: "linux" });
      expect(m).toContain("comfyui");
      expect(m).toContain("diffusers");
    });
  });

  describe("inferirTipoGPUDesdeCercana", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const cerca = { plataforma: "darwin" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("apple");
    });
  });

  describe("inferirRAMLibreGB (fila real del registro)", () => {
    it("la RAM libre es la mitad de la clase de la ficha, sin dividirla otra vez; sin ficha, 2 GB", () => {
      const libre = (ramClase: FichaDispositivo["ramClase"]) => inferirRAMLibreGB(dispositivo({ ficha: ficha({ ramClase }) }));
      expect(libre("≤4 GB")).toBe(2);
      expect(libre("8 GB")).toBe(4);
      expect(libre("16 GB")).toBe(8);
      expect(libre(">16 GB")).toBe(16);
      expect(libre("desconocida")).toBe(2);
      expect(inferirRAMLibreGB(dispositivo())).toBe(2);
    });
  });

  describe("inferirOcupada (fila real del registro)", () => {
    it("una neurona apagada o sin enlace conectado no recibe trabajo; encendida y conectada, sí", () => {
      expect(inferirOcupada(dispositivo())).toBe(false);
      expect(inferirOcupada(dispositivo({ online: false }))).toBe(true);
      for (const estado of ["sin-vinculo", "conectando", "fallido"] as const) {
        expect(inferirOcupada(dispositivo({ enlace: { estado } }))).toBe(true);
      }
    });
  });

  describe("neurona cercana con la forma real del faro (sin plataforma publicada)", () => {
    it("se trata sin GPU: solo sdcpp y onnx-web, sin VRAM y con 2 GB libres", () => {
      const c: NeuronaCercanaRow = { deviceId: "c-1", etiqueta: "Neurona del grupo", detectadaHaceMs: 1200, ofreceInternetPublico: false };
      expect(inferirTipoGPUDesdeCercana(c)).toBe("ninguna");
      expect(inferirMotoresDesdeCercana(c)).toEqual(["sdcpp", "onnx-web"]);
      expect(inferirVRAMGBDesdeCercana(c)).toBeNull();
      expect(inferirRAMLibreGBDesdeCercana(c)).toBe(2);
    });
  });
});
