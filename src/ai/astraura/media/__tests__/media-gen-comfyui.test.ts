// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NODOS_NUCLEO, type GrafoComfyUI } from "@/lib/imagenes/flujos-comfyui";
import {
  checkpointsDeInfo,
  comfyuiImage,
  formatoComfyuiMasCercano,
  grafoComfyuiDe,
  peticionFlujoComfyui,
  urlViewComfyui,
} from "../media-gen";
import { setMediaPrefs } from "../media-gen";

/** Servidor ComfyUI ficticio de las pruebas: cada test lo rellena con su fetch simulado. */
const SERVIDOR = "http://127.0.0.1:8188";
const OBJETO_INFO = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [["v1-5-pruned-emaonly.safetensors", "sd_xl_base.safetensors"]] } },
  },
};

interface Llamada { url: string; cuerpo: string | null }
interface RespuestaStub { ok: boolean; status: number; text: () => Promise<string>; headers: { get: (k: string) => string | null } }

const json = (datos: unknown, estatus = 200): RespuestaStub => ({
  ok: estatus < 400,
  status: estatus,
  text: async () => JSON.stringify(datos),
  headers: { get: () => (estatus < 400 ? "application/json" : "") },
});

/** Cambia `fetch` global por uno que despacha por URL (sin vi.mock de módulos de Node). */
function instalarFetch(rutas: (l: Llamada) => RespuestaStub | undefined | null): { llamadas: Llamada[]; restaurar: () => void } {
  const llamadas: Llamada[] = [];
  const previo = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = async (url: unknown, init?: RequestInit): Promise<unknown> => {
    const l: Llamada = { url: String(url), cuerpo: typeof init?.body === "string" ? init.body : null };
    llamadas.push(l);
    return rutas(l);
  };
  return { llamadas, restaurar: () => { (globalThis as Record<string, unknown>).fetch = previo; } };
}

function activarEndpoint(): void {
  setMediaPrefs({ customEndpoints: { comfyui: SERVIDOR } });
}

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

describe("checkpointsDeInfo / urlViewComfyui (puras)", () => {
  it("lee los checkpoints de /object_info y devuelve [] con formas absurdas", () => {
    expect(checkpointsDeInfo(OBJETO_INFO)).toEqual(["v1-5-pruned-emaonly.safetensors", "sd_xl_base.safetensors"]);
    expect(checkpointsDeInfo({})).toEqual([]);
    expect(checkpointsDeInfo({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [null] } } } })).toEqual([]);
    expect(checkpointsDeInfo(null)).toEqual([]);
  });
  it("monta la URL de /view con subcarpeta y tipo, y devuelve null sin nombre de archivo", () => {
    expect(urlViewComfyui(SERVIDOR, { filename: "x.png", subfolder: "img", type: "output" })).toBe(
      `${SERVIDOR}/view?filename=x.png&subfolder=img&type=output`,
    );
    expect(urlViewComfyui(SERVIDOR, { filename: "x.png" })).toBe(`${SERVIDOR}/view?filename=x.png`);
    expect(urlViewComfyui(SERVIDOR, null)).toBeNull();
    expect(urlViewComfyui(SERVIDOR, { filename: "  " })).toBeNull();
  });
});

describe("comfyuiImage · fetch simulado", () => {
  it("una imagen: usa el checkpoint pedido, envía el grafo y devuelve la URL de /view", async () => {
    activarEndpoint();
    let enviados = 0;
    const f = instalarFetch((l) => {
      if (l.url.includes("/object_info")) return json(OBJETO_INFO);
      if (l.url.includes("/prompt")) {
        enviados += 1;
        return json({ prompt_id: "p1" });
      }
      if (l.url.includes("/history/p1")) {
        return json({ p1: { outputs: { "7": { images: [{ filename: "starseed_00001.png", subfolder: "img", type: "output" }] } } } });
      }
      return undefined;
    });
    try {
      const r = await comfyuiImage({ prompt: "una órbita dorada", model: "sd_xl_base.safetensors" });
      expect(r.ok).toBe(true);
      expect(r.provider).toBe("comfyui");
      expect(r.url).toBe(`${SERVIDOR}/view?filename=starseed_00001.png&subfolder=img&type=output`);
      expect(enviados).toBe(1);
      const cuerpo = JSON.parse(f.llamadas.find((c) => c.url.includes("/prompt"))?.cuerpo ?? "{}") as {
        prompt: GrafoComfyUI;
      };
      expect(cuerpo.prompt["1"].inputs.ckpt_name).toBe("sd_xl_base.safetensors");
    } finally {
      f.restaurar();
    }
  });

  it("el checkpoint pedido que el servidor no tiene se sustituye por el primero instalado", async () => {
    activarEndpoint();
    const f = instalarFetch((l) => {
      if (l.url.includes("/object_info")) return json(OBJETO_INFO);
      if (l.url.includes("/prompt")) return json({ prompt_id: "p1" });
      if (l.url.includes("/history/p1")) {
        return json({ p1: { outputs: { "7": { images: [{ filename: "a.png" }] } } } });
      }
      return undefined;
    });
    try {
      const r = await comfyuiImage({ prompt: "una órbita", model: "no_esta.safetensors" });
      expect(r.ok).toBe(true);
      const cuerpo = JSON.parse(f.llamadas.find((c) => c.url.includes("/prompt"))?.cuerpo ?? "{}") as {
        prompt: GrafoComfyUI;
      };
      expect(cuerpo.prompt["1"].inputs.ckpt_name).toBe("v1-5-pruned-emaonly.safetensors");
    } finally {
      f.restaurar();
    }
  });

  it("varias opciones: envía variaciones con semillas distintas y monta la galería", async () => {
    activarEndpoint();
    let nº = 0;
    const f = instalarFetch((l) => {
      if (l.url.includes("/object_info")) return json(OBJETO_INFO);
      if (l.url.includes("/prompt")) {
        nº += 1;
        return json({ prompt_id: `p${nº}` });
      }
      const m = /\/history\/p(\d+)$/.exec(l.url);
      if (m) {
        return json({ [`p${m[1]}`]: { outputs: { "7": { images: [{ filename: `starseed_0000${m[1]}.png` }] } } } });
      }
      return undefined;
    });
    try {
      const r = await comfyuiImage({ prompt: "una órbita", seed: 9, opciones: 3 });
      expect(r.ok).toBe(true);
      expect(r.url).toBe(`${SERVIDOR}/view?filename=starseed_00001.png`);
      expect(r.galeria?.ok).toBe(true);
      expect(r.galeria?.opciones).toHaveLength(3);
      expect(r.galeria?.opciones[0]?.modelo).toBe("v1-5-pruned-emaonly.safetensors");
      const semillas = f.llamadas
        .filter((c) => c.url.includes("/prompt"))
        .map((c) => (JSON.parse(c.cuerpo ?? "{}") as { prompt: GrafoComfyUI }).prompt["5"].inputs.seed);
      expect(new Set(semillas).size).toBe(3);
    } finally {
      f.restaurar();
    }
  });

  it("sin checkpoints instalados avisa con la instrucción honesta", async () => {
    activarEndpoint();
    const f = instalarFetch((l) => (l.url.includes("/object_info") ? json({}) : undefined));
    try {
      const r = await comfyuiImage({ prompt: "una órbita" });
      expect(r.ok).toBe(false);
      expect(r.url).toBeUndefined();
      expect(r.error).toMatch(/instala un checkpoint en tu ComfyUI/);
    } finally {
      f.restaurar();
    }
  });

  it("un error del flujo (node_errors) sale legible y sin URL", async () => {
    activarEndpoint();
    const f = instalarFetch((l) => {
      if (l.url.includes("/object_info")) return json(OBJETO_INFO);
      if (l.url.includes("/prompt")) {
        return json({ node_errors: { "5": { errors: [], class_type: "KSampler" } } }, 400);
      }
      return undefined;
    });
    try {
      const r = await comfyuiImage({ prompt: "una órbita" });
      expect(r.ok).toBe(false);
      expect(r.url).toBeUndefined();
      expect(r.error).toMatch(/node_errors/);
      expect(r.error).toMatch(/KSampler/);
    } finally {
      f.restaurar();
    }
  });
});
