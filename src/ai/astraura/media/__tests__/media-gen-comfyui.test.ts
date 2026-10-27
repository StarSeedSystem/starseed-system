import { describe, expect, it } from "vitest";
import { NODOS_NUCLEO, type GrafoComfyUI } from "@/lib/imagenes/flujos-comfyui";
import type { FetchFlujo, RespuestaFlujo } from "../media-gen";
import {
  checkpointsDisponibles,
  elegirCheckpoint,
  ejecutarFlujoComfyui,
  formatoComfyuiMasCercano,
  grafoComfyuiDe,
  peticionFlujoComfyui,
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

// ════════════════════════════════════════════════════════════════════════════
// IMG1020C · el flujo REAL de ComfyUI (/prompt → /history → /view) con fetch simulado
// ════════════════════════════════════════════════════════════════════════════

const ENDPOINT = "http://127.0.0.1:8188";

const responder = (ok: boolean, cuerpo: string, status = ok ? 200 : 400): RespuestaFlujo => ({
  ok,
  status,
  headers: { get: () => null },
  text: async () => cuerpo,
});
/** Lo que un ComfyUI real responde en /object_info/CheckpointLoaderSimple (núcleo 0.42); `vacio` = sin checkpoints. */
const OBJECT_INFO = (vacio: boolean): string =>
  JSON.stringify({
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: [vacio ? [] : ["v1-5-pruned-emaonly.safetensors", "dreamshaper.safetensors"], { ui_widget: "combo" }] } },
    },
  });

interface ClienteComfyui { fetchImpl: FetchFlujo; llamadas: string[]; semillas: number[] }
/** ComfyUI simulado: fiecare /prompt (grafo → prompt_id, opcional con node_errors), /history terminado y /view. */
function servidorComfyui(ajustes?: { vacio?: boolean; rechazar?: boolean; nunca?: boolean }): ClienteComfyui {
  const llamadas: string[] = [];
  const semillas: number[] = [];
  let envios = 0;
  const fetchImpl: FetchFlujo = async (url, init) => {
    const u = String(url);
    llamadas.push(u);
    if (u.endsWith("/object_info/CheckpointLoaderSimple")) return responder(true, OBJECT_INFO(ajustes?.vacio === true));
    if (u === `${ENDPOINT}/prompt` && init?.method === "POST") {
      if (ajustes?.rechazar) {
        return responder(true, JSON.stringify({
          prompt_id: `pid-${++envios}`,
          node_errors: [{ node_type: "KSampler", errors: [{ message: "steps fuera de rango" }] }],
        }));
      }
      const cuerpo = JSON.parse(String(init.body)) as { prompt: GrafoComfyUI };
      const ks = Object.values(cuerpo.prompt).find((n) => n.class_type === "KSampler");
      semillas.push(Number(ks?.inputs.seed));
      return responder(true, JSON.stringify({ prompt_id: `pid-${++envios}` }));
    }
    const m = /\/history\/([^/]+)$/.exec(u);
    if (m && ajustes?.nunca !== true) {
      return responder(true, JSON.stringify({
        [m[1]]: {
          outputs: { "7": { images: [{ filename: `salida-${m[1]}.png`, subfolder: "", type: "output" }] } },
          status: { completed: true },
        },
      }));
    }
    if (u.startsWith(`${ENDPOINT}/view`)) return responder(true, "PNG");
    return responder(false, "ruta no esperada", 404);
  };
  return { fetchImpl, llamadas, semillas };
}

const SIN_PAUSA = async () => undefined;

describe("checkpointsDisponibles y elegirCheckpoint", () => {
  it("lee la lista real del /object_info simulado; vacío si el servidor no responde o mando basura", async () => {
    expect(await checkpointsDisponibles(ENDPOINT, servidorComfyui().fetchImpl)).toEqual([
      "v1-5-pruned-emaonly.safetensors",
      "dreamshaper.safetensors",
    ]);
    const caido: FetchFlujo = async () => responder(false, "", 500);
    expect(await checkpointsDisponibles(ENDPOINT, caido)).toEqual([]);
  });
  it("elige el checkpoint pedido; si no, la preferencia; si no, el primero del servidor; sin ninguno, null", () => {
    const lista = ["a.safetensors", "b.safetensors"];
    expect(elegirCheckpoint("c.safetensors", "b.safetensors", lista)).toBe("c.safetensors");
    expect(elegirCheckpoint("", "b.safetensors", lista)).toBe("b.safetensors");
    expect(elegirCheckpoint(" ", "", lista)).toBe("a.safetensors");
    expect(elegirCheckpoint("", "", [])).toBeNull();
  });
});

describe("ejecutarFlujoComfyui · el flujo real con fetch simulado", () => {
  const PETICION = { prompt: "una órbita dorada", seed: 42 };
  const deps = (s: ClienteComfyui, rondas = 3) => ({ fetchImpl: s.fetchImpl, esperar: SIN_PAUSA, rondas });

  it("una imagen: el grafo del núcleo con la semilla pedida a /prompt y la salida de /view", async () => {
    const s = servidorComfyui();
    const r = await ejecutarFlujoComfyui({ endpoint: ENDPOINT, checkpoint: "v1-5-pruned-emaonly.safetensors", opts: PETICION, deps: deps(s) });
    expect(r.ok).toBe(true);
    expect(r.vistas).toHaveLength(1);
    expect(r.vista).toBe(`${ENDPOINT}/view?filename=salida-pid-1.png&subfolder=&type=output`);
    expect(r.semillas).toEqual([42]);
    expect(s.semillas[0]).toBe(42);
    expect(s.llamadas.some((u) => u === `${ENDPOINT}/prompt`)).toBe(true);
    expect(s.llamadas.some((u) => u === `${ENDPOINT}/history/pid-1`)).toBe(true);
  });

  it("varias opciones: un grafo por semilla distinta y una vista por cada uno", async () => {
    const s = servidorComfyui();
    const r = await ejecutarFlujoComfyui({ endpoint: ENDPOINT, checkpoint: "v1-5-pruned-emaonly.safetensors", opts: PETICION, opciones: 3, deps: deps(s) });
    expect(r.ok).toBe(true);
    expect(r.vistas).toHaveLength(3);
    expect(r.semillas).toEqual([42, 43, 44]);
    expect(new Set(r.semillas).size).toBe(3);
    expect(r.vista).toContain("salida-pid-1.png");
    expect(r.vistas[2]).toContain("salida-pid-3.png");
  });

  it("sin checkpoint: error honesto pidiendo instalar uno, sin hablar con la red", async () => {
    const s = servidorComfyui();
    const r = await ejecutarFlujoComfyui({ endpoint: ENDPOINT, checkpoint: "  ", opts: PETICION, deps: deps(s) });
    expect(r.ok).toBe(false);
    expect(r.vistas).toEqual([]);
    expect(r.error).toContain("instala un checkpoint en tu ComfyUI");
    expect(s.llamadas).toEqual([]);
  });

  it("error del flujo: los node_errors del servidor salen legibles, sin imagen", async () => {
    const s = servidorComfyui({ rechazar: true });
    const r = await ejecutarFlujoComfyui({ endpoint: ENDPOINT, checkpoint: "v1-5-pruned-emaonly.safetensors", opts: PETICION, deps: deps(s) });
    expect(r.ok).toBe(false);
    expect(r.vistas).toEqual([]);
    expect(r.error).toContain("El ComfyUI rechazó el flujo");
    expect(r.error).toContain("KSampler");
    expect(r.error).toContain("steps fuera de rango");
  });

  it("flujo que no termina: falla en las rondas dadas, sin nada inventado", async () => {
    const s = servidorComfyui({ nunca: true });
    const r = await ejecutarFlujoComfyui({ endpoint: ENDPOINT, checkpoint: "v1-5-pruned-emaonly.safetensors", opts: PETICION, deps: deps(s, 2) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no terminó en 2 rondas/);
  });
});
