/**
 * Pruebas del adaptador de Spaces públicos de Hugging Face (IMG1011 · capa «espacio»).
 * Sin red: los Spaces se simulan con `fetch` inyectable.
 */
import { describe, it, expect } from "vitest";
import {
  ESPACIOS_ACTIVOS,
  esEspacioActivo,
  infoEspacio,
  ejecutarEspacio,
  type ResultadoEspacio,
} from "../espacios-imagen";
import type { ModeloImagen } from "../../modelos";
import type { OpcionImagen } from "../../plan";

const modeloFlux: ModeloImagen = {
  id: "flux1-schnell",
  nombre: "FLUX.1 [schnell]",
  gama: "media",
  vramGB: 12,
  ramGB: 16,
  motores: ["sdcpp", "comfyui", "diffusers", "a1111-forge"],
  licencia: "Apache-2.0",
  uso: "libre",
  gated: true,
  pasos: 4,
  resolucion: 1024,
  capacidades: ["texto-a-imagen", "texto-legible", "rapido"],
  hf: "black-forest-labs/FLUX.1-schnell",
  espacio: "black-forest-labs/FLUX.1-schnell",
};

const modeloQwen: ModeloImagen = {
  id: "qwen-image",
  nombre: "Qwen-Image",
  gama: "alta",
  vramGB: 24,
  ramGB: 32,
  motores: ["sdcpp", "comfyui", "diffusers"],
  licencia: "Apache-2.0",
  uso: "libre",
  gated: false,
  pasos: 30,
  resolucion: 1024,
  capacidades: ["texto-a-imagen", "texto-legible"],
  hf: "Qwen/Qwen-Image",
  codigo: "https://github.com/QwenLM/Qwen-Image",
  espacio: "Qwen/Qwen-Image",
};

describe("espacios-imagen — adaptador de Spaces públicos", () => {
  it("ESPACTIVOS solo tiene FLUX.1 schnell y Qwen-Image", () => {
    expect(ESPACIOS_ACTIVOS["black-forest-labs/FLUX.1-schnell"]).toContain("Apache-2.0");
    expect(ESPACIOS_ACTIVOS["Qwen/Qwen-Image"]).toContain("Apache-2.0");
  });

  it("esEspacioActivo rechaza el Space de Qwen-Image 2.1 y espacios desconocidos", () => {
    expect(esEspacioActivo("Qwen/Qwen-Image-2.1")).toBe(false);
    expect(esEspacioActivo("no-existe")).toBe(false);
  });

  it("esEspacioActivo acepta los dos Spaces verificados", () => {
    expect(esEspacioActivo("black-forest-labs/FLUX.1-schnell")).toBe(true);
    expect(esEspacioActivo("Qwen/Qwen-Image")).toBe(true);
  });

  describe("infoEspacio", () => {
    it("devuelve licencia Apache-2.0 y el mensaje 'hecho en un Space público'", () => {
      const info = infoEspacio("black-forest-labs/FLUX.1-schnell", modeloFlux);
      expect(info.licencia).toBe("Apache-2.0");
      expect(info.hechoEnSpace).toContain("hecho en su Space público");
      expect(info.modelo).toBe(modeloFlux);
    });

    it("devuelve texto genérico si el id no está en ESPACIOS_ACTIVOS", () => {
      const info = infoEspacio("desconocido", null);
      expect(info.licencia).toBe("Apache-2.0");
      expect(info.hechoEnSpace).toContain("desconocido");
    });
  });

  describe("ejecutarEspacio — sin red (simulado)", () => {
    it("devuelve null si no hay modelo con espacio", async () => {
      const op = { capa: "espacio" as const, modelo: null, motor: "espacio-hf" as const, cuantizacion: "nativa" as const, semilla: 1, motivo: "prueba" };
      const r = await ejecutarEspacio(op, "un gato azul");
      expect(r).toBeNull();
    });

    it("devuelve null para un espacio no activo (Qwen-Image 2.1)", async () => {
      const op = { capa: "espacio" as const, modelo: { ...modeloFlux, espacio: "Qwen/Qwen-Image-2.1" }, motor: "espacio-hf" as const, cuantizacion: "nativa" as const, semilla: 1, motivo: "prueba" };
      const r = await ejecutarEspacio(op as OpcionImagen, "texto");
      expect(r).toBeNull();
    });

    it("simula una respuesta exitosa con fetch inyectable", async () => {
      const fetchSimulado = async () => new Response("https://huggingface.co/spaces/result/example.png", { status: 200, headers: { "content-type": "text/plain" } });
      const op = { capa: "espacio" as const, modelo: modeloFlux, motor: "espacio-hf" as const, cuantizacion: "nativa" as const, semilla: 42, motivo: "Space público" };
      const r = await ejecutarEspacio(op as OpcionImagen, "paisaje futurista", fetchSimulado as typeof fetch);
      expect(r).not.toBeNull();
      expect(r!.url).toBe("https://huggingface.co/spaces/result/example.png");
      expect(r!.licencia).toBe("Apache-2.0");
      expect(r!.hechoEnSpace).toContain("hecho en su Space público");
      expect(r!.segundos).toBeGreaterThanOrEqual(0);
    });

    it("simula un Space dormido (404) y devuelve null", async () => {
      const fetchDormido = async () => new Response("Not Found", { status: 404 });
      const op = { capa: "espacio" as const, modelo: modeloQwen, motor: "espacio-hf" as const, cuantizacion: "nativa" as const, semilla: 7, motivo: "Space público" };
      const r = await ejecutarEspacio(op as OpcionImagen, "texto", fetchDormido as typeof fetch);
      expect(r).toBeNull();
    });

    it("pasa la semilla al Space si está definida", async () => {
      let capturada: string | null = null;
      const fetchEspia = async (url: string) => {
        capturada = url;
        return new Response("https://example.com/img.png", { status: 200 });
      };
      const op = { capa: "espacio" as const, modelo: modeloFlux, motor: "espacio-hf" as const, cuantizacion: "nativa" as const, semilla: 99, motivo: "Space público" };
      await ejecutarEspacio(op as OpcionImagen, "texto", fetchEspia as typeof fetch);
      expect(capturada).toContain("seed=99");
    });
  });

  describe("honestidad del contrato", () => {
    it("Qwen-Image 2.1 no está en ESPACIOS_ACTIVOS (no se usa)", () => {
      expect(esEspacioActivo("Qwen/Qwen-Image-2.1")).toBe(false);
    });
  });
});
