import { describe, expect, it } from "vitest";
import { NODOS_NUCLEO, textoAImagen, type GrafoComfyUI } from "@/lib/imagenes/flujos-comfyui";
import { formatoComfyuiMasCercano, peticionFlujoComfyui } from "../media-gen";

describe("formatoComfyuiMasCercano", () => {
  it("sin tamaño pedido contesta 1:1", () => {
    expect(formatoComfyuiMasCercano()).toBe("1:1");
    expect(formatoComfyuiMasCercano(1024)).toBe("1:1");
  });
  it("elige el formato de publicación cuya proporción más se acerca", () => {
    expect(formatoComfyuiMasCercano(1024, 1024)).toBe("1:1");
    expect(formatoComfyuiMasCercano(800, 1000)).toBe("4:5");
    expect(formatoComfyuiMasCercano(720, 1280)).toBe("9:16");
    expect(formatoComfyuiMasCercano(1280, 720)).toBe("16:9");
  });
});

describe("peticionFlujoComfyui", () => {
  const base = { prompt: "una órbita dorada" };

  it("sin modelo usa el checkpoint de SD 1.5 y su escala", () => {
    const p = peticionFlujoComfyui({ ...base, seed: 3.4, width: 1280, height: 720 });
    expect(p.checkpoint).toContain("v1-5");
    expect(p.escala).toBe("sd15");
    expect(p.semilla).toBe(3);
    expect(p.formato).toBe("16:9");
  });
  it("recorta el modelo, recorta el negativo y sube a escala estándar con un modelo que no sea de SD 1.5", () => {
    const p = peticionFlujoComfyui({ ...base, model: " sd_xl.safetensors ", negative: " borroso ", seed: -7 });
    expect(p.checkpoint).toBe("sd_xl.safetensors");
    expect(p.escala).toBe("estandar");
    expect(p.negativo).toBe("borroso");
    expect(p.semilla).toBe(0);
    expect(p.formato).toBe("1:1");
  });
  it("sin semilla da una entera sin signo, con los valores por defecto acotados", () => {
    const p = peticionFlujoComfyui({ prompt: "luz de alba" });
    expect(Number.isInteger(p.semilla)).toBe(true);
    expect(p.semilla).toBeGreaterThanOrEqual(0);
    expect(p.pasos).toBeGreaterThanOrEqual(1);
    expect(p.pasos).toBeLessThanOrEqual(60);
    expect(p.cfg).toBeGreaterThanOrEqual(1);
    expect(p.cfg).toBeLessThanOrEqual(15);
    expect(p.positivo).toBe("luz de alba");
  });
  it("la petición del OS construye un grafo válido con las plantillas puras: solo nodos del núcleo y enlaces que apuntan a nodos que existen", () => {
    const grafo: GrafoComfyUI = textoAImagen(peticionFlujoComfyui({ ...base, width: 1080, height: 1080 }));
    for (const nodo of Object.values(grafo)) {
      expect(NODOS_NUCLEO as readonly string[]).toContain(nodo.class_type);
    }
    for (const nodo of Object.values(grafo)) {
      for (const valor of Object.values(nodo.inputs)) {
        if (Array.isArray(valor) && valor.length === 2) {
          expect(Object.keys(grafo)).toContain(String(valor[0]));
        }
      }
    }
  });
});
