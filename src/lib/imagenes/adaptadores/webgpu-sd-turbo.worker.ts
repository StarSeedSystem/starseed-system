/**
 * SD-Turbo en la pestaña · MOTOR DEL WORKER con onnxruntime-web + WebGPU (IMG1011H · parte 2 de 3).
 * Contrato: architecture/astraura-imagenes.md §1 y §8, y el ejemplo oficial de Microsoft
 * (js/sd-turbo, MIT). Este archivo implementa MotorSDTurbo (webgpu-sd-turbo.ts) dentro de un
 * worker: nada de esto corre en el hilo de la interfaz. Solo se baja lo que la persona permite,
 * los pesos quedan en la caché del navegador y sin WebGPU con f16 no se hace nada.
 *
 * Protocolo (parte 3 lo conecta): se recibe { id, tipo } y se responde { id, ok, datos|motivo }.
 *   sondear · cache · cuota · descargar (exige permiso: true) · generar (peticion, wasmPaths?).
 * Los avisos de progreso llegan como { tipo: "progreso", texto } y no llevan id.
 *
 * La licencia de SD-Turbo (Stability AI) sigue en el catálogo como «sin comprobar del todo».
 * Nota honesta: los tres ONNX suman 2,51 GB y el tokenizador CLIP añade ~1,6 MB (vocab + merges).
 */
import {
  BYTES_PESOS_SD_TURBO, CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO,
  type ImagenSDTurbo, type PeticionSDTurbo, type SondasWebGPU,
} from "./webgpu-sd-turbo";
import type { InferenceSession, Tensor } from "onnxruntime-web/webgpu";

type ORT = typeof import("onnxruntime-web/webgpu");
type Sesiones = { ort: ORT; unet: InferenceSession; texto: InferenceSession; vae: InferenceSession; buffers: ArrayBuffer[] };
type Adaptador = { features?: { has(nombre: string): boolean } };
type Navegador = { gpu?: { requestAdapter?: () => Promise<Adaptador | null> }; storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> } };

export type OrdenWorker =
  | { id: number; tipo: "sondear" | "cache" | "cuota" }
  | { id: number; tipo: "descargar"; permiso: boolean }
  | { id: number; tipo: "generar"; peticion: PeticionSDTurbo; wasmPaths?: string };
export type RespuestaWorker =
  | { id: number; ok: true; datos: SondasWebGPU | boolean | number | null | ImagenSDTurbo }
  | { id: number; ok: false; motivo: string };

const FICHEROS_TEXTO = ["tokenizer/vocab.json", "tokenizer/merges.txt"] as const;
const RUTAS_NECESARIAS: readonly string[] = [...PESOS_SD_TURBO.map((p) => p.ruta), ...FICHEROS_TEXTO];
const urlDe = (ruta: string): string => `${REPO_ONNX_SD_TURBO}/${ruta}`;
const navegador = (): Navegador => navigator as unknown as Navegador;
const textoError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface TokenizadorCLIP { vocab: Map<string, number>; rangos: Map<string, number>; bytes: Map<number, string>; cache: Map<string, number[]> }
export function tokenizaCLIP(texto: string, t: TokenizadorCLIP): Int32Array { return tokeniza(texto, t); }
/** Construye el tokenizador CLIP desde los dos archivos de texto del repo (puro; sirve para pruebas). */
export function parseaTokenizador(vocabJson: string, merges: string): TokenizadorCLIP {
  const vocab = new Map<string, number>(Object.entries(JSON.parse(vocabJson) as Record<string, number>));
  const rangos = new Map<string, number>();
  merges.split(/\r?\n/).forEach((linea, i) => { if (i > 0 && linea.trim()) rangos.set(linea.trim(), i - 1); });
  return { vocab, rangos, bytes: tablaBytes(), cache: new Map() };
}

async function sondear(): Promise<SondasWebGPU> {
  const gpu = navegador().gpu;
  if (!gpu?.requestAdapter) return { hayWebGPU: false, hayAdaptador: false, f16: false };
  try {
    const adaptador = await gpu.requestAdapter();
    if (!adaptador) return { hayWebGPU: true, hayAdaptador: false, f16: false };
    return { hayWebGPU: true, hayAdaptador: true, f16: adaptador.features?.has("shader-f16") === true };
  } catch {
    return { hayWebGPU: true, hayAdaptador: false, f16: false };
  }
}

async function cuotaLibre(): Promise<number | null> {
  const estimar = navegador().storage?.estimate;
  if (typeof estimar !== "function") return null;
  try {
    const { quota, usage } = await estimar();
    if (typeof quota !== "number" || typeof usage !== "number") return null;
    return Math.max(0, quota - usage);
  } catch {
    return null;
  }
}

async function hayPesosEnCache(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(CACHE_PESOS_SD_TURBO);
  for (const ruta of RUTAS_NECESARIAS) if (!(await cache.match(urlDe(ruta)))) return false;
  return true;
}

function aviso(texto: string): void {
  const alcance = typeof self === "undefined" ? null : (self as unknown as { postMessage(m: unknown): void });
  alcance?.postMessage({ tipo: "progreso", texto });
}

async function exigeWebGPU(): Promise<void> {
  const s = await sondear();
  if (!s.hayWebGPU || !s.hayAdaptador || !s.f16) throw new Error("Esta pestaña no tiene WebGPU con f16: SD-Turbo no puede correr aquí. Se usan las demás capas.");
}

async function descargar(permiso: boolean): Promise<void> {
  if (!permiso) throw new Error("No se bajan los pesos de SD-Turbo sin permiso de la persona.");
  await exigeWebGPU();
  const libre = await cuotaLibre();
  if (libre === null) throw new Error("No se puede comprobar el espacio libre del navegador: no se descarga nada.");
  if (libre < BYTES_PESOS_SD_TURBO * 3) throw new Error("No hay tres veces el tamaño de los pesos libres en el navegador: no se descarga nada.");
  const cache = await caches.open(CACHE_PESOS_SD_TURBO);
  for (const ruta of RUTAS_NECESARIAS) {
    const url = urlDe(ruta);
    if (await cache.match(url)) continue;
    aviso(`Bajando ${ruta}… (solo se pide una vez)`);
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`No se pudo bajar ${ruta} (HTTP ${respuesta.status}).`);
    await cache.put(url, respuesta);
  }
}
let sesiones: Sesiones | null = null;
let cargando: Promise<Sesiones> | null = null;

async function bytesEnCache(ruta: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_PESOS_SD_TURBO);
  const guardada = await cache.match(urlDe(ruta));
  if (!guardada) throw new Error(`Falta ${ruta} en la caché: pide primero la descarga de los pesos.`);
  return guardada.arrayBuffer();
}

async function abreSesiones(wasmPaths?: string): Promise<Sesiones> {
  const ort = await import("onnxruntime-web/webgpu");
  ort.env.wasm.numThreads = 1; ort.env.wasm.simd = true;
  if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
  const base = {
    executionProviders: ["webgpu"] as const, enableMemPattern: false, enableCpuMemArena: false,
    extra: { session: { disable_prepacking: "1", use_device_allocator_for_initializers: "1", use_ort_model_bytes_directly: "1", use_ort_model_bytes_for_initializers: "1" } },
  };
  const buffers = await Promise.all(PESOS_SD_TURBO.map((p) => bytesEnCache(p.ruta)));
  const unet = await ort.InferenceSession.create(buffers[0], { ...base, freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 } });
  const texto = await ort.InferenceSession.create(buffers[1], { ...base, preferredOutputLocation: { last_hidden_state: "gpu-buffer" as const }, freeDimensionOverrides: { batch_size: 1 } });
  const vae = await ort.InferenceSession.create(buffers[2], { ...base, freeDimensionOverrides: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 } });
  sesiones = { ort, unet, texto, vae, buffers };
  return sesiones;
}

async function cargaSesiones(wasmPaths?: string): Promise<Sesiones> {
  if (sesiones) return sesiones;
  if (cargando) return cargando;
  cargando = abreSesiones(wasmPaths).finally(() => { cargando = null; });
  return cargando;
}

const SIGMA = 14.6146; const VAE = 0.18215;

function latentes(forma: number[], sigma: number, semilla: number): Float32Array {
  let estado = (semilla >>> 0) || 1;
  const azar = (): number => { estado = (estado + 0x6d2b79f5) | 0; let x = Math.imul(estado ^ (estado >>> 15), 1 | estado); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
  const datos = new Float32Array(forma.reduce((a, b) => a * b, 1));
  for (let i = 0; i < datos.length; i++) datos[i] = gauss() * sigma;
  return datos;
}

function esTensor(v: unknown): v is Tensor { return typeof v === "object" && v !== null && "dims" in v && "data" in v; }
function f32(t: Tensor): Float32Array {
  if (!(t.data instanceof Float32Array)) throw new Error("La salida del modelo no llegó como float32 en la CPU.");
  return t.data;
}

async function generar(peticion: PeticionSDTurbo, wasmPaths?: string): Promise<ImagenSDTurbo> {
  if (!peticion.prompt.trim()) throw new Error("Hace falta un texto para generar la imagen.");
  await exigeWebGPU();
  const t = await cargaTokenizador();
  const { ort, unet, texto, vae } = await cargaSesiones(wasmPaths);
  const ids = tokenizaCLIP(peticion.prompt, t);
  const salidaTexto = await texto.run({ input_ids: new ort.Tensor("int32", ids, [1, ids.length]) });
  const oculto = salidaTexto["last_hidden_state"];
  if (!esTensor(oculto)) throw new Error("El codificador de texto no devolvió last_hidden_state.");
  try {
    const forma = [1, 4, 64, 64];
    const latente = new ort.Tensor("float32", latentes(forma, SIGMA, peticion.semilla), forma);
    const datosLatente = f32(latente);
    const escala = new Float32Array(datosLatente.length);
    for (let i = 0; i < escala.length; i++) escala[i] = datosLatente[i] / Math.sqrt(SIGMA ** 2 + 1);
    const salida = await unet.run({ sample: new ort.Tensor("float32", escala, forma), timestep: new ort.Tensor("int64", new BigInt64Array([BigInt(999)]), [1]), encoder_hidden_states: oculto });
    const ruido = salida["out_sample"];
    if (!esTensor(ruido)) throw new Error("El UNet no devolvió out_sample.");
    const datosRuido = f32(ruido);
    const nuevo = new Float32Array(datosRuido.length);
    for (let i = 0; i < nuevo.length; i++) nuevo[i] = (datosLatente[i] - SIGMA * datosRuido[i]) / VAE;
    const decodificado = await vae.run({ latent_sample: new ort.Tensor("float32", nuevo, forma) });
    const muestra = decodificado["sample"];
    if (!esTensor(muestra)) throw new Error("El VAE no devolvió sample.");
    return aPixeles(f32(muestra), muestra.dims);
  } finally {
    oculto.dispose();
  }
}

function aPixeles(datos: Float32Array, dims: readonly number[]): ImagenSDTurbo {
  const [, canales, ancho, alto] = dims;
  if (canales !== 3 || !ancho || !alto || datos.length < 3 * ancho * alto) throw new Error("La imagen decodificada no tiene la forma esperada (3 canales).");
  const pixeles = new Uint8Array(ancho * alto * 3); const plano = ancho * alto;
  for (let c = 0; c < 3; c++) for (let i = 0; i < plano; i++) {
    const v = Math.min(1, Math.max(0, datos[c * plano + i] / 2 + 0.5));
    pixeles[i * 3 + c] = Math.round(v * 255);
  }
  return { ancho, alto, pixeles, motor: "onnx-web · SD-Turbo (WebGPU, 1 paso)" };
}
function rango(a: number, b: number): number[] { const out: number[] = []; for (let i = a; i <= b; i++) out.push(i); return out; }

function tablaBytes(): Map<number, string> {
  const bs = [...rango(33, 126), ...rango(161, 172), ...rango(174, 255)];
  const cs = [...bs];
  let extra = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + extra++); }
  return new Map(bs.map((b, i) => [b, String.fromCodePoint(cs[i])]));
}

function bpe(palabra: string, t: TokenizadorCLIP): number[] {
  const guardada = t.cache.get(palabra);
  if (guardada) return guardada;
  const puntos = Array.from(palabra, (c) => t.bytes.get(c.codePointAt(0) ?? 0) ?? c);
  const piezas = puntos.map((p, i) => (i === puntos.length - 1 ? `${p}</w>` : p));
  while (piezas.length > 1) {
    let mejor = Infinity; let donde = -1;
    for (let i = 0; i < piezas.length - 1; i++) {
      const rank = t.rangos.get(`${piezas[i]} ${piezas[i + 1]}`);
      if (rank !== undefined && rank < mejor) { mejor = rank; donde = i; }
    }
    if (donde < 0) break;
    piezas.splice(donde, 2, piezas[donde] + piezas[donde + 1]);
  }
  const ids = piezas.map((p) => t.vocab.get(p) ?? 49407);
  t.cache.set(palabra, ids);
  return ids;
}

const PATRON_CLIP = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu;

function tokeniza(texto: string, t: TokenizadorCLIP): Int32Array {
  const ids = [49406];
  for (const palabra of texto.toLowerCase().trim().match(PATRON_CLIP) ?? []) {
    if (palabra === "<|startoftext|>") ids.push(49406);
    else if (palabra === "<|endoftext|>") ids.push(49407);
    else ids.push(...bpe(palabra, t));
  }
  ids.push(49407);
  const recortados = ids.length > 77 ? [...ids.slice(0, 76), 49407] : ids;
  while (recortados.length < 77) recortados.push(0);
  return Int32Array.from(recortados);
}

let tokenizador: TokenizadorCLIP | null = null;

async function cargaTokenizador(): Promise<TokenizadorCLIP> {
  if (tokenizador) return tokenizador;
  const [bytesVocab, bytesMerges] = await Promise.all([bytesEnCache(FICHEROS_TEXTO[0]), bytesEnCache(FICHEROS_TEXTO[1])]);
  const decodificador = new TextDecoder();
  tokenizador = parseaTokenizador(decodificador.decode(bytesVocab), decodificador.decode(bytesMerges));
  return tokenizador;
}

async function atiende(orden: OrdenWorker): Promise<RespuestaWorker> {
  try {
    switch (orden.tipo) {
      case "sondear": return { id: orden.id, ok: true, datos: await sondear() };
      case "cache": return { id: orden.id, ok: true, datos: await hayPesosEnCache() };
      case "cuota": return { id: orden.id, ok: true, datos: await cuotaLibre() };
      case "descargar": await descargar(orden.permiso); return { id: orden.id, ok: true, datos: null };
      case "generar": return { id: orden.id, ok: true, datos: await generar(orden.peticion, orden.wasmPaths) };
    }
  } catch (e) {
    return { id: orden.id, ok: false, motivo: textoError(e) };
  }
}

if (typeof window === "undefined" && typeof self !== "undefined") {
  const alcance = self as unknown as { postMessage(m: unknown): void; onmessage: ((ev: MessageEvent<OrdenWorker>) => void) | null };
  alcance.onmessage = (ev) => { void atiende(ev.data).then((r) => alcance.postMessage(r)); };
}
