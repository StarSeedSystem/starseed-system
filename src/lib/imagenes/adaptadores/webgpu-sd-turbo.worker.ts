/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA DEL NAVEGADOR (IMG1011H · parte 2 de 3: el worker).
 * Contrato: architecture/astraura-imagenes.md §1 y §8. Sigue el ejemplo oficial de Microsoft
 * (onnxruntime-inference-examples/js/sd-turbo, MIT): texto → text_encoder → un paso de unet → vae_decoder.
 *
 * Aquí vive el MOTOR real (`MotorSDTurbo`, definido en webgpu-sd-turbo.ts) y el protocolo de mensajes del
 * worker. onnxruntime-web y el tokenizador CLIP NO están en package.json: se cargan en el worker, a demanda
 * y con versión EXACTA, desde jsDelivr (solo si la persona activó la capa y hay WebGPU con f16). Nada se
 * descarga sin permiso: los pesos (unos 2,5 GB) los pide el flujo `generaEnPestana` y quedan en la Cache API.
 * Sin WebGPU no se carga nada: el flujo lo dice y se usan las demás capas.
 */
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO, TOKENIZER_CLIP_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB, generaEnPestana,
  type ImagenSDTurbo, type MotorSDTurbo, type PeticionSDTurbo, type ResultadoSDTurbo, type SondasWebGPU,
} from "./webgpu-sd-turbo";

/** Versión exacta del tokenizador de transformers.js que usa el ejemplo de Microsoft. */
export const VERSION_TRANSFORMERS_JS = "2.17.2";
export const URL_ONNXRUNTIME_WEB = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSION_ONNXRUNTIME_WEB}/dist/ort.webgpu.min.mjs`;
export const URL_TRANSFORMERS_JS = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${VERSION_TRANSFORMERS_JS}`;

const LADO = 512, LATENTE = 64, TOKENS = 77, SIGMA = 14.6146, ESCALA_VAE = 0.18215, TIMESTEP = 999;

/* ---------- matemática pura (se prueba sin GPU) ---------- */

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** float32 → bits de float16 (redondeo al más cercano, sin NaN especiales). */
export function aF16(x: number): number {
  f32[0] = x; const b = u32[0];
  const s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 0xff) - 127 + 15, m = b & 0x7fffff;
  if (e >= 31) return s | 0x7c00;
  if (e <= 0) { if (e < -10) return s; return s | ((m | 0x800000) >> (14 - e)); }
  return s | (e << 10) | ((m + 0x1000) >> 13);
}
/** bits de float16 → float32. */
export function deF16(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/** Generador con semilla (mulberry32): la misma semilla da el mismo ruido. */
export function aleatorioSemilla(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Ruido normal (Box-Muller) con la semilla dada. */
export function ruidoNormal(n: number, semilla: number): Float32Array {
  const r = aleatorioSemilla(semilla), o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  return o;
}
/** Latente inicial ya escalado para el unet (x·σ / √(σ²+1)) y sin escalar (para el paso final). */
export function latenteInicial(semilla: number): { entrada: Float32Array; latente: Float32Array } {
  const latente = ruidoNormal(4 * LATENTE * LATENTE, semilla).map((v) => v * SIGMA);
  const k = 1 / Math.sqrt(SIGMA * SIGMA + 1);
  return { latente, entrada: latente.map((v) => v * k) };
}
/** Un solo paso: x0 = latente − σ·ruido_predicho, ya dividido por el factor del VAE. */
export function pasoFinal(latente: Float32Array, ruidoPred: Float32Array): Float32Array {
  return latente.map((v, i) => (v - SIGMA * ruidoPred[i]) / ESCALA_VAE);
}
/** Salida del VAE (planar CHW, rango −1..1) → píxeles RGBA 8 bits. */
export function aPixelesRGBA(chw: Float32Array, ancho: number, alto: number): Uint8Array {
  const px = new Uint8Array(ancho * alto * 4), plano = ancho * alto;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round((v / 2 + 0.5) * 255)));
  for (let i = 0; i < plano; i++) {
    px[i * 4] = c(chw[i]); px[i * 4 + 1] = c(chw[plano + i]); px[i * 4 + 2] = c(chw[2 * plano + i]); px[i * 4 + 3] = 255;
  }
  return px;
}

/* ---------- carga a demanda y motor real ---------- */

// Tipos mínimos de lo poco que se usa de onnxruntime-web (no está instalado: sin tipos propios).
interface TensorOrt { data: ArrayLike<number>; type: string; dims: readonly number[] }
interface SesionOrt { run(entradas: Record<string, unknown>): Promise<Record<string, TensorOrt>>; release?: () => Promise<void> }
interface OrtWeb {
  InferenceSession: { create(m: ArrayBuffer, o: Record<string, unknown>): Promise<SesionOrt> };
  Tensor: new (tipo: string, datos: ArrayBufferView | BigInt64Array, dims: readonly number[]) => TensorOrt;
  env: { wasm: { numThreads?: number; proxy?: boolean } };
}
type Tokenizador = (t: string, o: Record<string, unknown>) => Promise<{ input_ids: { data: ArrayLike<number | bigint> } }>;

const importaUrl = (url: string): Promise<Record<string, unknown>> => import(/* webpackIgnore: true */ url);

export interface Cargadores {
  ort: () => Promise<OrtWeb>;
  tokenizador: () => Promise<Tokenizador>;
}
export const CARGADORES_NUBE: Cargadores = {
  ort: async () => (await importaUrl(URL_ONNXRUNTIME_WEB)) as unknown as OrtWeb,
  tokenizador: async () => {
    const t = (await importaUrl(`${URL_TRANSFORMERS_JS}/dist/transformers.min.js`)) as unknown as {
      AutoTokenizer: { from_pretrained(id: string): Promise<Tokenizador> };
    };
    return t.AutoTokenizer.from_pretrained(TOKENIZER_CLIP_SD_TURBO);
  },
};

type Aviso = (mensaje: string) => void;
const urlPeso = (ruta: string) => `${REPO_ONNX_SD_TURBO}/${ruta}`;

/** Motor real: onnxruntime-web con WebGPU. Las sesiones se crean al generar, no antes. */
export function crearMotorWebGPU(aviso: Aviso = () => {}, cargadores: Cargadores = CARGADORES_NUBE): MotorSDTurbo {
  let ort: OrtWeb | null = null;
  const nav = (globalThis as unknown as { navigator?: { gpu?: { requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null> }; storage?: { estimate(): Promise<{ quota?: number; usage?: number }> } } }).navigator;
  const cache = () => (globalThis as unknown as { caches: { open(n: string): Promise<{ match(u: string): Promise<Response | undefined>; put(u: string, r: Response): Promise<void> }> } }).caches.open(CACHE_PESOS_SD_TURBO);

  const sesion = async (ruta: string): Promise<SesionOrt> => {
    const r = await (await cache()).match(urlPeso(ruta));
    if (!r) throw new Error(`falta ${ruta} en la caché`);
    aviso(`Cargando ${ruta} en la GPU…`);
    return ort!.InferenceSession.create(await r.arrayBuffer(), { executionProviders: ["webgpu"], freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: LATENTE, width: LATENTE, sequence_length: TOKENS } });
  };
  /** Datos de un tensor de salida como float32, sea f32 o f16. */
  const comoF32 = (t: TensorOrt): Float32Array =>
    t.type === "float16" ? Float32Array.from(t.data as ArrayLike<number>, deF16) : Float32Array.from(t.data as ArrayLike<number>);
  const tensorF16 = (datos: Float32Array, dims: number[]) => new ort!.Tensor("float16", Uint16Array.from(datos, aF16), dims);

  return {
    async sondear(): Promise<SondasWebGPU> {
      if (!nav?.gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
      const ad = await nav.gpu.requestAdapter().catch(() => null);
      return { hayWebGPU: true, hayAdaptador: !!ad, f16: !!ad?.features.has("shader-f16") };
    },
    async hayPesosEnCache() {
      try { const c = await cache(); return (await Promise.all(PESOS_SD_TURBO.map((p) => c.match(urlPeso(p.ruta))))).every(Boolean); }
      catch { return false; }
    },
    async cuotaLibre() {
      try { const e = await nav?.storage?.estimate(); return e?.quota == null ? null : Math.max(0, e.quota - (e.usage ?? 0)); }
      catch { return null; }
    },
    async descargarPesos() {
      const c = await cache();
      for (const p of PESOS_SD_TURBO) {
        if (await c.match(urlPeso(p.ruta))) continue;
        aviso(`Descargando ${p.ruta} (${Math.round(p.bytes / 1048576)} MB de ${Math.round(BYTES_PESOS_SD_TURBO / 1048576)} MB)…`);
        const r = await fetch(urlPeso(p.ruta));
        if (!r.ok) throw new Error(`${p.ruta}: HTTP ${r.status}`);
        await c.put(urlPeso(p.ruta), r);
      }
    },
    async generar(pet: PeticionSDTurbo): Promise<ImagenSDTurbo> {
      ort = await cargadores.ort();
      ort.env.wasm.numThreads = 1;
      const tok = await cargadores.tokenizador();
      aviso("Leyendo el texto…");
      const ids = (await tok(pet.prompt, { padding: "max_length", max_length: TOKENS, truncation: true, return_tensor: false }) as unknown as { input_ids: ArrayLike<number | bigint> }).input_ids;
      const idsI32 = Int32Array.from(Array.from(ids as ArrayLike<number | bigint>, Number));
      const enc = await sesion("text_encoder/model.onnx");
      const texto = (await enc.run({ input_ids: new ort.Tensor("int32", idsI32, [1, TOKENS]) })).last_hidden_state;
      await enc.release?.();
      const unet = await sesion("unet/model.onnx");
      const { latente, entrada } = latenteInicial(pet.semilla);
      aviso("Dibujando (un paso)…");
      const sal = await unet.run({
        sample: tensorF16(entrada, [1, 4, LATENTE, LATENTE]),
        timestep: new ort.Tensor("int64", BigInt64Array.from([BigInt(TIMESTEP)]), [1]),
        encoder_hidden_states: texto,
      });
      await unet.release?.();
      const x0 = pasoFinal(latente, comoF32(sal.out_sample));
      const vae = await sesion("vae_decoder/model.onnx");
      const img = await vae.run({ latent_sample: tensorF16(x0, [1, 4, LATENTE, LATENTE]) });
      await vae.release?.();
      return { ancho: LADO, alto: LADO, pixeles: aPixelesRGBA(comoF32(img.sample), LADO, LADO), motor: `onnxruntime-web ${VERSION_ONNXRUNTIME_WEB} · WebGPU` };
    },
  };
}

/* ---------- protocolo del worker ---------- */

export type MensajeAlWorker = { tipo: "generar"; id: number; peticion: PeticionSDTurbo };
export type MensajeDelWorker =
  | { tipo: "aviso"; id: number; mensaje: string }
  | { tipo: "resultado"; id: number; resultado: ResultadoSDTurbo };

/** Atiende un mensaje con el motor dado y responde por `enviar`. Separado para probarlo sin worker. */
export async function atiendeMensaje(
  m: MensajeAlWorker, enviar: (r: MensajeDelWorker) => void, motorDe: (aviso: Aviso) => MotorSDTurbo = crearMotorWebGPU,
): Promise<void> {
  if (m?.tipo !== "generar") return;
  const motor = motorDe((mensaje) => enviar({ tipo: "aviso", id: m.id, mensaje }));
  enviar({ tipo: "resultado", id: m.id, resultado: await generaEnPestana(motor, m.peticion) });
}

const ambito = globalThis as unknown as { postMessage?: (m: unknown) => void; onmessage?: ((e: { data: MensajeAlWorker }) => void) | null; document?: unknown };
// Solo dentro de un worker (sin `document`): importar este módulo desde la página o las pruebas no engancha nada.
if (typeof ambito.postMessage === "function" && ambito.document === undefined && "WorkerGlobalScope" in globalThis) {
  ambito.onmessage = (e) => { void atiendeMensaje(e.data, (r) => ambito.postMessage!(r)); };
}
