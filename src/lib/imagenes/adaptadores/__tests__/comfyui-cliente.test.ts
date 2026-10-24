/**
 * Pruebas PURAS del cliente de flujos de ComfyUI (IMG1020B): `fetch` simulado, sin red ni disco.
 * Cubren el envío del grafo, la lectura de `/view`, `node_errors`, el tope de tiempo con
 * `/interrupt`, los checkpoints y la salud.
 */
import { describe, expect, it } from "vitest";
import {
  checkpointsDisponibles, generarConComfyUI, motivoDeErrores, salud, urlDeImagen,
  type FetchHttp, type PeticionHttp, type RespuestaHttp,
} from "../comfyui-cliente";

const FLUJO = { "3": { class_type: "KSampler", inputs: { seed: 1 } } };
const resp = (status: number, cuerpo: unknown): RespuestaHttp => {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => texto };
};

describe("comfyui-cliente · generar", () => {
  it("éxito: manda el GRAFO a /prompt, sigue el historial y arma /view con URLSearchParams", async () => {
    const llamadas: { url: string; init: PeticionHttp }[] = [];
    const f: FetchHttp = async (url, init) => {
      llamadas.push({ url, init });
      if (url.endsWith("/prompt")) return resp(200, { prompt_id: "p-1" });
      return resp(200, { "p-1": { outputs: { "9": { images: [{ filename: "a b.png", subfolder: "sub", type: "output" }] } } } });
    };
    const r = await generarConComfyUI("http://127.0.0.1:8188/", FLUJO, { fetch: f });
    expect(r).toMatchObject({ ok: true, promptId: "p-1" });
    if (!r.ok) return;
    expect(r.imagenes).toEqual([{ filename: "a b.png", subfolder: "sub", type: "output",
      url: "http://127.0.0.1:8188/view?filename=a+b.png&subfolder=sub&type=output" }]);
    expect(llamadas[0]?.url).toBe("http://127.0.0.1:8188/prompt");
    expect(llamadas[0]?.init).toMatchObject({ method: "POST", redirect: "manual", headers: { "content-type": "application/json" } });
    expect(JSON.parse(llamadas[0]!.init.body!)).toEqual({ prompt: FLUJO, client_id: "starseed-os" });
    expect(llamadas[1]).toMatchObject({ url: "http://127.0.0.1:8188/history/p-1", init: { method: "GET", redirect: "manual" } });
  });

  it("node_errors: no sigue el historial y lo explica en español, nodo por nodo", async () => {
    const urls: string[] = [];
    const f: FetchHttp = async (url) => {
      urls.push(url);
      return url.endsWith("/prompt")
        ? resp(400, { error: { message: "Prompt outputs failed validation" }, node_errors: { "3": { class_type: "KSampler", errors: [{ message: "ckpt_name no existe" }] } } })
        : resp(200, {});
    };
    const r = await generarConComfyUI("http://127.0.0.1:8188", FLUJO, { fetch: f });
    expect(r).toMatchObject({ ok: false, fallo: "node_errors" });
    if (r.ok) return;
    expect(r.motivo).toMatch(/ComfyUI rechazó el flujo/);
    expect(r.motivo).toMatch(/nodo 3 \(KSampler\): ckpt_name no existe/);
    expect(urls.some((u) => u.includes("/history/"))).toBe(false);
  });

  it("tiempo agotado: deja de seguir el historial y pide /interrupt", async () => {
    const urls: string[] = [];
    const f: FetchHttp = async (url) => {
      urls.push(url);
      if (url.endsWith("/prompt")) return resp(200, { prompt_id: "p-2" });
      return resp(200, {}); // historial todavía sin outputs
    };
    const r = await generarConComfyUI("http://127.0.0.1:8188", FLUJO, { fetch: f, tiempoMs: 15, intervaloMs: 1 });
    expect(r).toMatchObject({ ok: false, fallo: "tiempo", promptId: "p-2" });
    expect(urls).toContain("http://127.0.0.1:8188/interrupt");
  });

  it("caído: error en español sin inventar resultados", async () => {
    const r = await generarConComfyUI("http://127.0.0.1:8188", FLUJO, { fetch: async () => { throw new Error("ECONNREFUSED"); } });
    expect(r).toMatchObject({ ok: false, fallo: "red", motivo: expect.stringMatching(/No se pudo hablar con ComfyUI/) });
  });
});

describe("comfyui-cliente · piezas puras", () => {
  it("urlDeImagen codifica el nombre y no duplica la barra final", () => {
    expect(urlDeImagen("http://x:8188/", { filename: "ñ and.png", subfolder: "", type: "temp" }))
      .toBe("http://x:8188/view?filename=%C3%B1+and.png&subfolder=&type=temp");
  });

  it("motivoDeErrores: null si no hay error, y recoge también un error en texto", () => {
    expect(motivoDeErrores({ prompt_id: "p" })).toBeNull();
    expect(motivoDeErrores(null)).toBeNull();
    expect(motivoDeErrores({ error: "flujo inválido" })).toBe("ComfyUI rechazó el flujo: flujo inválido");
  });
});

describe("comfyui-cliente · checkpoints", () => {
  it("lee input.required.ckpt_name[0] y devuelve solo cadenas", async () => {
    const f: FetchHttp = async () => resp(200, { input: { required: { ckpt_name: [["sd15.safetensors", 7, "sdxl.safetensors"], { tooltip: "" }] } } });
    expect(await checkpointsDisponibles("http://127.0.0.1:8188", { fetch: f })).toEqual(["sd15.safetensors", "sdxl.safetensors"]);
  });

  it("sin checkpoints (campo ausente, error HTTP o red caída) devuelve lista vacía, sin inventar", async () => {
    const vacio: FetchHttp = async () => resp(200, { input: { required: {} } });
    const roto: FetchHttp = async () => resp(404, "no");
    const caido: FetchHttp = async () => { throw new Error("ECONNREFUSED"); };
    for (const f of [vacio, roto, caido]) expect(await checkpointsDisponibles("http://127.0.0.1:8188", { fetch: f })).toEqual([]);
  });
});

describe("comfyui-cliente · salud", () => {
  it("dispositivos y VRAM en GB; lo que no consta queda en null", async () => {
    const f: FetchHttp = async () => resp(200, { devices: [
      { name: "cuda:0", type: "cuda", vram_total: 8 * 1024 ** 3, vram_free: 2 * 1024 ** 3 },
      { name: "cpu", type: "cpu" },
    ] });
    expect(await salud("http://127.0.0.1:8188", { fetch: f })).toEqual({ ok: true, dispositivos: [
      { nombre: "cuda:0", tipo: "cuda", vramTotalGB: 8, vramLibreGB: 2 },
      { nombre: "cpu", tipo: "cpu", vramTotalGB: null, vramLibreGB: null },
    ] });
  });

  it("instancia caída: se dice, no se finge salud", async () => {
    const r = await salud("http://127.0.0.1:8188", { fetch: async () => { throw new Error("ECONNREFUSED"); } });
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/No se pudo hablar con ComfyUI/) });
  });
});
