/**
 * Imágenes locales de Astraura · ADAPTADOR WEBGPU SD-TURBO (IMG1011H).
 * Contrato: architecture/astraura-imagenes.md §1, §8.
 * 
 * Este adaptador proporciona la capacidad de generar imágenes en la pestaña del navegador
 * usando WebGPU y ONNX Runtime Web con el modelo SD-Turbo.
 * 
 * Se basa en el ejemplo oficial de Microsoft:
 * https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo
 */

import type { GeneradorTab } from "../../../ai/astraura/media/proveedor-neuronas";
import { registrarGeneradorTab } from "../../../ai/astraura/media/proveedor-neuronas";
import * as ort from 'onnxruntime-web';
// Importamos el tokenizer desde @xenova/transformers
import { AutoTokenizer } from '@xenova/transformers';

// Estado interno del adaptador
let generadorTabInterno: GeneradorTab | null = null;
let promesaInicializacion: Promise<void> | null = null;

// Variables para los modelos y el tokenizer
let tokenizer: any = null;
let models: {
  unet: ort.InferenceSession | null;
  text_encoder: ort.InferenceSession | null;
  vae_decoder: ort.InferenceSession | null;
} = {
  unet: null,
  text_encoder: null,
  vae_decoder: null
};

// Parámetros del modelo (del ejemplo)
const sigma = 14.6146;
const gamma = 0;
const vae_scaling_factor = 0.18215;

// Cached generator to avoid multiple registrations
let generadorTabCache: GeneradorTab | null = null;

/**
 * Crea y devuelve una función que corresponde al generador de la pestaña (WebGPU) para SD-Turbo.
 * Esta función se encarga de inicializar el modelo en la primera llamada y luego genera imágenes.
 * 
 * @returns Una función que, dada una prompt y una semilla, devuelve una promesa que resuelve a
 *          un objeto con una URL de imagen (usable como <img src>) o null si falla.
 */
export function crearGeneradorTabWebGPUSDTurbo(): GeneradorTab {
  if (!generadorTabCache) {
    generadorTabCache = async (prompt: string, semilla: number): Promise<{ url?: string; ref?: string } | null> => {
      // Aseguramos la inicialización (solo se hace una vez)
      if (promesaInicializacion === null) {
        promesaInicializacion = inicializar();
      }
      await promesaInicializacion;
      
      // Si la inicialización falló, generadorTabInterno permanece null
      if (!generadorTabInterno) {
        return null;
      }
      
      return generadorTabInterno(prompt, semilla);
    };
    // Register the generator with the neuronas provider
    registrarGeneradorTab(generadorTabCache);
  }
  return generadorTabCache;
}

/**
 * Inicializa el adaptador: comprueba el soporte de WebGPU y carga los modelos necesarios.
 * Esta función se llama solo once.
 */
async function inicializar(): Promise<void> {
  await inicializarInterno();
}

/**
 * Inicializa el adaptador: comprueba el soporte de WebGPU y carga los modelos necesarios.
 * Esta función se llama solo una vez desde inicializar().
 */
async function inicializarInterno(): Promise<void> {
  try {
    // Comprobar si WebGPU está disponible y soporta FP16
    const tieneWebGPU = await tieneWebGPUConFP16();
    if (!tieneWebGPU) {
      console.log('WebGPU no está disponible o no soporta FP16');
      return;
    }

    // Configuración común para las sesiones de ONNX
    const opt = {
      executionProviders: ['webgpu'],
      enableMemPattern: false,
      enableCpuMemArena: false,
      extra: {
        session: {
          disable_prepacking: "1",
          use_device_allocator_for_initializers: "1",
          use_ort_model_bytes_directly: "1",
          use_ort_model_bytes_for_initializers: "1"
        }
      },
    };

    // URLs base del modelo en Hugging Face
    const baseUrl = "https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main";

    // Definición de los modelos a cargar
    const modelInfo = {
      unet: {
        url: "unet/model.onnx",
        size: 640, // MB
        opt: { ...opt, freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 } }
      },
      text_encoder: {
        url: "text_encoder/model.onnx",
        size: 1700, // MB
        opt: { ...opt, freeDimensionOverrides: { batch_size: 1 } }
      },
      vae_decoder: {
        url: "vae_decoder/model.onnx",
        size: 95, // MB
        opt: { ...opt, freeDimensionOverrides: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 } }
      }
    };

    // Inicializar el entorno de WASM para ONNX Runtime Web
    ort.env.wasm.wasmPaths = '/dist/'; // Asumimos que los archivos WASM están en /dist/
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    // Cargar los modelos
    await cargarModelos(baseUrl, modelInfo);

    // Inicializar el tokenizer
    tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
    tokenizer.pad_token_id = 0;

    // Crear la función que realmente genera las imágenes
    generadorTabInterno = crearFuncionGeneradora(opt, sigma, gamma, vae_scaling_factor, tokenizer, models);

    console.log('Generador de WebGPU SD-Turbo inicializado correctamente');
  } catch (error) {
    console.error('Error al inicializar el adaptador de WebGPU SD-Turbo:', error);
    generadorTabInterno = null;
  }
}

/**
 * Comprueba si el navegador soporta WebGPU y si el adaptador soporta FP16.
 * Basado en la función hasFp16 del ejemplo.
 */
async function tieneWebGPUConFP16(): Promise<boolean> {
  if (!('gpu' in navigator)) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter?.features.has('shader-f16') ?? false;
  } catch {
    return false;
  }
}

/**
 * Carga los modelos desde la URL base y los almacena en caché.
 * Basado en la función load_models del ejemplo.
 */
async function cargarModelos(baseUrl: string, modelInfo: { [key: string]: { url: string; size: number; opt: any } }): Promise<void> {
  const cache = await caches.open("onnx-web-sd-turbo");
  let faltan = 0;
  for (const [nombre, info] of Object.entries(modelInfo)) {
    const url = `${baseUrl}/${info.url}`;
    const cachedResponse = await cache.match(url);
    if (cachedResponse === undefined) {
      faltan += info.size;
    }
  }
  if (faltan > 0) {
    console.log(`Descargando ${faltan} MB de modelos desde la red...`);
  } else {
    console.log('Cargando modelos desde caché...');
  }
  for (const [nombre, info] of Object.entries(modelInfo)) {
    try {
      const inicio = performance.now();
      const bytesDelModelo = await obtenerDesdeCacheOCachear(cache, baseUrl, info.url);
      const sesion = await ort.InferenceSession.create(bytesDelModelo, info.opt);
      models[nombre as keyof typeof models] = sesion;
      const fin = performance.now();
      console.log(`${info.url} cargado en ${(fin - inicio).toFixed(1)} ms`);
    } catch (error) {
      console.error(`Error al cargar ${info.url}:`, error);
      models[nombre as keyof typeof models] = null;
    }
  }
}

/**
 * Obtiene un archivo desde la caché del navegador o lo descarga y lo almacena en caché.
 * 
 * @param cache El objeto de caché de Cache API
 * @param baseUrl La URL base donde se encuentra el archivo
 * @param ruta La ruta relativa del archivo
 * @returns Una promesa que resuelve con el ArrayBuffer del archivo
 */
async function obtenerDesdeCacheOCachear(cache: Cache, baseUrl: string, ruta: string): Promise<ArrayBuffer> {
  const url = `${baseUrl}/${ruta}`;
  const respuestaCacheada = await cache.match(url);
  if (respuestaCacheada !== undefined) {
    return await respuestaCacheada.arrayBuffer();
  }
  // No está en caché, lo descargamos y lo almacenamos
  const respuesta = await fetch(url);
  const buffer = await respuesta.arrayBuffer();
  await cache.put(url, new Response(buffer));
  return buffer;
}

/**
 * Crea la función que genera imágenes dado un prompt y una semilla.
 * 
 * @param opt Opciones para las sesiones de ONNX
 * @param sigma Parámetro del scheduler
 * @param gamma Parámetro del scheduler
 * @param vae_scaling_factor Factor de escala del VAE
 * @param tokenizer El tokenizer para procesar el prompt
 * @param models Los modelos cargados (unet, text_encoder, vae_decoder)
 * @returns Una función que, dada una prompt y una semilla, devuelve una promesa que resuelve a { url?: string; ref?: string } | null
 */
function crearFuncionGeneradora(
  opt: any,
  sigma: number,
  gamma: number,
  vae_scaling_factor: number,
  tokenizer: any,
  models: { unet: ort.InferenceSession | null; text_encoder: ort.InferenceSession | null; vae_decoder: ort.InferenceSession | null }
): GeneradorTab {
  return async (prompt: string, semilla: number): Promise<{ url?: string; ref?: string } | null> => {
    if (!models.unet || !models.text_encoder || !models.vae_decoder) {
      return null;
    }

    try {
      // Tokenizar el prompt
      const { input_ids } = await tokenizer(prompt, { padding: true, max_length: 77, truncation: true, return_tensor: false });

      // Codificar el prompt con el text_encoder
      const inicioTexto = performance.now();
      const resultadoTextEncoder = await models.text_encoder!.run(
        { "input_ids": new ort.Tensor("int32", input_ids, [1, input_ids.length]) }
      );
      const ultimoEstadoOculto = resultadoTextEncoder.last_hidden_state as ort.Tensor;
      console.log(`text_encoder: ${(performance.now() - inicioTexto).toFixed(1)} ms`);

      // Generar latentes iniciales (ruido)
      const formaLatente = [1, 4, 64, 64];
      const latentesIniciales = crearLatentesAleatorios(formaLatente, sigma);
      const latentesTensor = new ort.Tensor(latentesIniciales, formaLatente);

      // Escalar las entradas del modelo (según el ejemplo)
      const latentesEscalados = escalarEntradasModelo(latentesTensor);

      // Ejecutar el UNet
      const inicioUNet = performance.now();
      const feedUNet = {
        "sample": latentesEscalados,
        "timestep": new ort.Tensor("int64", [999], [1]),
        "encoder_hidden_states": ultimoEstadoOculto,
      };
      const resultadoUNet = await models.unet!.run(feedUNet);
      const muestraSalida = resultadoUNet.out_sample as ort.Tensor;
      console.log(`unet: ${(performance.now() - inicioUNet).toFixed(1)} ms`);

      // Programador: paso de EulerA (simplificado para SD-Turbo)
      const latentesActualizados = pasoEulerA(muestraSalida, latentesTensor, sigma, gamma, vae_scaling_factor);

      // Decodificar con el VAE
      const inicioVAE = performance.now();
      const resultadoVAE = await models.vae_decoder!.run({ "latent_sample": latentesActualizados });
      const imagenTensor = resultadoVAE.sample as ort.Tensor;
      console.log(`vae_decoder: ${(performance.now() - inicioVAE).toFixed(1)} ms`);

      // Convertir el tensor a una URL de imagen (data URL)
      const urlImagen = await tensorAUrlImagen(imagenTensor);

      // Limpiar el tensor del text_encoder (es un GPU buffer)
      ultimoEstadoOculto.dispose();

      return { url: urlImagen };
    } catch (error) {
      console.error('Error al generar la imagen:', error);
      return null;
    }
  };
}

/**
 * Genera latentes aleatorios con distribución normal.
 * 
 * @param forma La forma del tensor de latentes [batch, channels, height, width]
 * @param ruidoSigma La desviación estándar del ruido inicial
 * @returns Un Float32Array con los valores aleatorios
 */
function crearLatentesAleatorios(forma: number[], ruidoSigma: number): Float32Array {
  function randn(): number {
    // Transformada de Box-Muller
    const u = Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  let tamaño = 1;
  for (const dim of forma) {
    tamaño *= dim;
  }
  const datos = new Float32Array(tamaño);
  for (let i = 0; i < tamaño; i++) {
    datos[i] = randn() * ruidoSigma;
  }
  return datos;
}

/**
 * Escala las latentes de entrada al modelo (según el ejemplo).
 * 
 * @param latentes El tensor de latentes de entrada
 * @returns El tensor de latentes escalado
 */
function escalarEntradasModelo(latentes: ort.Tensor): ort.Tensor {
  const datosEntrada = latentes.data as Float32Array;
  const datosSalida = new Float32Array(datosEntrada.length);
  const divi = Math.sqrt(sigma ** 2 + 1);
  for (let i = 0; i < datosEntrada.length; i++) {
    datosSalida[i] = datosEntrada[i] / divi;
  }
  return new ort.Tensor(datosSalida, latentes.dims);
}

/**
 * Aplica un paso del programador EulerA (simplificado para SD-Turbo).
 * 
 * @param salidaModelo La salida del modelo UNet
 * @param latentes Los latentes actuales
 * @param sigma Parámetro del scheduler
 * @param gamma Parámetro del scheduler
 * @param vae_scaling_factor Factor de escala del VAE
 * @returns Los latentes actualizados
 */
function pasoEulerA(salidaModelo: ort.Tensor, latentes: ort.Tensor, sigma: number, gamma: number, vae_scaling_factor: number): ort.Tensor {
  const datosSalida = salidaModelo.data as Float32Array;
  const datosLatentes = latentes.data as Float32Array;
  const datosActualizados = new Float32Array(datosSalida.length);
  const sigmaSombrero = sigma * (gamma + 1);
  for (let i = 0; i < datosSalida.length; i++) {
    const muestraOriginal = datosLatentes[i] - sigmaSombrero * datosSalida[i];
    const derivada = (datosLatentes[i] - muestraOriginal) / sigmaSombrero;
    const dt = -sigmaSombrero;
    datosActualizados[i] = (datosLatentes[i] + derivada * dt) / vae_scaling_factor;
  }
  return new ort.Tensor(datosActualizados, salidaModelo.dims);
}

/**
 * Convierte un tensor de imagen a una URL de datos (data URL) que puede usarse como <img src>.
 * 
 * @param tensorEl tensor de imagen en formato NCWH (batch, channels, height, width)
 * @returns Una cadena de datos URL que representa la imagen en formato PNG
 */
async function tensorAUrlImagen(tensor: ort.Tensor): Promise<string> {
  // Asumimos que el tensor es de tipo Float32 y valores en [0, 1] después del procesamiento
  const datos = tensor.data as Float32Array;
  const [batch, canales, alto, ancho] = tensor.dims;
  // Crear un ImageData y luego convertirlo a blob y luego a URL
  // Nota: Esto es una simplificación. En el ejemplo, usan t.toImageData().
  // En ONNX Runtime Web, tenemos el metodo toImageData() en el tensor.
   const imageData = tensor.toImageData({ tensorLayout: 'NCHW', format: 'RGBA' });
  // Convertir ImageData a blob
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo obtener el contexto 2D del canvas');
  }
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error('No se pudo crear el blob del canvas'));
      }
    }, 'image/png');
  }) as Promise<string>;
}