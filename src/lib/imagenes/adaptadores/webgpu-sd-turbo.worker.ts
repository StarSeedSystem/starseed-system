/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA DEL NAVEGADOR (IMG1011H · parte 2 de 3: el worker).
 * Contrato: architecture/astraura-imagenes.md §1 y §8. Reglas del flujo en webgpu-sd-turbo.ts (parte 1).
 *
 * Basado en el ejemplo oficial de Microsoft (onnxruntime-inference-examples/js/sd-turbo, MIT): texto →
 * CLIP → UNet de un paso (euler, sigma 14,6146) → VAE → píxeles, con onnxruntime-web y WebGPU.
 *
 * Decisiones:
 *  - onnxruntime-web y el tokenizador CLIP NO están en package.json (no se tocan dependencias en esta parte):
 *    se cargan en el worker con `import()` desde jsDelivr con versión EXACTA, solo cuando hay permiso y WebGPU
 *    con f16. La parte 3 puede instalarlos y cambiar solo `cargarOrt`/`cargarTokenizador`.
 *  - Nada se descarga solo: `descargar` exige `permisoDescarga` en el mensaje y comprueba el espacio (triple).
 *  - Los pesos se guardan en la Cache API del navegador y se leen de ahí.
 *  - Este archivo solo habla con la pestaña por mensajes; la lógica del flujo es `generaEnPestana`.
 */
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO, TOKENIZER_CLIP_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB, generaEnPestana,
  type ImagenSDTurbo, type MotorSDTurbo, type PeticionSDTurbo, type ResultadoSDTurbo, type SondasWebGPU,
} from "./webgpu-sd-turbo";

/** Mensajes pestaña → worker. */
export type MensajeAlWorker =
  | { tipo: "generar"; id: number; peticion: PeticionSDTurbo }
  | { tipo: "sondear"; id: number };
/** Mensajes worker → pestaña. */
export type MensajeDelWorker =
  | { tipo: "resultado"; id: number; resultado: ResultadoSDTurbo }
  | { tipo: "sondas"; id: number; sondas: SondasWebGPU }
  | { tipo: "progreso"; id: number; etapa: "descarga" | "carga" | "texto" | "unet" | "vae"; fraccion: number };

/** Lo mínimo de onnxruntime-web que usamos (tipos locales: el paquete no está instalado). */
interface TensorOrt { data: ArrayLike<number | bigint>; dims: readonly number[]; dispose?(): void }
interface SesionOrt { run(entradas: Record<string, TensorOrt>): Promise<Record<string, TensorOrt>>; release?(): Promise<void> }
interface OrtWeb {
  env: { wasm: { numThreads?: number }; webgpu?: unknown };
  Tensor: new (tipo: string, datos: ArrayBufferView, dims: readonly number[]) => TensorOrt;
  InferenceSession: { create(modelo: Uint8Array, opciones: { executionProviders: string[]; freeDimensionOverrides?: Record<string, number> }): Promise<SesionOrt> };
}
type Tokenizador = (texto: string, opciones: { padding: string; max_length: number; truncation: boolean }) => { input_ids: { data: ArrayLike<number | bigint> } };

const URL_ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSION_ONNXRUNTIME_WEB}/dist/ort.webgpu.min.mjs`;
const URL_TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";
/** `webpackIgnore`: Next no intenta empaquetar una URL; el navegador la importa en tiempo de ejecución. */
const importarUrl = <T>(url: string): Promise<T> => import(/* webpackIgnore: true */ url) as Promise<T>;

const SIGMA = 14.6146;
const FACTOR_VAE = 0.18215;
const LADO = 512;
const LATENTE = LADO / 8;
const TOKENS = 77;

// --- Medias precisiones (f16) sin depender de Float16Array, que no está en todos los navegadores ---
export function f32AMitad(v: number): number {
  const f = new Float32Array(1); const u = new Uint32Array(f.buffer);
  f[0] = v; const x = u[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15; const m = x & 0x7fffff;
  if (Number.isNaN(v)) return 0x7e00;
  if (e >= 31) return s | 0x7c00;
  if (e <= 0) { if (e < -10) return s; return s | ((m | 0x800000) >> (14 - e)); }
  return s | (e << 10) | (m >> 13);
}
export function mitadAF32(h: number): number {
  const s = h & 0x8000 ? -1 : 1; const e = (h >> 10) & 0x1f; const m = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + m / 1024);
}

/** Normal estándar determinista por semilla (mulberry32 + Box-Muller): misma semilla, misma imagen. */
export function ruidoNormal(n: number, semilla: number): Float32Array {
  let a = semilla >>> 0;
  const unif = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = new Float32Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(unif(), 1e-12), v = unif(); const k = Math.sqrt(-2 * Math.log(u));
    r[i] = k * Math.cos(2 * Math.PI * v); if (i + 1 < n) r[i + 1] = k * Math.sin(2 * Math.PI * v);
  }
  return r;
}

/** Un paso de euler de SD-Turbo: devuelve la entrada del UNet y, con su salida, el latente limpio. */
export function entradaUnet(latente: Float32Array): Float32Array {
  const k = 1 / Math.sqrt(SIGMA * SIGMA + 1); return latente.map((x) => x * k);
}
export function latenteLimpio(latente: Float32Array, salidaUnet: Float32Array): Float32Array {
  const r = new Float32Array(latente.length);
  for (let i = 0; i < r.length; i++) r[i] = (latente[i] - SIGMA * salidaUnet[i]) / FACTOR_VAE;
  return r;
}
/** Salida del VAE (-1..1, planar RGB) → píxeles RGBA 8 bits. */
export function aPixelesRgba(planar: Float32Array, ancho: number, alto: number): Uint8Array {
  const n = ancho * alto; const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round((planar[c * n + i] / 2 + 0.5) * 255)));
    out[i * 4 + 3] = 255;
  }
  return out;
}

const aMitades = (f: Float32Array): Uint16Array => Uint16Array.from(f, f32AMitad);
const deMitades = (d: ArrayLike<number | bigint>): Float32Array => Float32Array.from(d as ArrayLike<number>, (h) => mitadAF32(h));

/** Motor real: onnxruntime-web (WebGPU) + Cache API. Se construye en el worker; `progreso` informa a la pestaña. */
export function crearMotorReal(progreso: (etapa: "descarga" | "carga" | "texto" | "unet" | "vae", fraccion: number) => void): MotorSDTurbo {
  let ort: OrtWeb | null = null; let tokenizar: Tokenizador | null = null;
  const sesiones: Record<string, SesionOrt> = {};
  const nav = (self as unknown as { navigator: Navigator & { gpu?: { requestAdapter(): Promise<{ features: { has(n: string): boolean } } | null> } } }).navigator;

  const cargarOrt = async (): Promise<OrtWeb> => ort ??= await importarUrl<OrtWeb>(URL_ORT);
  const cargarTokenizador = async (): Promise<Tokenizador> => {
    if (tokenizar) return tokenizar;
    const t = await importarUrl<{ AutoTokenizer: { from_pretrained(id: string): Promise<Tokenizador> }; env: { allowLocalModels: boolean } }>(URL_TRANSFORMERS);
    t.env.allowLocalModels = false;
    return (tokenizar = await t.AutoTokenizer.from_pretrained(TOKENIZER_CLIP_SD_TURBO));
  };
  const peso = async (ruta: string): Promise<Uint8Array> => {
    const cache = await caches.open(CACHE_PESOS_SD_TURBO);
    const r = await cache.match(`${REPO_ONNX_SD_TURBO}/${ruta}`);
    if (!r) throw new Error(`falta ${ruta} en la caché: hay que descargar los pesos`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const sesion = async (nombre: string, ruta: string): Promise<SesionOrt> => {
    if (sesiones[nombre]) return sesiones[nombre];
    const o = await cargarOrt();
    return (sesiones[nombre] = await o.InferenceSession.create(await peso(ruta), {
      executionProviders: ["webgpu"],
      freeDimensionOverrides: nombre === "unet" ? { batch_size: 1, num_channels_latent: 4, height_latent: LATENTE, width_latent: LATENTE, sequence_length: TOKENS } : undefined,
    }));
  };

  return {
    async sondear() {
      if (!nav.gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
      const ad = await nav.gpu.requestAdapter().catch(() => null);
      return { hayWebGPU: true, hayAdaptador: !!ad, f16: !!ad && ad.features.has("shader-f16") };
    },
    async hayPesosEnCache() {
      if (typeof caches === "undefined") return false;
      const cache = await caches.open(CACHE_PESOS_SD_TURBO);
      for (const p of PESOS_SD_TURBO) if (!(await cache.match(`${REPO_ONNX_SD_TURBO}/${p.ruta}`))) return false;
      return true;
    },
    async cuotaLibre() {
      const e = await nav.storage?.estimate?.().catch(() => null);
      return e && typeof e.quota === "number" && typeof e.usage === "number" ? Math.max(0, e.quota - e.usage) : null;
    },
    async descargarPesos() {
      if (typeof caches === "undefined") throw new Error("este navegador no tiene Cache API");
      const cache = await caches.open(CACHE_PESOS_SD_TURBO);
      let hechos = 0;
      for (const p of PESOS_SD_TURBO) {
        const url = `${REPO_ONNX_SD_TURBO}/${p.ruta}`;
        if (await cache.match(url)) { hechos += p.bytes; progreso("descarga", hechos / BYTES_PESOS_SD_TURBO); continue; }
        const r = await fetch(url);
        if (!r.ok || !r.body) throw new Error(`${p.ruta}: respuesta ${r.status}`);
        // Se cuenta lo que llega mientras se guarda; si se corta, no se guarda a medias.
        let recibidos = 0;
        const medido = r.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(c, ctl) { recibidos += c.byteLength; progreso("descarga", (hechos + recibidos) / BYTES_PESOS_SD_TURBO); ctl.enqueue(c); } }));
        await cache.put(url, new Response(medido, { headers: { "content-type": "application/octet-stream" } }));
        hechos += p.bytes;
      }
    },
    async generar(peticion: PeticionSDTurbo): Promise<ImagenSDTurbo> {
      const o = await cargarOrt(); const tok = await cargarTokenizador();
      progreso("carga", 0);
      const [enc, unet, vae] = [await sesion("texto", "text_encoder/model.onnx"), await sesion("unet", "unet/model.onnx"), await sesion("vae", "vae_decoder/model.onnx")];
      progreso("carga", 1);
      const ids = Int32Array.from(tok(peticion.prompt, { padding: "max_length", max_length: TOKENS, truncation: true }).input_ids.data as ArrayLike<number>);
      progreso("texto", 0);
      const texto = (await enc.run({ input_ids: new o.Tensor("int32", ids, [1, TOKENS]) })).last_hidden_state;
      progreso("unet", 0);
      const latente = ruidoNormal(4 * LATENTE * LATENTE, peticion.semilla).map((x) => x * SIGMA);
      const salida = (await unet.run({
        sample: new o.Tensor("float16", aMitades(entradaUnet(latente)), [1, 4, LATENTE, LATENTE]),
        timestep: new o.Tensor("int64", BigInt64Array.from([BigInt(999)]), [1]),
        encoder_hidden_states: texto,
      })).out_sample;
      progreso("vae", 0);
      const limpio = latenteLimpio(latente, deMitades(salida.data));
      const img = (await vae.run({ latent_sample: new o.Tensor("float16", aMitades(limpio), [1, 4, LATENTE, LATENTE]) })).sample;
      progreso("vae", 1);
      return { ancho: LADO, alto: LADO, pixeles: aPixelesRgba(deMitades(img.data), LADO, LADO), motor: "sd-turbo · onnxruntime-web · webgpu" };
    },
  };
}

// --- Cableado del worker (solo dentro de un worker real) ---
type AlcanceWorker = { postMessage(m: MensajeDelWorker, t?: Transferable[]): void; onmessage: ((e: MessageEvent<MensajeAlWorker>) => void) | null };
// Los workers de módulo no tienen `importScripts`: se reconoce el alcance de worker por su clase global.
const esWorker = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === "function"
  && self instanceof (globalThis as unknown as { WorkerGlobalScope: new () => object }).WorkerGlobalScope;
if (esWorker) {
  const ctx = self as unknown as AlcanceWorker;
  let idActual = 0;
  const motor = crearMotorReal((etapa, fraccion) => ctx.postMessage({ tipo: "progreso", id: idActual, etapa, fraccion }));
  ctx.onmessage = async (e) => {
    const m = e.data; idActual = m.id;
    if (m.tipo === "sondear") { ctx.postMessage({ tipo: "sondas", id: m.id, sondas: await motor.sondear() }); return; }
    let resultado: ResultadoSDTurbo;
    try { resultado = await generaEnPestana(motor, m.peticion); }
    catch (err) { resultado = { ok: false, accion: "error", motivo: err instanceof Error ? err.message : String(err), ms: 0 }; }
    ctx.postMessage({ tipo: "resultado", id: m.id, resultado }, resultado.imagen ? [resultado.imagen.pixeles.buffer] : []);
  };
}
