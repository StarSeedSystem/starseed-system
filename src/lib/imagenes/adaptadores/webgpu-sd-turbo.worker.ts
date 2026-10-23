/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA, el WORKER (IMG1011H · parte 2 de 3).
 * Contrato: architecture/astraura-imagenes.md §1 y §8. El flujo y las decisiones puras viven en
 * `webgpu-sd-turbo.ts`; aquí está el MOTOR real, basado en el ejemplo oficial de Microsoft
 * (onnxruntime-inference-examples/js/sd-turbo, MIT): onnxruntime-web con WebGPU dentro de un worker.
 *
 * Cómo se carga: `onnxruntime-web` NO está en package.json (no se tocan dependencias en esta parte), así que
 * se importa en tiempo de ejecución, y solo cuando la persona ya permitió la descarga, desde jsDelivr con la
 * versión EXACTA fijada en VERSION_ONNXRUNTIME_WEB. Ni el bundler ni tsc lo ven. Lo mismo con transformers.js
 * (tokenizador CLIP). Si prefieres empaquetarlo, instala `onnxruntime-web@1.30.0` exacta y cambia `cargarOrt`.
 *
 * Reglas: nada se descarga sin permiso ni sin comprobar el triple de espacio (se repite aquí por seguridad,
 * aunque `generaEnPestana` ya lo decide); los pesos se guardan en la Cache API; no hay claves ni red salvo
 * Hugging Face y la CDN fijada. Los mensajes de error van en español claro.
 */
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO, TOKENIZER_CLIP_SD_TURBO,
  VERSION_ONNXRUNTIME_WEB, detectaSDTurbo, planPesos,
} from "./webgpu-sd-turbo";
import type { ImagenSDTurbo, PeticionSDTurbo, SondasWebGPU } from "./webgpu-sd-turbo";

/* ───────────────────────── protocolo de mensajes ───────────────────────── */

export type OrdenWorkerSDTurbo =
  | { id: number; orden: "sondear" }
  | { id: number; orden: "cache" }
  | { id: number; orden: "cuota" }
  | { id: number; orden: "descargar" }
  | { id: number; orden: "generar"; peticion: PeticionSDTurbo };

export type RespuestaWorkerSDTurbo =
  | { id: number; ok: true; valor: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progreso: { ruta: string; bytes: number; total: number } };

/* ───────────────────────── piezas puras (probables sin GPU) ───────────────────────── */

export const ANCHO_SD_TURBO = 512;
export const ALTO_SD_TURBO = 512;
const LATENTE = 64; // 512 / 8
const CANALES = 4;
const LARGO_TEXTO = 77;
/** Sigma inicial del planificador de SD-Turbo (un solo paso, timestep 999) y escala del VAE. */
export const SIGMA_SD_TURBO = 14.6146;
export const ESCALA_VAE_SD_TURBO = 0.18215;

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da la misma imagen. */
export function aleatorioConSemilla(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido normal estándar (Box-Muller) del tamaño dado. */
export function ruidoNormal(n: number, semilla: number): Float32Array {
  const rnd = aleatorioConSemilla(semilla);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(rnd(), 1e-12);
    const v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  return out;
}

const buf = new DataView(new ArrayBuffer(4));
/** float32 → bits de float16 (redondeo al más cercano; desbordes a infinito, subnormales a cero/subnormal). */
export function aMedio(x: number): number {
  buf.setFloat32(0, x);
  const b = buf.getUint32(0);
  const s = (b >>> 16) & 0x8000;
  const e = (b >>> 23) & 0xff;
  const m = b & 0x7fffff;
  if (e === 0xff) return s | 0x7c00 | (m ? 0x200 : 0);
  const exp = e - 127 + 15;
  if (exp >= 31) return s | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return s;
    const mm = (m | 0x800000) >>> (1 - exp);
    return s | ((mm + 0x1000) >>> 13);
  }
  return s | (exp << 10) | ((m + 0x1000) >>> 13);
}
/** bits de float16 → float32. */
export function deMedio(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >>> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
export const aMedios = (f: ArrayLike<number>): Uint16Array => Uint16Array.from(f as ArrayLike<number>, aMedio);
export const deMedios = (h: ArrayLike<number>): Float32Array => Float32Array.from(h as ArrayLike<number>, deMedio);

/** Imagen RGBA 8 bits desde la salida del VAE (CHW, rango −1…1). */
export function pixelesDesdeVae(chw: Float32Array, ancho: number, alto: number): Uint8Array {
  const plano = ancho * alto;
  const out = new Uint8Array(plano * 4);
  for (let i = 0; i < plano; i++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round((chw[c * plano + i] / 2 + 0.5) * 255);
      out[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Un solo paso de SD-Turbo: la entrada del UNet es ruido·σ/√(σ²+1) y el resultado x₀ = ruido·σ − σ·salida. */
export function entradaUnet(ruido: Float32Array): Float32Array {
  const k = SIGMA_SD_TURBO / Math.sqrt(SIGMA_SD_TURBO ** 2 + 1);
  return ruido.map((x) => x * k);
}
export function latenteFinal(ruido: Float32Array, salidaUnet: Float32Array): Float32Array {
  const out = new Float32Array(ruido.length);
  for (let i = 0; i < out.length; i++) out[i] = (ruido[i] * SIGMA_SD_TURBO - SIGMA_SD_TURBO * salidaUnet[i]) / ESCALA_VAE_SD_TURBO;
  return out;
}

/* ───────────────────────── caché de pesos (Cache API) ───────────────────────── */

const urlPeso = (ruta: string) => `${REPO_ONNX_SD_TURBO}/${ruta}`;

async function hayPesosEnCache(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const c = await caches.open(CACHE_PESOS_SD_TURBO);
  for (const p of PESOS_SD_TURBO) if (!(await c.match(urlPeso(p.ruta)))) return false;
  return true;
}

async function cuotaLibre(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || typeof e.quota !== "number") return null;
    return Math.max(0, e.quota - (e.usage ?? 0));
  } catch { return null; }
}

async function descargarPesos(avisa: (r: { ruta: string; bytes: number; total: number }) => void): Promise<void> {
  // Defensa en profundidad: el triple de espacio se vuelve a comprobar aquí, con permiso ya dado.
  const plan = planPesos({ enCache: false, permiso: true, cuotaLibreBytes: await cuotaLibre() });
  if (plan.accion !== "descargar") throw new Error(plan.motivo);
  const c = await caches.open(CACHE_PESOS_SD_TURBO);
  for (const p of PESOS_SD_TURBO) {
    const url = urlPeso(p.ruta);
    if (await c.match(url)) continue;
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`Hugging Face contestó ${r.status} para ${p.ruta}`);
    const total = Number(r.headers.get("content-length")) || p.bytes;
    const lector = r.body.getReader();
    const trozos: Uint8Array[] = [];
    let leidos = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
      leidos += value.byteLength;
      avisa({ ruta: p.ruta, bytes: leidos, total });
    }
    if (leidos < p.bytes * 0.99) throw new Error(`${p.ruta} llegó incompleto (${leidos} de ${p.bytes} bytes)`);
    await c.put(url, new Response(new Blob(trozos as BlobPart[]), { headers: { "content-length": String(leidos) } }));
  }
}

/* ───────────────────────── motor (onnxruntime-web + transformers.js) ───────────────────────── */

/* Tipos mínimos de lo que se usa; el módulo real se carga en vivo. */
interface TensorOrt { data: ArrayLike<number> | BigInt64Array; dims: readonly number[]; dispose?(): void }
interface SesionOrt {
  run(entradas: Record<string, unknown>): Promise<Record<string, TensorOrt>>;
  inputNames: readonly string[];
  inputMetadata?: unknown;
  release?(): Promise<void>;
}
interface OrtWeb {
  env: { wasm: { wasmPaths?: string; numThreads?: number }; webgpu?: Record<string, unknown> };
  Tensor: new (tipo: string, datos: unknown, dims: readonly number[]) => TensorOrt;
  InferenceSession: { create(datos: Uint8Array, opciones: Record<string, unknown>): Promise<SesionOrt> };
}
interface Tokenizador { (texto: string, o: Record<string, unknown>): Promise<{ input_ids: { data: ArrayLike<number | bigint> } }> }

const CDN_ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSION_ONNXRUNTIME_WEB}/dist/`;
const CDN_TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

/** import() con especificador en variable y sin que el bundler lo toque: se resuelve en el navegador. */
const importaEnVivo = (url: string): Promise<any> => new Function("u", "return import(u)")(url);

interface Motor { ort: OrtWeb; unet: SesionOrt; texto: SesionOrt; vae: SesionOrt; tokenizar: Tokenizador }
let motor: Promise<Motor> | null = null;

async function cargaSesion(ort: OrtWeb, ruta: string, libres: Record<string, number>): Promise<SesionOrt> {
  const r = await (await caches.open(CACHE_PESOS_SD_TURBO)).match(urlPeso(ruta));
  if (!r) throw new Error(`Falta ${ruta} en la caché: hay que bajar los pesos primero.`);
  return ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), {
    executionProviders: ["webgpu"],
    enableMemPattern: false,
    enableCpuMemArena: false,
    graphOptimizationLevel: "all",
    freeDimensionOverrides: libres,
    extra: { session: { disable_prepacking: "1", use_device_allocator_for_initializers: "1" } },
  });
}

function cargarMotor(): Promise<Motor> {
  motor ??= (async () => {
    const ort = (await importaEnVivo(`${CDN_ORT}ort.webgpu.min.mjs`)) as OrtWeb;
    ort.env.wasm.wasmPaths = CDN_ORT;
    ort.env.wasm.numThreads = 1;
    const { AutoTokenizer, env } = await importaEnVivo(`${CDN_TRANSFORMERS}/dist/transformers.min.js`);
    env.allowLocalModels = false;
    const tokenizar = (await AutoTokenizer.from_pretrained(TOKENIZER_CLIP_SD_TURBO)) as Tokenizador;
    const texto = await cargaSesion(ort, "text_encoder/model.onnx", { batch_size: 1 });
    const unet = await cargaSesion(ort, "unet/model.onnx", { batch_size: 1, num_channels: CANALES, height: LATENTE, width: LATENTE, sequence_length: LARGO_TEXTO });
    const vae = await cargaSesion(ort, "vae_decoder/model.onnx", { batch_size: 1, num_channels_latent: CANALES, height_latent: LATENTE, width_latent: LATENTE });
    return { ort, unet, texto, vae, tokenizar };
  })().catch((e) => { motor = null; throw e; });
  return motor;
}

/** ¿Esta entrada del modelo pide float16? Se lee de los metadatos si están; si no, el UNet de este repo es fp16. */
function pideMedio(s: SesionOrt, nombre: string, defecto: boolean): boolean {
  const m = s.inputMetadata as Record<string, { type?: string }> | Array<{ name: string; type?: string }> | undefined;
  const tipo = Array.isArray(m) ? m.find((x) => x.name === nombre)?.type : m?.[nombre]?.type;
  return tipo ? tipo === "float16" : defecto;
}

async function generar(p: PeticionSDTurbo): Promise<ImagenSDTurbo> {
  const { ort, unet, texto, vae, tokenizar } = await cargarMotor();
  const T = (tipo: string, datos: unknown, dims: number[]) => new ort.Tensor(tipo, datos, dims);
  const lista = (d: ArrayLike<number | bigint>) => Int32Array.from(Array.from(d, (x) => Number(x)));

  const { input_ids } = await tokenizar(p.prompt, { padding: "max_length", max_length: LARGO_TEXTO, truncation: true, return_tensor: false });
  const cod = await texto.run({ input_ids: T("int32", lista(input_ids.data), [1, LARGO_TEXTO]) });
  const ocultos = (cod.last_hidden_state ?? Object.values(cod)[0]) as TensorOrt;
  const ocultos32 = Float32Array.from(ocultos.data as ArrayLike<number>, (x) => x);
  // Si el codificador devuelve fp16 (Uint16Array), se pasa a float32 antes de reutilizarlo.
  const hs32 = ocultos.data instanceof Uint16Array ? deMedios(ocultos.data) : ocultos32;

  const ruido = ruidoNormal(CANALES * LATENTE * LATENTE, p.semilla);
  const entrada = entradaUnet(ruido);
  const medio = pideMedio(unet, "sample", true);
  const hMedio = pideMedio(unet, "encoder_hidden_states", true);
  const salida = await unet.run({
    sample: medio ? T("float16", aMedios(entrada), [1, CANALES, LATENTE, LATENTE]) : T("float32", entrada, [1, CANALES, LATENTE, LATENTE]),
    timestep: T("int64", BigInt64Array.from([BigInt(999)]), [1]),
    encoder_hidden_states: hMedio ? T("float16", aMedios(hs32), [1, LARGO_TEXTO, hs32.length / LARGO_TEXTO]) : T("float32", hs32, [1, LARGO_TEXTO, hs32.length / LARGO_TEXTO]),
  });
  const o = (salida.out_sample ?? Object.values(salida)[0]) as TensorOrt;
  const salida32 = o.data instanceof Uint16Array ? deMedios(o.data) : Float32Array.from(o.data as ArrayLike<number>);

  const latente = latenteFinal(ruido, salida32);
  const vaeMedio = pideMedio(vae, "latent_sample", false);
  const dec = await vae.run({ latent_sample: vaeMedio ? T("float16", aMedios(latente), [1, CANALES, LATENTE, LATENTE]) : T("float32", latente, [1, CANALES, LATENTE, LATENTE]) });
  const im = (dec.sample ?? Object.values(dec)[0]) as TensorOrt;
  const chw = im.data instanceof Uint16Array ? deMedios(im.data) : Float32Array.from(im.data as ArrayLike<number>);
  return { ancho: ANCHO_SD_TURBO, alto: ALTO_SD_TURBO, pixeles: pixelesDesdeVae(chw, ANCHO_SD_TURBO, ALTO_SD_TURBO), motor: `onnxruntime-web ${VERSION_ONNXRUNTIME_WEB} · WebGPU · SD-Turbo` };
}

async function sondear(): Promise<SondasWebGPU> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null> } }).gpu;
  if (!gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
  try {
    const a = await gpu.requestAdapter();
    return a ? { hayWebGPU: true, hayAdaptador: true, f16: a.features.has("shader-f16") } : { hayWebGPU: true, hayAdaptador: false, f16: false };
  } catch { return { hayWebGPU: true, hayAdaptador: false, f16: false }; }
}

/* ───────────────────────── puerta del worker ───────────────────────── */

/** Atiende una orden. Aislada del `self` para poder probarla con un doble. */
export async function atiendeOrden(o: OrdenWorkerSDTurbo, responde: (r: RespuestaWorkerSDTurbo) => void): Promise<void> {
  try {
    let valor: unknown;
    switch (o.orden) {
      case "sondear": valor = await sondear(); break;
      case "cache": valor = await hayPesosEnCache(); break;
      case "cuota": valor = await cuotaLibre(); break;
      case "descargar": await descargarPesos((progreso) => responde({ id: o.id, progreso })); valor = BYTES_PESOS_SD_TURBO; break;
      case "generar": {
        const d = detectaSDTurbo(await sondear());
        if (!d.puede) throw new Error(d.motivo);
        valor = await generar(o.peticion);
        break;
      }
    }
    responde({ id: o.id, ok: true, valor });
  } catch (e) {
    responde({ id: o.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Solo se engancha cuando de verdad estamos dentro de un worker. */
const alcance = globalThis as unknown as {
  WorkerGlobalScope?: unknown;
  postMessage(m: unknown, t?: Transferable[]): void;
  onmessage: ((e: { data: OrdenWorkerSDTurbo }) => void) | null;
};
if (typeof alcance.WorkerGlobalScope !== "undefined") {
  alcance.onmessage = (e) => {
    void atiendeOrden(e.data, (r) => {
      const t = "ok" in r && r.ok && (r.valor as ImagenSDTurbo)?.pixeles instanceof Uint8Array ? [(r.valor as ImagenSDTurbo).pixeles.buffer as ArrayBuffer] : [];
      alcance.postMessage(r, t);
    });
  };
}
