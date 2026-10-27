import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NODOS_NUCLEO, type GrafoComfyUI } from "@/lib/imagenes/flujos-comfyui";
import {
  checkpointsDeObjetoInfo,
  comfyuiImage,
  formatoComfyuiMasCercano,
  generateImage,
  grafoComfyuiDe,
  peticionFlujoComfyui,
  urlsDeHistorialComfyui,
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

// ── ComfyUI de verdad (IMG1020C): fetch simulado, sin red ni servidor ──
const fetchOriginal = globalThis.fetch;

function respuesta(datos: unknown, status = 200): Response {
  const texto = JSON.stringify(datos);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, text: async () => texto } as Response;
}

function instalarFetch(responder: (url: string, init?: RequestInit) => Response): { url: string; init?: RequestInit }[] {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    llamadas.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
  return llamadas;
}

const objetoInfo = (checkpoints: string[]) => ({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } } } });
const historial = (nombre: string) => ({ p: { outputs: { "7": { images: [{ filename: nombre, subfolder: "", type: "output" }] } } } });

describe("comfyuiImage", () => {
  beforeEach(() => {
    const prefs = JSON.stringify({ defaultImage: "comfyui", customEndpoints: { comfyui: "http://comfy.local:8188" } });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: { getItem: (k: string) => (k === "starseed.media.prefs.v1" ? prefs : null), setItem() {}, removeItem() {} } },
    });
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    Reflect.deleteProperty(globalThis, "window");
  });

  it("una imagen: usa el primer checkpoint disponible, envía el grafo y devuelve la URL de /view", async () => {
    const llamadas = instalarFetch((url) => {
      if (url.includes("/object_info/")) return respuesta(objetoInfo(["sd15.safetensors", "otro.safetensors"]));
      if (url.endsWith("/prompt")) return respuesta({ prompt_id: "p1", node_errors: {} });
      if (url.includes("/history/p1")) return respuesta(historial("starseed_00001_.png"));
      return respuesta({}, 404);
    });
    const r = await comfyuiImage({ prompt: "una órbita dorada" });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("comfyui");
    expect(r.url).toContain("/view?");
    expect(r.url).toContain("filename=starseed_00001_.png");
    const envio = llamadas.find((l) => l.url.endsWith("/prompt"));
    const cuerpo = JSON.parse(String(envio?.init?.body)) as { prompt: GrafoComfyUI };
    expect(cuerpo.prompt["1"].inputs.ckpt_name).toBe("sd15.safetensors");
  });

  it("varias opciones: variaciones con semillas distintas y galería (no pasa por la galería de neuronas)", async () => {
    let n = 0;
    const llamadas = instalarFetch((url) => {
      if (url.includes("/object_info/")) return respuesta(objetoInfo(["sd15.safetensors"]));
      if (url.endsWith("/prompt")) return respuesta({ prompt_id: `p${++n}`, node_errors: {} });
      if (url.includes("/history/")) return respuesta(historial(`v${n}.png`));
      return respuesta({}, 404);
    });
    const r = await generateImage({ prompt: "flor de la vida", provider: "comfyui", opciones: 3 });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("comfyui");
    expect(r.galeria?.opciones).toHaveLength(3);
    const semillas = llamadas.filter((l) => l.url.endsWith("/prompt")).map((l) => {
      const cuerpo = JSON.parse(String(l.init?.body)) as { prompt: GrafoComfyUI };
      return Object.values(cuerpo.prompt).find((nodo) => nodo.class_type === "KSampler")?.inputs.seed;
    });
    expect(new Set(semillas).size).toBe(3);
  });

  it("sin checkpoint: error honesto y no envía ningún flujo", async () => {
    const llamadas = instalarFetch((url) => (url.includes("/object_info/") ? respuesta(objetoInfo([])) : respuesta({}, 404)));
    const r = await comfyuiImage({ prompt: "un rostro" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/instala un checkpoint en tu comfyui/i);
    expect(llamadas.some((l) => l.url.endsWith("/prompt"))).toBe(false);
  });

  it("error del flujo: los node_errors salen como texto legible", async () => {
    instalarFetch((url) => {
      if (url.includes("/object_info/")) return respuesta(objetoInfo(["sd15.safetensors"]));
      if (url.endsWith("/prompt")) return respuesta({ node_errors: { "1": { errors: [{ message: "No such checkpoint" }] } } }, 400);
      return respuesta({}, 404);
    });
    const r = await comfyuiImage({ prompt: "un rostro" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No such checkpoint");
  });

  it("lee las respuestas reales de ComfyUI con funciones puras", () => {
    expect(checkpointsDeObjetoInfo(objetoInfo(["a.safetensors", "a.safetensors", 3]))).toEqual(["a.safetensors"]);
    expect(urlsDeHistorialComfyui(historial("x.png"), "http://c:8188")).toEqual([
      "http://c:8188/view?filename=x.png&subfolder=&type=output",
    ]);
  });
});
