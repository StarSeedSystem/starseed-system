/**
 * Imágenes locales de Astraura · MOTOR SD-TURBO EN LA PESTAÑA (IMG1011H · parte 2 de 3).
 * Contrato: architecture/astraura-imagenes.md §1 y §8; flujo y diagnóstico en `webgpu-sd-turbo.ts`.
 *
 * Este worker es el motor real del ejemplo de Microsoft (onnxruntime-inference-examples/js/sd-turbo, MIT):
 * corre UNet + codificador CLIP + decodificador VAE con ONNX Runtime Web sobre WebGPU, con los pesos en la
 * caché del navegador (Cache API). Nada se descarga sin el permiso explícito de la persona y sin comprobar
 * antes tres veces el espacio libre; sin WebGPU con f16 se dice y no se baja nada. onnxruntime-web se carga
 * desde su CDN en la versión EXACTA del contrato (`VERSION_ONNXRUNTIME_WEB`), así no hay que instalar nada
 * ni puede aparecer una versión distinta a la probada. La licencia de SD-Turbo sigue en el catálogo como
 * «sin comprobar del todo» (modelos.ts): no se inventa aquí.
 *
 * Protocolo (lo envuelve la parte 3): se recibe `PeticionWorker` con un `id` y se responde `RespuestaWorker`
 * con el mismo `id`; un fallo siempre llega como `tipo: "error"` con texto en claro.
 */
import {
  CACHE_PESOS_SD_TURBO, PESOS_SD_TURBO, REPO_ONNX_SD_TURBO,
  TOKENIZER_CLIP_SD_TURBO, VERSION_ONNXRUNTIME_WEB, textoBytes,
  type ImagenSDTurbo, type PesoSDTurbo, type PeticionSDTurbo, type SondasWebGPU,
} from "./webgpu-sd-turbo";

/** Misma versión exacta que declara el contrato, servida desde el CDN: no se instala nada. */
const CDN_ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSION_ONNXRUNTIME_WEB}/dist/`;
const URL_ORT = `${CDN_ORT}ort.webgpu.bundle.min.mjs`;
/** Tokenizador CLIP del ejemplo; se fija su versión para que el texto se corte igual siempre. */
const VERSION_TOKENIZADOR = "2.17.2";
const URL_TOKENIZADOR = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${VERSION_TOKENIZADOR}/dist/transformers.min.js`;

const LADO_PX = 512;
const LADO_LATENTE = 64;
const CANALES_LATENTES = 4;
const PASOS_TEXTO = 77;
const PASO_SD_TURBO = BigInt(999);
const SIGMA = 14.6146;
const GAMMA = 0;
const ESCALA_VAE = 0.18215;
const OCHO_BITS = 255;

export interface ProgresoDescarga { archivo: string; descargado: number; total: number }

export type PeticionWorker =
  | { id: number; tipo: "sondear" }
  | { id: number; tipo: "hay-pesos" }
  | { id: number; tipo: "cuota" }
  | { id: number; tipo: "descargar"; permiso: boolean }
  | { id: number; tipo: "generar"; peticion: PeticionSDTurbo }
  | { id: number; tipo: "liberar" };

export type RespuestaWorker =
  | { id: number; tipo: "sondas"; sondas: SondasWebGPU }
  | { id: number; tipo: "hay-pesos"; enCache: boolean }
  | { id: number; tipo: "cuota"; bytesLibres: number | null }
  | { id: number; tipo: "descarga"; ok: true }
  | { id: number; tipo: "imagen"; imagen: ImagenSDTurbo }
  | { id: number; tipo: "liberado"; ok: true }
  | ({ id: number; tipo: "progreso" } & ProgresoDescarga)
  | { id: number; tipo: "estado"; texto: string }
  | { id: number; tipo: "error"; motivo: string };

/** Quien recibe los mensajes y los reenvía al hilo principal (o a una prueba). */
type Avisar = (mensaje: RespuestaWorker) => void;

const textoError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** URL del peso en el repo de Hugging Face (los tres archivos son los únicos necesarios). */
export function urlPeso(ruta: string): string {
  return `${REPO_ONNX_SD_TURBO}/${ruta.replace(/^\/+/, "")}`;
}

/**
 * Ruido inicial determinista a partir de la semilla: la misma semilla da la misma imagen y dos peticiones
 * distintas no dependen del azar del navegador. Gaussiana por Box-Muller ya escalada por sigma, como el ejemplo.
 */
export function ruidoConSemilla(semilla: number, cantidad: number): Float32Array {
  let estado = (Math.trunc(semilla) ^ 0x9e3779b9) >>> 0;
  const siguiente = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const salida = new Float32Array(Math.max(0, Math.trunc(cantidad)));
  for (let i = 0; i < salida.length; i += 2) {
    const u = Math.max(siguiente(), Number.EPSILON);
    const v = siguiente();
    const radio = Math.sqrt(-2 * Math.log(u)) * SIGMA;
    salida[i] = radio * Math.cos(2 * Math.PI * v);
    if (i + 1 < salida.length) salida[i + 1] = radio * Math.sin(2 * Math.PI * v);
  }
  return salida;
}

/** El UNet espera el latente dividido por sqrt(sigma² + 1) (igual que el ejemplo). */
export function escalaEntrada(datos: Float32Array, sigma: number = SIGMA): Float32Array {
  const divisor = Math.sqrt(sigma * sigma + 1);
  const salida = new Float32Array(datos.length);
  for (let i = 0; i < datos.length; i++) salida[i] = datos[i] / divisor;
  return salida;
}

/**
 * Único paso de Euler de SD-Turbo: `(muestra + derivada·dt) / escalaVAE`, que se reduce a
 * `(muestra - sigma·salidaUNet) / escalaVAE`. No se cuantiza ni se redondea: eso se hace al pintar.
 */
export function pasoEuler(salida: Float32Array, muestra: Float32Array, sigma: number = SIGMA): Float32Array {
  if (salida.length !== muestra.length) throw new Error("El paso de Euler recibió tensores de distinto tamaño.");
  const sigmaSombrero = sigma * (GAMMA + 1);
  const resultado = new Float32Array(salida.length);
  for (let i = 0; i < salida.length; i++) resultado[i] = (muestra[i] - sigmaSombrero * salida[i]) / ESCALA_VAE;
  return resultado;
}

/* —— Lo que el navegador ofrece (mínimo y explícito: sin paquetes de tipos extra) —— */

interface GpuAdaptador { features: { has(nombre: string): boolean } }
interface GpuNavegador { requestAdapter(): Promise<GpuAdaptador | null> }
interface AlmacenNavegador {
  storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
  gpu?: GpuNavegador;
}

/** Lee las sondas REALES de la pestaña: WebGPU, adaptador y el f16 que exigen los pesos. */
async function sondear(): Promise<SondasWebGPU> {
  const gpu = (navigator as unknown as AlmacenNavegador).gpu;
  if (!gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
  try {
    const adaptador = await gpu.requestAdapter();
    if (!adaptador) return { hayWebGPU: true, hayAdaptador: false, f16: false };
    return { hayWebGPU: true, hayAdaptador: true, f16: adaptador.features.has("shader-f16") };
  } catch {
    return { hayWebGPU: true, hayAdaptador: false, f16: false };
  }
}

/** Espacio libre que el navegador reconoce para su caché; null si no se puede saber (no se inventa). */
async function cuotaLibre(): Promise<number | null> {
  const almacen = (navigator as unknown as AlmacenNavegador).storage;
  if (!almacen?.estimate) return null;
  try {
    const { usage, quota } = await almacen.estimate();
    if (typeof quota !== "number" || !Number.isFinite(quota)) return null;
    const usado = typeof usage === "number" && Number.isFinite(usage) ? usage : 0;
    return Math.max(0, quota - usado);
  } catch {
    return null;
  }
}

async function abrirCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_PESOS_SD_TURBO);
  } catch {
    return null;
  }
}

/** ¿Están los TRES pesos en la caché del navegador? (ni uno más: el VAE encoder no se usa). */
async function hayPesosEnCache(): Promise<boolean> {
  const cache = await abrirCache();
  if (!cache) return false;
  for (const peso of PESOS_SD_TURBO) if (!(await cache.match(urlPeso(peso.ruta)))) return false;
  return true;
}

/** Tensor del VAE (NCHW, 0..1) a píxeles RGB intercalados (0..255), como `draw_image` del ejemplo. */
export function aPixelesRGB(datos: Float32Array, ancho: number, alto: number): Uint8Array {
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0) throw new Error("Tamaño de imagen no válido.");
  const plano = ancho * alto;
  if (datos.length < plano * 3) throw new Error("El decodificador VAE devolvió menos píxeles de los esperados.");
  const salida = new Uint8Array(plano * 3);
  for (let i = 0; i < plano; i++) {
    for (let canal = 0; canal < 3; canal++) {
      const valor = datos[canal * plano + i] / 2 + 0.5;
      salida[i * 3 + canal] = Math.round(Math.min(1, Math.max(0, valor)) * OCHO_BITS);
    }
  }
  return salida;
}

/* —— Descarga con permiso, regla del triple y caché —— */

/**
 * Baja SOLO los tres pesos que faltan y los deja en la caché del navegador. Exige permiso explícito y
 * WebGPU con f16 (sin eso la descarga no serviría de nada). Si un archivo llega incompleto, no se guarda.
 */
async function descargarPesos(permiso: boolean, avisar: (p: ProgresoDescarga) => void): Promise<void> {
  if (!permiso) throw new Error("No hay permiso de la persona: no se descarga nada.");
  const sondas = await sondear();
  if (!sondas.hayWebGPU || !sondas.hayAdaptador || !sondas.f16) {
    throw new Error("Esta pestaña no tiene WebGPU con f16: los pesos de SD-Turbo no podrían usarse y no se bajan.");
  }
  const cache = await abrirCache();
  if (!cache) throw new Error("Este navegador no permite guardar los pesos en su caché; se usan las demás capas.");
  const pendientes: PesoSDTurbo[] = [];
  for (const peso of PESOS_SD_TURBO) {
    if (await cache.match(urlPeso(peso.ruta))) avisar({ archivo: peso.ruta, descargado: peso.bytes, total: peso.bytes });
    else pendientes.push(peso);
  }
  if (!pendientes.length) return;
  let faltan = 0;
  for (const peso of pendientes) faltan += peso.bytes;
  const libre = await cuotaLibre();
  if (libre === null) throw new Error("No se pudo comprobar el espacio libre del navegador: no se descarga nada sin comprobarlo.");
  if (libre < faltan * 3) {
    throw new Error(`Hacen falta ${textoBytes(faltan * 3)} libres (tres veces los ${textoBytes(faltan)}) y solo hay ${textoBytes(libre)}.`);
  }
  for (const peso of pendientes) {
    const url = urlPeso(peso.ruta);
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`No se pudo bajar ${peso.ruta} (HTTP ${respuesta.status}).`);
    // La copia se guarda EN STREAMING (sin juntar los 1,7 GB en memoria); la original da el progreso.
    const guardando = cache.put(url, respuesta.clone());
    guardando.catch(() => undefined);
    let recibido = 0;
    const lector = respuesta.body?.getReader();
    if (lector) {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (value) {
          recibido += value.byteLength;
          avisar({ archivo: peso.ruta, descargado: recibido, total: peso.bytes });
        }
      }
    } else {
      recibido = (await respuesta.arrayBuffer()).byteLength;
    }
    try {
      await guardando;
    } catch (e) {
      await cache.delete(url);
      throw new Error(`No se pudo guardar ${peso.ruta} en la caché: ${textoError(e)}`);
    }
    if (recibido !== peso.bytes) {
      await cache.delete(url);
      throw new Error(`${peso.ruta} llegó incompleto (${recibido} de ${peso.bytes} bytes): no se guarda.`);
    }
  }
}

/* —— ONNX Runtime Web: la versión exacta del contrato, cargada del CDN —— */

interface TensorOrt { data: Float32Array; dispose?(): void }
interface TensorOrtCtor {
  new (tipo: "float32", datos: Float32Array, dims: number[]): TensorOrt;
  new (tipo: "int32", datos: Int32Array, dims: number[]): TensorOrt;
  new (tipo: "int64", datos: BigInt64Array, dims: number[]): TensorOrt;
}
interface OpcionesSesion {
  executionProviders: string[];
  enableMemPattern: boolean;
  enableCpuMemArena: boolean;
  preferredOutputLocation: Record<string, string>;
  freeDimensionOverrides: Record<string, number>;
  extra: { session: Record<string, string> };
}
interface SesionOrt {
  run(alimentar: Record<string, TensorOrt>): Promise<Record<string, TensorOrt>>;
  release?(): Promise<void>;
}
interface ModuloOrt {
  Tensor: TensorOrtCtor;
  InferenceSession: { create(datos: ArrayBufferView, opciones: OpcionesSesion): Promise<SesionOrt> };
  env: { wasm: { numThreads: number; simd: boolean; wasmPaths: string } };
}
interface TokenizadorClip {
  (texto: string, opciones: { padding: boolean; max_length: number; truncation: boolean; return_tensor: boolean }): Promise<{ input_ids: number[] | Int32Array }>;
  pad_token_id?: number;
}
interface ModuloTokenizador { AutoTokenizer: { from_pretrained(nombre: string): Promise<TokenizadorClip> } }

interface MotorCargado {
  ort: ModuloOrt | null;
  texto: SesionOrt | null;
  unet: SesionOrt | null;
  vae: SesionOrt | null;
  tokenizador: TokenizadorClip | null;
}
const motor: MotorCargado = { ort: null, texto: null, unet: null, vae: null, tokenizador: null };

const OPCIONES_SESION: Omit<OpcionesSesion, "freeDimensionOverrides"> = {
  executionProviders: ["webgpu"],
  enableMemPattern: false,
  enableCpuMemArena: false,
  // El codificador de texto deja su salida en la GPU y así el UNet no la vuelve a copiar.
  preferredOutputLocation: { last_hidden_state: "gpu-buffer" },
  extra: {
    session: {
      disable_prepacking: "1",
      use_device_allocator_for_initializers: "1",
      use_ort_model_bytes_directly: "1",
      use_ort_model_bytes_for_initializers: "1",
    },
  },
};

async function cargarOrt(): Promise<ModuloOrt> {
  if (motor.ort) return motor.ort;
  const modulo = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ URL_ORT)) as unknown as ModuloOrt;
  if (!modulo.InferenceSession || !modulo.Tensor || !modulo.env) {
    throw new Error(`No se pudo cargar onnxruntime-web ${VERSION_ONNXRUNTIME_WEB} desde su CDN.`);
  }
  modulo.env.wasm.numThreads = 1;
  modulo.env.wasm.simd = true;
  modulo.env.wasm.wasmPaths = CDN_ORT;
  motor.ort = modulo;
  return modulo;
}

/** Tokenizador CLIP real (transformers.js, también desde el CDN): convierte el texto en 77 tokens. */
async function cargarTokenizador(): Promise<TokenizadorClip> {
  if (motor.tokenizador) return motor.tokenizador;
  const modulo = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ URL_TOKENIZADOR)) as unknown as ModuloTokenizador;
  if (!modulo.AutoTokenizer) throw new Error("No se pudo cargar el tokenizador CLIP desde su CDN.");
  const tokenizador = await modulo.AutoTokenizer.from_pretrained(TOKENIZER_CLIP_SD_TURBO);
  tokenizador.pad_token_id = 0;
  motor.tokenizador = tokenizador;
  return tokenizador;
}

async function cargarSesion(ort: ModuloOrt, cache: Cache, ruta: string, libres: Record<string, number>): Promise<SesionOrt> {
  const guardada = await cache.match(urlPeso(ruta));
  if (!guardada) throw new Error(`Faltan los pesos ${ruta} en la caché: se pide antes la descarga.`);
  const bytes = new Uint8Array(await guardada.arrayBuffer());
  return ort.InferenceSession.create(bytes, { ...OPCIONES_SESION, freeDimensionOverrides: libres });
}

/** Carga una sola vez los tres modelos en la GPU; las siguientes imágenes reutilizan las sesiones. */
async function asegurarSesiones(avisar: Avisar, id: number): Promise<void> {
  if (motor.texto && motor.unet && motor.vae) return;
  const cache = await abrirCache();
  if (!cache) throw new Error("Este navegador no permite la caché: no se pueden cargar los pesos ya bajados.");
  const ort = await cargarOrt();
  avisar({ id, tipo: "estado", texto: "Cargando el tokenizador CLIP (unos MB la primera vez)…" });
  await cargarTokenizador();
  if (!motor.texto) {
    avisar({ id, tipo: "estado", texto: "Cargando el codificador de texto en la GPU…" });
    motor.texto = await cargarSesion(ort, cache, "text_encoder/model.onnx", { batch_size: 1 });
  }
  if (!motor.unet) {
    avisar({ id, tipo: "estado", texto: "Cargando el UNet en la GPU (lo que más tarda)…" });
    motor.unet = await cargarSesion(ort, cache, "unet/model.onnx", {
      batch_size: 1, num_channels: CANALES_LATENTES, height: LADO_LATENTE, width: LADO_LATENTE, sequence_length: PASOS_TEXTO,
    });
  }
  if (!motor.vae) {
    avisar({ id, tipo: "estado", texto: "Cargando el decodificador VAE en la GPU…" });
    motor.vae = await cargarSesion(ort, cache, "vae_decoder/model.onnx", {
      batch_size: 1, num_channels_latent: CANALES_LATENTES, height_latent: LADO_LATENTE, width_latent: LADO_LATENTE,
    });
  }
  avisar({ id, tipo: "estado", texto: "Modelos listos: generando la imagen (SD-Turbo es de un solo paso)." });
}

/** El flujo de una imagen: texto → CLIP → UNet (1 paso) → VAE → píxeles RGB. */
async function generar(peticion: PeticionSDTurbo, avisar: Avisar, id: number): Promise<ImagenSDTurbo> {
  const prompt = peticion.prompt.trim();
  if (!prompt) throw new Error("El texto para generar está vacío.");
  const sondas = await sondear();
  if (!sondas.hayWebGPU || !sondas.hayAdaptador || !sondas.f16) {
    throw new Error("SD-Turbo necesita WebGPU con f16 y esta pestaña no lo tiene: se usan las demás capas.");
  }
  await asegurarSesiones(avisar, id);
  const { ort, texto, unet, vae, tokenizador } = motor;
  if (!ort || !texto || !unet || !vae || !tokenizador) throw new Error("El motor no quedó listo: faltan modelos.");
  const entrada = await tokenizador(prompt, { padding: true, max_length: PASOS_TEXTO, truncation: true, return_tensor: false });
  const ids = Int32Array.from(entrada.input_ids);
  const salidaTexto = await texto.run({ input_ids: new ort.Tensor("int32", ids, [1, ids.length]) });
  const oculto = salidaTexto.last_hidden_state;
  if (!oculto) throw new Error("El codificador de texto no devolvió last_hidden_state.");
  try {
    const forma = [1, CANALES_LATENTES, LADO_LATENTE, LADO_LATENTE];
    const cantidad = CANALES_LATENTES * LADO_LATENTE * LADO_LATENTE;
    const latente = new ort.Tensor("float32", ruidoConSemilla(peticion.semilla, cantidad), forma);
    const escalado = new ort.Tensor("float32", escalaEntrada(latente.data), forma);
    const salidaUnet = await unet.run({
      sample: escalado,
      timestep: new ort.Tensor("int64", BigInt64Array.from([PASO_SD_TURBO]), [1]),
      encoder_hidden_states: oculto,
    });
    const outSample = salidaUnet.out_sample;
    if (!outSample) throw new Error("El UNet no devolvió out_sample.");
    const paso = new ort.Tensor("float32", pasoEuler(outSample.data, latente.data), forma);
    const decodificado = await vae.run({ latent_sample: paso });
    const muestra = decodificado.sample;
    if (!muestra) throw new Error("El decodificador VAE no devolvió sample.");
    return { ancho: LADO_PX, alto: LADO_PX, pixeles: aPixelesRGB(muestra.data, LADO_PX, LADO_PX), motor: "onnx-web" };
  } finally {
    oculto.dispose?.();
  }
}

/** Suelta las sesiones de la GPU (al cerrar la pestaña o al cambiar de capa). */
async function liberar(): Promise<void> {
  const sesiones = [motor.texto, motor.unet, motor.vae];
  motor.texto = null;
  motor.unet = null;
  motor.vae = null;
  motor.ort = null;
  for (const sesion of sesiones) {
    try {
      await sesion?.release?.();
    } catch {
      /* La sesión ya no estaba: no hay nada que soltar. */
    }
  }
}

/* —— Protocolo del worker —— */

async function atenderPeticion(peticion: PeticionWorker, avisar: Avisar): Promise<void> {
  const { id } = peticion;
  try {
    switch (peticion.tipo) {
      case "sondear":
        avisar({ id, tipo: "sondas", sondas: await sondear() });
        break;
      case "hay-pesos":
        avisar({ id, tipo: "hay-pesos", enCache: await hayPesosEnCache() });
        break;
      case "cuota":
        avisar({ id, tipo: "cuota", bytesLibres: await cuotaLibre() });
        break;
      case "descargar":
        await descargarPesos(peticion.permiso, (progreso) => avisar({ id, tipo: "progreso", ...progreso }));
        avisar({ id, tipo: "descarga", ok: true });
        break;
      case "generar":
        avisar({ id, tipo: "imagen", imagen: await generar(peticion.peticion, avisar, id) });
        break;
      case "liberar":
        await liberar();
        avisar({ id, tipo: "liberado", ok: true });
        break;
      default: {
        const inesperada: never = peticion;
        throw new Error(`Petición desconocida: ${String(inesperada)}`);
      }
    }
  } catch (e) {
    avisar({ id, tipo: "error", motivo: textoError(e) });
  }
}

interface AmbitoWorker {
  postMessage(mensaje: RespuestaWorker): void;
  addEventListener(tipo: "message", oyente: (evento: MessageEvent<PeticionWorker>) => void): void;
}

const ambito = globalThis as unknown as Partial<AmbitoWorker>;
const mandar = ambito.postMessage;
const escuchar = ambito.addEventListener;
if (typeof mandar === "function" && typeof escuchar === "function") {
  const avisar: Avisar = (mensaje) => mandar.call(ambito, mensaje);
  escuchar.call(ambito, "message", (evento) => {
    void atenderPeticion(evento.data, avisar);
  });
}
