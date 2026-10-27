// Mock window for isClient() check before importing the module
const mockLocalStorage: Storage = {
  length: 0,
  clear: vi.fn(),
  getItem: vi.fn(),
  key: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
};
globalThis.window = { localStorage: mockLocalStorage } as unknown as Window & typeof globalThis;

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NODOS_NUCLEO, type GrafoComfyUI } from "@/lib/imagenes/flujos-comfyui";
import {
  formatoComfyuiMasCercano,
  grafoComfyuiDe,
  peticionFlujoComfyui,
  checkpointsDisponibles,
  comfyuiImage,
} from "../media-gen";

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
    const grafo: GrafoComfyUI = grafoComfyuiDe({ ...base, width: 1080, height: 1080 });
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

describe("peticionFlujoComfyui · muestreo según la lista blanca", () => {
  it("aplica el muestreador y el planificador elegidos de la lista blanca", () => {
    const p = peticionFlujoComfyui({ prompt: "una órbita", muestreador: "dpmpp_2m", planificador: "karras" });
    expect(p.muestreador).toBe("dpmpp_2m");
    expect(p.planificador).toBe("karras");
  });
  it("un muestreador o planificador fuera de la lista blanca cae a euler y normal, nunca sale del núcleo", () => {
    const p = peticionFlujoComfyui({ prompt: "una órbita", muestreador: "ddim", planificador: "sgm_uniform" });
    expect(p.muestreador).toBe("euler");
    expect(p.planificador).toBe("normal");
  });
});

describe("grafoComfyuiDe · texto a imagen o imagen a imagen", () => {
  const base = { prompt: "retrato con niebla", seed: 5 };

  it("sin imagen de entrada construye el flujo de TEXTO a imagen (sin LoadImage, con EmptyLatentImage)", () => {
    const grafo = grafoComfyuiDe(base);
    expect(Object.values(grafo).some((n) => n.class_type === "EmptyLatentImage")).toBe(true);
    expect(Object.values(grafo).some((n) => n.class_type === "LoadImage")).toBe(false);
  });

  it("con imagenEntrada construye IMAGEN a imagen: LoadImage → VAEEncode, no hay EmptyLatentImage y el denoise por defecto es 0,75", () => {
    const grafo = grafoComfyuiDe({ ...base, imagenEntrada: " entrada.png " });
    expect(grafo["1"].class_type).toBe("LoadImage");
    expect(grafo["1"].inputs.image).toBe("entrada.png");
    expect(Object.values(grafo).some((n) => n.class_type === "VAEEncode")).toBe(true);
    expect(Object.values(grafo).some((n) => n.class_type === "EmptyLatentImage")).toBe(false);
    const ksampler = Object.values(grafo).find((n) => n.class_type === "KSampler");
    expect(ksampler?.inputs.denoise).toBe(0.75);
  });

  it("aplica el denoise pedido y falla con error legible si sale de rango", () => {
    const grafo = grafoComfyuiDe({ ...base, imagenEntrada: "base.png", denoise: 0.3 });
    const ksampler = Object.values(grafo).find((n) => n.class_type === "KSampler");
    expect(ksampler?.inputs.denoise).toBe(0.3);
    expect(() => grafoComfyuiDe({ ...base, imagenEntrada: "base.png", denoise: 2 })).toThrow(/denoise/);
  });

  it("el flujo de imagen a imagen también cae entero dentro de la lista blanca del núcleo", () => {
    const grafo = grafoComfyuiDe({ ...base, imagenEntrada: "base.png", denoise: 0.5 });
    for (const nodo of Object.values(grafo)) {
      expect(NODOS_NUCLEO as readonly string[]).toContain(nodo.class_type);
    }
  });
});

describe("checkpointsDisponibles", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("devuelve la lista de checkpoints del endpoint", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [["model1.safetensors", "model2.safetensors"]] } },
        },
      }),
    } as Response);

    const ckpts = await checkpointsDisponibles("http://127.0.0.1:8188");
    expect(ckpts).toEqual(["model1.safetensors", "model2.safetensors"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8188/object_info/CheckpointLoaderSimple",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("devuelve array vacío si el endpoint no responde", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    const ckpts = await checkpointsDisponibles("http://127.0.0.1:8188");
    expect(ckpts).toEqual([]);
  });

  it("devuelve array vacío si la respuesta no tiene la estructura esperada", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const ckpts = await checkpointsDisponibles("http://127.0.0.1:8188");
    expect(ckpts).toEqual([]);
  });
});

describe("comfyuiImage · flujo real con fetch simulado", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    // Configurar endpoint de ComfyUI en localStorage
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === "starseed.media.prefs.v1") {
        return JSON.stringify({
          defaultImage: "comfyui",
          customEndpoints: { comfyui: "http://127.0.0.1:8188" },
        });
      }
      return null;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    mockLocalStorage.clear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.getItem.mockClear();
  });

  const endpoint = "http://127.0.0.1:8188";
  const baseOpts = { prompt: "test image", width: 1024, height: 1024 };

  it("una imagen: usa checkpoint preferido, envía grafo, espera historial y descarga de /view", async () => {
    // 1. /object_info para checkpoints (no se llama porque hay model en opts)
    // 2. /prompt para enviar el grafo
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: "pid-123" }),
      } as Response)
      // 3. /history/pid-123 (polling hasta completado)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "pid-123": {
            outputs: {
              "7": { images: [{ filename: "img_001.png", subfolder: "", type: "output" }] },
            },
          },
        }),
      } as Response)
      // 4. /view para descargar la imagen
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["fake-image-data"], { type: "image/png" }),
      } as Response);

    const result = await comfyuiImage({ ...baseOpts, model: "my-model.safetensors" });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("comfyui");
    expect(result.url).toBeDefined();
    expect(result.url).toMatch(/^blob:/);
    // Verificar que se llamó a /prompt con el grafo
    const promptCall = fetchSpy.mock.calls.find((c) => c[0].includes("/prompt"));
    expect(promptCall).toBeDefined();
    const body = JSON.parse(promptCall![1]?.body as string);
    expect(body.prompt).toBeDefined();
    expect(body.prompt["1"].class_type).toBe("CheckpointLoaderSimple");
    expect(body.prompt["1"].inputs.ckpt_name).toBe("my-model.safetensors");
  });

  it("varias opciones (opciones > 1): usa variaciones con semillas distintas y devuelve galería", async () => {
    fetchSpy
      // Primera variación
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: "pid-1" }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "pid-1": { outputs: { "7": { images: [{ filename: "img_1.png", subfolder: "", type: "output" }] } } },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["img1"], { type: "image/png" }) } as Response)
      // Segunda variación
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: "pid-2" }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "pid-2": { outputs: { "7": { images: [{ filename: "img_2.png", subfolder: "", type: "output" }] } } },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["img2"], { type: "image/png" }) } as Response)
      // Tercera variación
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: "pid-3" }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "pid-3": { outputs: { "7": { images: [{ filename: "img_3.png", subfolder: "", type: "output" }] } } },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["img3"], { type: "image/png" }) } as Response);

    const result = await comfyuiImage({ ...baseOpts, model: "model.safetensors", opciones: 3 });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("comfyui");
    expect(result.galeria).toBeDefined();
    expect(result.galeria!.ok).toBe(true);
    expect(result.galeria!.opciones).toHaveLength(3);
    expect(result.galeria!.opciones[0].url).toBeDefined();
    expect(result.galeria!.opciones[1].url).toBeDefined();
    expect(result.galeria!.opciones[2].url).toBeDefined();
    // Semillas distintas
    const semillas = result.galeria!.opciones.map((o) => o.semilla);
    expect(new Set(semillas).size).toBe(3);
  });

  it("sin checkpoint disponible: error honesto 'instala un checkpoint en tu ComfyUI'", async () => {
    // /object_info devuelve lista vacía
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } } }),
    } as Response);

    const result = await comfyuiImage({ ...baseOpts });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("comfyui");
    expect(result.error).toContain("checkpoints instalados");
    expect(result.error).toContain("ComfyUI");
  });

  it("error del flujo (node_errors): devuelve error legible", async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: "pid-err" }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "pid-err": {
            outputs: {},
            status: { status_str: "error", error: { message: "node_errors: KSampler invalid seed" } },
          },
        }),
      } as Response);

    const result = await comfyuiImage({ ...baseOpts, model: "model.safetensors" });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("comfyui");
    expect(result.error).toContain("no devolvió imágenes");
  });

  it("sin endpoint configurado: conserva el mensaje actual con formato y megapíxeles", async () => {
    // Sobrescribir el mock para que no haya endpoint
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === "starseed.media.prefs.v1") {
        return JSON.stringify({ defaultImage: "pollinations" });
      }
      return null;
    });
    // No se mock fetch porque no debe llamarse sin endpoint
    const result = await comfyuiImage({ ...baseOpts, model: "model.safetensors" });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("comfyui");
    expect(result.error).toContain("No hay un endpoint de ComfyUI configurado");
    expect(result.error).toContain("1:1");
    expect(result.error).toContain("MP");
  });
});
