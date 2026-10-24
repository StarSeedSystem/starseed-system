/**
 * Pruebas del cliente de flujos de ComfyUI (IMG1020B): todo puro, con `fetch` simulado y reloj
 * inyectado; sin red, sin disco y sin procesos. Cubre éxito, node_errors, tiempo agotado y sin checkpoints.
 */
import { describe, expect, it } from "vitest";
import {
  checkpointsDisponibles, ejecutarFlujo, imagenesDeHistorial, parseaCheckpoints, parseaSalud, salud,
  type FetchComfy, type PeticionComfy, type RespuestaComfy,
} from "../comfyui-cliente";

const FLUJO = { "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd15.safetensors" } } } as Record<string, unknown>;
const resp = (status: number, cuerpo: unknown): RespuestaComfy => ({
  ok: status >= 200 && status < 300, status,
  text: async () => (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)),
});
const registro = () => {
  const llamadas: { url: string; init: PeticionComfy }[] = [];
  const fetch: FetchComfy = async (url, init) => { llamadas.push({ url, init }); return resp(200, {}); };
  return { llamadas, fetch };
};
function relojFalso() {
  let t = 0;
  return { reloj: { ahora: () => t, esperar: async (ms: number) => { t += ms; } } };
}

describe("ejecutarFlujo · éxito", () => {
  it("envía el grafo a /prompt, sigue /history y arma /view con URLSearchParams", async () => {
    const llamadas: { url: string; init: PeticionComfy }[] = [];
    let consultas = 0;
    const fetch: FetchComfy = async (url, init) => {
      llamadas.push({ url, init });
      if (url.endsWith("/prompt")) return resp(200, { prompt_id: "p1", number: 1 });
      if (url.includes("/history/p1")) {
        consultas += 1;
        return consultas < 2 ? resp(200, {}) : resp(200, { p1: { outputs: {
          "9": { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }, { filename: "x y.png", subfolder: "sub", type: "temp" }] },
        } } });
      }
      return resp(404, "no");
    };
    const r = await ejecutarFlujo("http://127.0.0.1:8188/", FLUJO, { fetch, clientId: "prueba", ...relojFalso(), tiempoMs: 10_000, intervaloMs: 1_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.promptId).toBe("p1");
    expect(r.imagenes.map((i) => i.url)).toEqual([
      "http://127.0.0.1:8188/view?filename=ComfyUI_00001_.png&subfolder=&type=output",
      "http://127.0.0.1:8188/view?filename=x+y.png&subfolder=sub&type=temp",
    ]);
    expect(llamadas[0]).toMatchObject({ url: "http://127.0.0.1:8188/prompt", init: { method: "POST", redirect: "manual" } });
    expect(JSON.parse(llamadas[0].init.body ?? "")).toEqual({ prompt: FLUJO, client_id: "prueba" });
    expect(llamadas.some((c) => c.url.includes("/interrupt"))).toBe(false);
  });
});

describe("ejecutarFlujo · rechazo", () => {
  it("node_errors y error se devuelven como texto legible en español, sin seguir el historial", async () => {
    const { llamadas, fetch } = registro();
    const rechazo: FetchComfy = async (url, init) => {
      llamadas.push({ url, init });
      return resp(400, {
        error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation" },
        node_errors: { "4": { class_type: "CheckpointLoaderSimple", errors: [{ message: "Value not in list", details: "ckpt_name: 'no-existe' not in []" }] } },
      });
    };
    const r = await ejecutarFlujo("http://127.0.0.1:8188", FLUJO, { fetch: rechazo, ...relojFalso() });
    expect(r).toMatchObject({ ok: false, fallo: "flujo" });
    if (r.ok) return;
    expect(r.motivo).toContain("ComfyUI rechazó el flujo");
    expect(r.motivo).toContain("ckpt_name");
    expect(llamadas.map((c) => c.url)).toEqual(["http://127.0.0.1:8188/prompt"]);
  });
  it("una respuesta sin prompt_id también es un flujo rechazado, no un éxito vacío", async () => {
    const r = await ejecutarFlujo("http://127.0.0.1:8188", FLUJO, { fetch: async () => resp(200, { number: 1 }), ...relojFalso() });
    expect(r).toMatchObject({ ok: false, fallo: "flujo", motivo: expect.stringContaining("prompt_id") });
  });
});

describe("ejecutarFlujo · tiempo agotado", () => {
  it("corta al llegar al tope y pide POST /interrupt con el prompt_id", async () => {
    const llamadas: { url: string; init: PeticionComfy }[] = [];
    const fetch: FetchComfy = async (url, init) => {
      llamadas.push({ url, init });
      if (url.endsWith("/prompt")) return resp(200, { prompt_id: "p2" });
      return resp(200, {});
    };
    const r = await ejecutarFlujo("http://127.0.0.1:8188", FLUJO, { fetch, ...relojFalso(), tiempoMs: 3_000, intervaloMs: 1_000 });
    expect(r).toMatchObject({ ok: false, fallo: "tiempo" });
    if (r.ok) return;
    expect(r.motivo).toMatch(/3 s/);
    expect(r.motivo).toContain("interrumpiera");
    const interrupcion = llamadas.find((c) => c.url.endsWith("/interrupt"));
    expect(interrupcion?.init.method).toBe("POST");
    expect(JSON.parse(interrupcion?.init.body ?? "")).toEqual({ prompt_id: "p2" });
  });
});

describe("checkpoints y salud", () => {
  it("lee input.required.ckpt_name[0], deduplica y devuelve [] sin checkpoints o si falla", async () => {
    const fetch = (cuerpo: unknown, status = 200): FetchComfy => async () => resp(status, cuerpo);
    const info = { CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sd15.safetensors", "sdxl.ckpt", "sd15.safetensors"]] } } } };
    expect(await checkpointsDisponibles("http://127.0.0.1:8188", { fetch: fetch(info) })).toEqual(["sd15.safetensors", "sdxl.ckpt"]);
    expect(await checkpointsDisponibles("http://127.0.0.1:8188", { fetch: fetch({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } } }) })).toEqual([]);
    expect(await checkpointsDisponibles("http://127.0.0.1:8188", { fetch: fetch({}, 500) })).toEqual([]);
    expect(parseaCheckpoints({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [] } } } })).toEqual([]);
  });
  it("parsea dispositivos y VRAM en MB, y salud responde null si el servidor falla", async () => {
    const stats = { system: { ram_total: 8 * 1024 ** 3, ram_free: 2 * 1024 ** 3 },
      devices: [{ name: "cuda:0", type: "cuda", vram_total: 4 * 1024 ** 3, vram_free: 1 * 1024 ** 3 }, { type: "cpu" }] };
    const sana = await salud("http://127.0.0.1:8188", { fetch: async () => resp(200, stats) });
    expect(sana?.dispositivos[0]).toEqual({ nombre: "cuda:0", tipo: "cuda", vramTotalMB: 4096, vramLibreMB: 1024 });
    expect(sana?.ramTotalMB).toBe(8192);
    expect(parseaSalud(stats)?.dispositivos[1]).toEqual({ nombre: "cpu", tipo: "cpu", vramTotalMB: 0, vramLibreMB: 0 });
    expect(await salud("http://127.0.0.1:8188", { fetch: async () => resp(500, "x") })).toBeNull();
    expect(parseaSalud(null)).toBeNull();
  });
});

describe("imágenes del historial", () => {
  it("extrae solo imágenes con filename y tolera entradas malformadas", () => {
    const historial = { otro: { outputs: { "1": { images: [{ filename: "a.png" }] } } },
      p1: { outputs: { "9": { images: [{ filename: "b.png", subfolder: "s", type: "temp" }, { subfolder: "sin-nombre" }] }, "10": {} } } };
    expect(imagenesDeHistorial(historial, "http://x", "p1").map((i) => i.filename)).toEqual(["b.png"]);
    expect(imagenesDeHistorial(historial, "http://x")).toHaveLength(2);
    expect(imagenesDeHistorial({}, "http://x")).toEqual([]);
  });
});
