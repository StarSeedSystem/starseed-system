/**
 * Imágenes locales de Astraura · WEBGPU SD-TURBO (IMG1011H). Contrato: architecture/astraura-imagenes.md §1, §8.
 *
 * Adaptador para la capa «navegador» (la pestaña con WebGPU) que usa el modelo SD-Turbo con
 * ONNX Runtime Web y WebGPU. Solo funciona si hay WebGPU y la persona lo activa.
 * La descarga de los pesos se guarda en la caché del navegador.
 */

import type { HierroImg, SistemaNeurona } from "@/lib/imagenes/sugerencias";
import type { ModeloImagen } from "@/lib/imagenes/modelos";
import type { Cuantizacion } from "@/lib/imagenes/plan";
import type { NeuronaImg } from "@/lib/imagenes/plan";
import type { GeneradorTab } from "@/ai/astraura/media/proveedor-neuronas";
// @ts-ignore
import type { InferenceSession } from "onnxruntime-web/webgpu";
// @ts-ignore
import type { AutoTokenizer } from "@xenova/transformers";
import { registrarGeneradorTab } from "@/ai/astraura/media/proveedor-neuronas";

const MODEL_BASE_URL = "https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main";

// Funciones de detección de hardware del navegador
export function sistemaDesdePlataforma(p: string | null | undefined): SistemaNeurona | null {
  const s = (p ?? "").toLowerCase();
  if (/mac/.test(s)) return "macos";
  if (/win/.test(s)) return "windows";
  if (/android/.test(s)) return "android";
  if (/iphone|ipad|ipod|ios/.test(s)) return "ios";
  if (/linux|cros|x11/.test(s)) return "linux";
  return null;
}
export function gpuDesdeVendor(v: string | null | undefined): HierroImg["gpu"] | null {
  const s = (v ?? "").toLowerCase();
  if (/nvidia/.test(s)) return "nvidia";
  if (/apple/.test(s)) return "apple";
  if (/amd|advanced micro/.test(s)) return "amd";
  return null;
}
const num = (x: unknown): number | null => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
const texto = (x: unknown): string => typeof x === "string" ? x : "";
export interface SondasWeb { webgpu: boolean; vendedorGpu?: string | null; memoriaGB?: number | null; plataforma?: string | null; }
export function hierroDesdeSondasWeb(s: SondasWeb): HierroImg | null {
  const so = sistemaDesdePlataforma(s.plataforma);
  const ram = s.memoriaGB;
  if (!so || typeof ram !== "number" || !Number.isFinite(ram) || ram <= 0) return null;
  return { so, gpu: gpuDesdeVendor(s.vendedorGpu) ?? "ninguna", vramGB: null, ramGB: ram, webgpu: s.webgpu };
}

// Estado
let sessions: Record<string, { sess: InferenceSession }> | null = null;
let tokenizerReady = false;
let tokenizer: AutoTokenizer | null = null;
let ort: any | null = null;

// Carga el tokenizer y los modelos
async function initialize(): Promise<void> {
  if (sessions && tokenizerReady) return;
  try {
// @ts-ignore
    const { AutoTokenizer } = await import("@xenova/transformers");
    tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
    tokenizer.pad_token_id = 0;
    tokenizerReady = true;
// @ts-ignore
    ort = await import("onnxruntime-web/webgpu");
    sessions = {
      unet: { sess: await ort.InferenceSession.create(await (await fetch(`${MODEL_BASE_URL}/unet/model.onnx`)).arrayBuffer()) },
      text_encoder: { sess: await ort.InferenceSession.create(await (await fetch(`${MODEL_BASE_URL}/text_encoder/model.onnx`)).arrayBuffer()) },
      vae_decoder: { sess: await ort.InferenceSession.create(await (await fetch(`${MODEL_BASE_URL}/vae_decoder/model.onnx`)).arrayBuffer()) }
    };
  } catch (e) { throw e; }
}

    // Generación de imagen
    async function generate_image(prompt: string, semilla: number): Promise<string | null> {
      try {
        await initialize();
        const { input_ids } = await tokenizer!(prompt, { padding: true, max_length: 77, truncation: true, return_tensor: false });
        const { last_hidden_state } = await sessions!.text_encoder.sess.run({ "input_ids": new ort.Tensor("int32", input_ids, [1, input_ids.length]) });
        const latent_shape = [1, 4, 64, 64];
        const latent = new ort.Tensor((() => { const data = new Float32Array(1*4*64*64); for (let i = 0; i < data.length; i++) { const u = Math.random(), v = Math.random(), z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); data[i] = z * 14.6146; } return data; })(), latent_shape);
// @ts-ignore
        const scale_model_inputs = (t: ort.Tensor) => { const d_i = t.data, d_o = new Float32Array(d_i.length); const divi = (14.6146 ** 2 + 1) ** 0.5; for (let i = 0; i < d_i.length; i++) d_o[i] = d_i[i] / divi; return new ort.Tensor(d_o, t.dims); };
        const latent_model_input = scale_model_inputs(latent);
        const { out_sample } = await sessions!.unet.sess.run({ "sample": latent_model_input, "timestep": new ort.Tensor("int64", [999], [1]), "encoder_hidden_states": last_hidden_state });
// @ts-ignore
        const step = (model_output: ort.Tensor, sample: ort.Tensor) => { const d_o = new Float32Array(model_output.data.length); const sigma_hat = 14.6146; for (let i = 0; i < model_output.data.length; i++) { const pred = sample.data[i] - sigma_hat * model_output.data[i]; const deriv = (sample.data[i] - pred) / sigma_hat; const dt = 0 - sigma_hat; d_o[i] = (sample.data[i] + deriv * dt) / 0.18215; } return new ort.Tensor(d_o, model_output.dims); };
        const new_latents = step(out_sample, latent);
        const { sample } = await sessions!.vae_decoder.sess.run({ "latent_sample": new_latents });
// @ts-ignore
        const draw_image = (t: ort.Tensor) => { let pix = t.data; for (let i = 0; i < pix.length; i++) { let x = pix[i]; x = x / 2 + 0.5; if (x < 0) x = 0; if (x > 1) x = 1; pix[i] = x; } const imageData = t.toImageData({ tensorLayout: 'NCWH', format: 'RGB' }); const canvas = document.createElement('canvas'); canvas.width = imageData.width; canvas.height = imageData.height; const ctx = canvas.getContext('2d')!; ctx.putImageData(imageData, 0, 0); return canvas.toDataURL('image/png'); };
        const imageUrl = draw_image(sample);
        last_hidden_state.dispose();
        return imageUrl;
      } catch { return null; }
    }

// Exportar la función que crea y registra el generadorTab
export async function setupWebgpuSdTurboAdapter(): Promise<void> {
  const genTab = await crearGeneradorTab();
  registrarGeneradorTab(genTab);
}
export function isWebgpuAvailable(): boolean { return typeof window !== "undefined" && !!("gpu" in navigator); }
export async function crearGeneradorTab(): Promise<GeneradorTab> {
  if (typeof window === "undefined" || !("gpu" in navigator)) throw new Error("WebGPU no disponible");
  return async (prompt: string, semilla: number): Promise<{ url?: string; ref?: string } | null> => {
    const url = await generate_image(prompt, semilla);
    return url ? { url } : null;
  };
}