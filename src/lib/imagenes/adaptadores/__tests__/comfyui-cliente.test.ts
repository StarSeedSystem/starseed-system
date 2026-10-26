/**
 * Pruebas del cliente de flujos de ComfyUI (IMG1020B): todo con fetch simulado, sin red.
 */
import { describe, expect, it } from "vitest";
import {
  checkpointsDisponibles, enviarFlujo,   parseaCheckpoints, pedirInterrupcion,
  salud, urlView, type FetchHttp, type RelojComfy, type RespuestaHttp,
} from "../comfyui-cliente";

const RES = (status: number, cuerpo: unknown): RespuestaHttp => ({
  ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(cuerpo),
});

/** fetch falso: guarda las llamadas y contesta según la ruta. */
function fetchFalso(esta: (ruta: string, metodo: string, cuerpo: unknown) => { estado: number; datos: unknown } | null) {
  const llamadas: { url: string; metodo: string; cuerpo: unknown; redirige: string }[] = [];
  const f: FetchHttp = async (url, init) => {
    const ruta = url.replace(/^https?:\/\/[^/]+/, "");
    const cuerpo = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    llamadas.push({ url, metodo: init.method, cuerpo, redirige: init.redirect });
    const r = esta(ruta, init.method, cuerpo);
    if (r === null) throw new Error("caída simulada");
    return RES(r.estado, r.datos);
  };
  return { f, llamadas, post: (ruta: string) => llamadas.some((l) => l.metodo === "POST" && l.url.includes(ruta)) };
}

/** Reloj falso: cuenta, avanza de golpe en cada espera y nunca satura. */
function relojFalso(paso = 1_000) {
  let t0 = 0;
  const r: RelojComfy = {
    ahora: () => t0,
    esperar: async (ms: number) => { t0 += Math.max(ms, paso); },
  };
  return { reloj: r, vueltas: () => Math.round(t0 / paso), t: () => t0 };
}

const FLUJO = { "3": { class_type: "KSampler2", inputs: { seed: 1 } } };
const GRAFO_OK = { prompt_id: "abc-1", numero_nodos: 1 };
const HISTORIAL = { "abc-1": { outputs: { "9": { images: [{ filename: "e.png", subfolder: "", type: "output" }] } } } };

describe("enviarFlujo · camino feliz", () => {
  it("envía el grafo con client_id, sigue /history y arma las URLs de /view", async () => {
    const { f, llamadas } = fetchFalso((ruta, metodo) =>
      ruta === "/prompt" && metodo === "POST" ? { estado: 200, datos: GRAFO_OK }
        : ruta === "/history/abc-1" ? { estado: 200, datos: HISTORIAL } : null);
    const r = await enviarFlujo("http://127.0.0.1:8188/", FLUJO, "astraura", f, { reloj: relojFalso().reloj });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.promptId).toBe("abc-1");
    expect(r.imagenes[0].url).toBe("http://127.0.0.1:8188/view?filename=e.png&type=output");
    const envio = llamadas[0];
    expect(envio.metodo).toBe("POST");
    expect(envio.redirige).toBe("manual");
    expect(envio.cuerpo).toEqual({ prompt: FLUJO, client_id: "astraura" });
    expect(llamadas[1].metodo).toBe("GET");
  });

  it("con node_errors usa el texto legible en español y no va a /history", async () => {
    const { f } = fetchFalso((ruta) =>
      ruta === "/prompt" ? { estado: 200, datos: { node_errors: { "3": { class_type: "KSampler2", errors: [{ message: "seed no válido" }] } } } } : null);
    const r = await enviarFlujo("http://127.0.0.1:8188", FLUJO, "a", f, { reloj: relojFalso().reloj });
    expect(r).toMatchObject({ ok: false, fallo: "prompt" });
    expect(r.ok ? "" : r.motivo).toContain("El nodo 3 (KSampler2) falló: seed no válido");
  });
});

describe("enviarFlujo · tiempo agotado", () => {
  it("al llegar el tope pide POST /interrupt y reporta «tiempo»", async () => {
    const { f, post } = fetchFalso((ruta, metodo) =>
      ruta === "/prompt" && metodo === "POST" ? { estado: 200, datos: GRAFO_OK }
        : ruta.startsWith("/history/") ? { estado: 200, datos: {} } : null);
    const reloj = relojFalso(500);
    const r = await enviarFlujo("http://127.0.0.1:8188", FLUJO, "a", f, { reloj: reloj.reloj, intervaloMs: 500, tiempoTopeMs: 1_500 });
    expect(r).toMatchObject({ ok: false, fallo: "tiempo" });
    expect(r.ok ? "" : r.motivo).toContain("interrumpir");
    expect(post("/interrupt")).toBe(true);
    expect(reloj.vueltas()).toBeGreaterThanOrEqual(2);
  });
});

describe("checkpoints y salud", () => {
  it("parseaCheckpoints lee input.required.ckpt_name[0]; checkpointsDisponibles deduplica", async () => {
    expect(parseaCheckpoints({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sd_a.safetensors", "sd_b.safetensors", "sd_a.safetensors"]] } } } })).toEqual(["sd_a.safetensors", "sd_b.safetensors", "sd_a.safetensors"]);
    const t = await checkpointsDisponibles("http://127.0.0.1:8188", async () => RES(200, { CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sd_a.safetensors", "sd_b.safetensors", "sd_a.safetensors"]] } } } }));
    expect(t).toEqual({ ok: true, checkpoints: ["sd_a.safetensors", "sd_b.safetensors"] });
    const sin = await checkpointsDisponibles("http://127.0.0.1:8188", async () => RES(200, { CheckpointLoaderSimple: {} }));
    expect(sin).toEqual({ ok: true, checkpoints: [] });
  });

  it("checkpointsDisponibles con el endpoint caído lo dice sin inventar", async () => {
    const r = await checkpointsDisponibles("http://127.0.0.1:8188", async () => { throw new Error("caída"); });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.motivo).toContain("no contesta");
  });

  it("salud lee los dispositivos y su VRAM; en caída motivón", async () => {
    const ok = await salud("http://127.0.0.1:8188", async () => RES(200, { devices: [{ name: "cuda:0", type: "cuda", vram_total: 8_589_934_592, vram_free: 4_294_967_296 }] }));
    expect(ok.ok && ok.salud.dispositivos[0]).toMatchObject({ nombre: "cuda:0", tipo: "cuda", vramTotalBytes: 8_589_934_592, vramLibreBytes: 4_294_967_296 });
    const cae = await salud("http://127.0.0.1:8188", async () => { throw new Error("x"); });
    expect(cae.ok).toBe(false);
  });

  it("urlView codifica con URLSearchParams y trims la base", () => {
    expect(urlView("http://b:8188/", { filename: "a b.png", subfolder: "sub/x", type: "temp" })).toBe("http://b:8188/view?filename=a+b.png&subfolder=sub%2Fx&type=temp");
  });

  it("pedirInterrupcion devuelve true solo si ComfyUI contesta ok", async () => {
    expect(await pedirInterrupcion("http://b:8188", async () => RES(200, {}))).toBe(true);
    expect(await pedirInterrupcion("http://b:8188", async () => RES(500, {}))).toBe(false);
    expect(await pedirInterrupcion("http://b:8188", async () => { throw new Error("x"); })).toBe(false);
  });
});
