/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA DEL NAVEGADOR (IMG1011H · parte 2 de 3: el worker).
 * Contrato: architecture/astraura-imagenes.md §1 y §8. Implementa `MotorSDTurbo` (parte 1,
 * webgpu-sd-turbo.ts) con onnxruntime-web + WebGPU, a partir del ejemplo oficial de Microsoft
 * (onnxruntime-inference-examples/js/sd-turbo, MIT): texto → CLIP → UNet de un paso → VAE.
 *
 * onnxruntime-web NO es una dependencia del repo (no se toca package.json): se carga en el worker, a demanda,
 * desde jsDelivr con la versión EXACTA fijada en la parte 1 (VERSION_ONNXRUNTIME_WEB), igual que el tokenizador
 * (transformers.js). Así ni tsc ni el paquete del navegador dependen de ellos. Nada se descarga solo: este
 * archivo solo baja pesos cuando la orden `descargarPesos` llega, y esa orden la manda el flujo
 * `generaEnPestana` únicamente tras el permiso de la persona y la comprobación del triple de espacio.
 *
 * HONESTIDAD: escrito sin GPU a mano; lo que no se pudo probar aquí (la inferencia real) se prueba en un
 * navegador con WebGPU + shader-f16. Si algo falla, el error sale en claro y el flujo cae a las demás capas.
 */
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO,
  TOKENIZER_CLIP_SD_TURBO, VERSION_ONNXRUNTIME_WEB,
  type ImagenSDTurbo, type MotorSDTurbo, type PeticionSDTurbo, type SondasWebGPU,
} from "./webgpu-sd-turbo";

const URL_ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSION_ONNXRUNTIME_WEB}/dist/`;
const URL_TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

/** Constantes del planificador de SD-Turbo (un solo paso, sigma inicial y factor del VAE). */
const SIGMA = 14.6146;
const FACTOR_VAE = 0.18215;
const LADO = 512;
const LADO_LATENTE = LADO / 8;
const LARGO_TEXTO = 77;

// ── Utilidades puras (exportadas para probarlas sin GPU) ───────────────────────────────────────────────

/** float32 → float16 (bits IEEE 754, redondeo al más cercano simple). */
export function f32AF16(x: number): number {
  const f = new Float32Array(1); const u = new Uint32Array(f.buffer);
  f[0] = x; const v = u[0]!;
  const signo = (v >>> 16) & 0x8000; let exp = ((v >>> 23) & 0xff) - 127 + 15; let man = v & 0x7fffff;
  if (((v >>> 23) & 0xff) === 0xff) return signo | 0x7c00 | (man ? 0x200 : 0);
  if (exp >= 0x1f) return signo | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return signo;
    man = (man | 0x800000) >> (1 - exp);
    return signo | ((man + 0x1000) >> 13);
  }
  return signo | (exp << 10) | ((man + 0x1000) >> 13);
}

/** float16 (bits) → float32. */
export function f16AF32(h: number): number {
  const signo = h & 0x8000 ? -1 : 1; const exp = (h >> 10) & 0x1f; const man = h & 0x3ff;
  if (exp === 0) return signo * 2 ** -14 * (man / 1024);
  if (exp === 0x1f) return man ? NaN : signo * Infinity;
  return signo * 2 ** (exp - 15) * (1 + man / 1024);
}

/** Generador determinista (mulberry32): la misma semilla da el mismo ruido. */
export function aleatorioConSemilla(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido gaussiano N(0, escala²) de `n` valores (Box-Muller), determinista por semilla. */
export function ruidoGaussiano(n: number, semilla: number, escala: number): Float32Array {
  const azar = aleatorioConSemilla(semilla); const out = new Float32Array(n);
  for (let i = 0; i < n; i += 2) {
    const r = Math.sqrt(-2 * Math.log(Math.max(azar(), 1e-12))); const a = 2 * Math.PI * azar();
    out[i] = r * Math.cos(a) * escala;
    if (i + 1 < n) out[i + 1] = r * Math.sin(a) * escala;
  }
  return out;
}

/** Salida del VAE (CHW, rango [-1, 1]) → píxeles RGBA de 8 bits. */
export function chwARgba(chw: ArrayLike<number>, ancho: number, alto: number): Uint8Array {
  const plano = ancho * alto; const out = new Uint8Array(plano * 4);
  const aByte = (v: number) => Math.max(0, Math.min(255, Math.round((v / 2 + 0.5) * 255)));
  for (let i = 0; i < plano; i++) {
    out[i * 4] = aByte(chw[i]!); out[i * 4 + 1] = aByte(chw[plano + i]!); out[i * 4 + 2] = aByte(chw[2 * plano + i]!); out[i * 4 + 3] = 255;
  }
  return out;
}

// ── Tipos mínimos de onnxruntime-web (no se importa el paquete) ────────────────────────────────────────
interface TensorOrt { type: string; dims: readonly number[]; getData(): Promise<ArrayLike<number> | ArrayLike<bigint>>; dispose?(): void }
interface SesionOrt { run(entradas: Record<string, TensorOrt>): Promise<Record<string, TensorOrt>>; release?(): Promise<void> }
export interface OrtWeb {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  Tensor: new (tipo: string, datos: ArrayLike<number> | ArrayLike<bigint> | Uint16Array, dims: number[]) => TensorOrt;
  InferenceSession: { create(modelo: Uint8Array, opciones: Record<string, unknown>): Promise<SesionOrt> };
}
type Tokenizador = (texto: string, opc: Record<string, unknown>) => { input_ids: number[] };
export interface Cargadores {
  ort: () => Promise<OrtWeb>;
  tokenizador: () => Promise<Tokenizador>;
}

/** Importa un módulo ESM por URL sin que el empaquetador lo intente resolver. */
const importaUrl = <T,>(url: string): Promise<T> => import(/* webpackIgnore: true */ /* @vite-ignore */ url) as Promise<T>;

export const CARGADORES_REALES: Cargadores = {
  async ort() {
    const ort = await importaUrl<OrtWeb>(`${URL_ORT}ort.webgpu.min.mjs`);
    ort.env.wasm.wasmPaths = URL_ORT; ort.env.wasm.numThreads = 1;
    return ort;
  },
  async tokenizador() {
    const { AutoTokenizer, env } = await importaUrl<{ AutoTokenizer: { from_pretrained(id: string): Promise<Tokenizador> }; env: { allowLocalModels: boolean } }>(`${URL_TRANSFORMERS}/dist/transformers.min.js`);
    env.allowLocalModels = false;
    return AutoTokenizer.from_pretrained(TOKENIZER_CLIP_SD_TURBO);
  },
};

type Avisar = (progreso: { hecho: number; total: number; archivo: string }) => void;

/** El motor real: WebGPU + caché del navegador. Una instancia por worker. */
export class MotorOrtSDTurbo implements MotorSDTurbo {
  private ort: OrtWeb | null = null;
  private sesiones: Record<string, SesionOrt> = {};
  private tok: Tokenizador | null = null;
  constructor(private readonly cargadores: Cargadores = CARGADORES_REALES, private readonly avisar: Avisar = () => {}) {}

  async sondear(): Promise<SondasWebGPU> {
    const gpu = (globalThis as { navigator?: { gpu?: { requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null> } } }).navigator?.gpu;
    if (!gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
    try {
      const adaptador = await gpu.requestAdapter();
      if (!adaptador) return { hayWebGPU: true, hayAdaptador: false, f16: false };
      return { hayWebGPU: true, hayAdaptador: true, f16: adaptador.features.has("shader-f16") };
    } catch { return { hayWebGPU: true, hayAdaptador: false, f16: false }; }
  }

  async hayPesosEnCache(): Promise<boolean> {
    try {
      if (typeof caches === "undefined") return false;
      const cache = await caches.open(CACHE_PESOS_SD_TURBO);
      for (const p of PESOS_SD_TURBO) {
        const r = await cache.match(`${REPO_ONNX_SD_TURBO}/${p.ruta}`);
        if (!r) return false;
        const largo = Number(r.headers.get("content-length"));
        if (Number.isFinite(largo) && largo > 0 && largo !== p.bytes) return false;
      }
      return true;
    } catch { return false; }
  }

  async cuotaLibre(): Promise<number | null> {
    try {
      const est = await (globalThis as { navigator?: { storage?: { estimate(): Promise<{ quota?: number; usage?: number }> } } }).navigator?.storage?.estimate();
      if (!est || typeof est.quota !== "number") return null;
      return Math.max(0, est.quota - (est.usage ?? 0));
    } catch { return null; }
  }

  /** Baja SOLO los tres archivos necesarios, uno a uno, a la caché del navegador, con progreso. */
  async descargarPesos(): Promise<void> {
    if (typeof caches === "undefined") throw new Error("este navegador no tiene Cache API para guardar los pesos");
    const cache = await caches.open(CACHE_PESOS_SD_TURBO);
    let hecho = 0;
    for (const p of PESOS_SD_TURBO) {
      const url = `${REPO_ONNX_SD_TURBO}/${p.ruta}`;
      const previo = await cache.match(url);
      if (previo && Number(previo.headers.get("content-length")) === p.bytes) { hecho += p.bytes; continue; }
      const r = await fetch(url);
      if (!r.ok || !r.body) throw new Error(`${p.ruta}: el servidor contestó ${r.status}`);
      const lector = r.body.getReader(); const trozos: Uint8Array[] = []; let archivo = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        trozos.push(value); archivo += value.byteLength;
        this.avisar({ hecho: hecho + archivo, total: BYTES_PESOS_SD_TURBO, archivo: p.ruta });
      }
      if (archivo !== p.bytes) throw new Error(`${p.ruta}: llegaron ${archivo} bytes y se esperaban ${p.bytes}; no se guarda un archivo incompleto`);
      await cache.put(url, new Response(new Blob(trozos as BlobPart[]), { headers: { "content-length": String(p.bytes) } }));
      hecho += p.bytes;
    }
  }

  private async sesion(nombre: string, ruta: string): Promise<SesionOrt> {
    const ya = this.sesiones[nombre]; if (ya) return ya;
    const ort = this.ort ??= await this.cargadores.ort();
    const cache = await caches.open(CACHE_PESOS_SD_TURBO);
    const r = await cache.match(`${REPO_ONNX_SD_TURBO}/${ruta}`);
    if (!r) throw new Error(`faltan los pesos ${ruta} en la caché`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const s = await ort.InferenceSession.create(bytes, {
      executionProviders: ["webgpu"], enableMemPattern: false, enableCpuMemArena: false,
      graphOptimizationLevel: "all",
      extra: { session: { disable_prepacking: "1", use_device_allocator_for_initializers: "1" } },
    });
    return (this.sesiones[nombre] = s);
  }

  /** Datos → tensor del tipo que pida el modelo (los pesos de SD-Turbo son float16 en el ejemplo). */
  private tensor(ort: OrtWeb, tipo: string, datos: Float32Array, dims: number[]): TensorOrt {
    if (tipo !== "float16") return new ort.Tensor("float32", datos, dims);
    const h = new Uint16Array(datos.length); for (let i = 0; i < datos.length; i++) h[i] = f32AF16(datos[i]!);
    return new ort.Tensor("float16", h, dims);
  }
  private async aFloat32(t: TensorOrt): Promise<Float32Array> {
    const d = await t.getData();
    if (t.type === "float16") { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = f16AF32(Number(d[i])); return o; }
    return Float32Array.from(d as ArrayLike<number>);
  }

  async generar(peticion: PeticionSDTurbo): Promise<ImagenSDTurbo> {
    const ort = this.ort ??= await this.cargadores.ort();
    this.tok ??= await this.cargadores.tokenizador();
    const ids = this.tok(peticion.prompt, { padding: "max_length", max_length: LARGO_TEXTO, truncation: true, return_tensor: false }).input_ids;
    const textoEnc = await this.sesion("texto", "text_encoder/model.onnx");
    const unet = await this.sesion("unet", "unet/model.onnx");
    const vae = await this.sesion("vae", "vae_decoder/model.onnx");

    const entrada = Int32Array.from(ids.slice(0, LARGO_TEXTO));
    const oculto = (await textoEnc.run({ input_ids: new ort.Tensor("int32", entrada, [1, LARGO_TEXTO]) })).last_hidden_state;
    if (!oculto) throw new Error("el codificador de texto no devolvió last_hidden_state");

    const n = 4 * LADO_LATENTE * LADO_LATENTE;
    const latente = ruidoGaussiano(n, peticion.semilla, SIGMA);
    const escala = 1 / Math.sqrt(SIGMA * SIGMA + 1);
    const entradaUnet = new Float32Array(n); for (let i = 0; i < n; i++) entradaUnet[i] = latente[i]! * escala;
    const salidaUnet = await unet.run({
      sample: this.tensor(ort, "float16", entradaUnet, [1, 4, LADO_LATENTE, LADO_LATENTE]),
      timestep: new ort.Tensor("int64", [BigInt(999)], [1]),
      encoder_hidden_states: oculto,
    });
    const pred = await this.aFloat32(salidaUnet.out_sample ?? Object.values(salidaUnet)[0]!);
    // Paso del planificador (euler ancestral de un solo paso): x0 = x - sigma · ε, y a la escala del VAE.
    const x0 = new Float32Array(n); for (let i = 0; i < n; i++) x0[i] = (latente[i]! - SIGMA * pred[i]!) / FACTOR_VAE;
    const salidaVae = await vae.run({ latent_sample: this.tensor(ort, "float16", x0, [1, 4, LADO_LATENTE, LADO_LATENTE]) });
    const chw = await this.aFloat32(salidaVae.sample ?? Object.values(salidaVae)[0]!);
    return { ancho: LADO, alto: LADO, pixeles: chwARgba(chw, LADO, LADO), motor: "sd-turbo · onnxruntime-web · webgpu" };
  }
}

// ── Protocolo de mensajes con el hilo principal ────────────────────────────────────────────────────────
export type OrdenWorker =
  | { id: number; tipo: "sondear" | "hayPesosEnCache" | "cuotaLibre" | "descargarPesos" }
  | { id: number; tipo: "generar"; peticion: PeticionSDTurbo };
export type RespuestaWorker =
  | { id: number; ok: true; valor: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progreso: { hecho: number; total: number; archivo: string } };

/** Atiende una orden con el motor dado y responde por `responder`. Separado del `self` para poder probarlo. */
export async function atenderOrden(motor: MotorSDTurbo, orden: OrdenWorker, responder: (r: RespuestaWorker) => void): Promise<void> {
  try {
    let valor: unknown;
    if (orden.tipo === "sondear") valor = await motor.sondear();
    else if (orden.tipo === "hayPesosEnCache") valor = await motor.hayPesosEnCache();
    else if (orden.tipo === "cuotaLibre") valor = await motor.cuotaLibre();
    else if (orden.tipo === "descargarPesos") { await motor.descargarPesos(); valor = null; }
    else if (orden.tipo === "generar") valor = await motor.generar(orden.peticion);
    else throw new Error("orden desconocida");
    responder({ id: orden.id, ok: true, valor });
  } catch (e) {
    responder({ id: orden.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Solo dentro de un worker de verdad (en pruebas o en el hilo principal este módulo no hace nada al importarse). */
interface AmbitoWorker { postMessage(m: unknown): void; onmessage: ((e: { data: OrdenWorker }) => void) | null }
const global = globalThis as unknown as Partial<AmbitoWorker> & { WorkerGlobalScope?: unknown; document?: unknown };
if (typeof global.WorkerGlobalScope !== "undefined" && typeof global.document === "undefined" && typeof global.postMessage === "function") {
  let idActual = 0;
  const motor = new MotorOrtSDTurbo(CARGADORES_REALES, (progreso) => global.postMessage!({ id: idActual, progreso } satisfies RespuestaWorker));
  global.onmessage = (e) => { idActual = e.data.id; void atenderOrden(motor, e.data, (r) => global.postMessage!(r)); };
}
