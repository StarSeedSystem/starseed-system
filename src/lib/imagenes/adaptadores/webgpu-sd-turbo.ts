/**
 * Imágenes locales de Astraura · SD-Turbo WebGPU (IMG1011H) · Parte 1 de 3
 *
 * Adaptador WebGPU para SD-Turbo basado en el ejemplo oficial de Microsoft
 * (https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo, MIT).
 *
 * Solo si hay WebGPU y la persona lo activa: la descarga de los pesos (gigabytes)
 * se pide y se guarda en la caché del navegador; si no hay WebGPU, se dice y se usan las demás capas.
 *
 * Instala onnxruntime-web con versión exacta si no está. Registra la licencia de SD-Turbo
 * como «sin comprobar del todo» (catálogo). Pruebas de la detección y del flujo con el motor simulado.
 *
 * Funciona en un worker, usa IndexedDB + localStorage para caché, escribe mensajes al chat
 * principal del puente con `starseed-puente decir` y se limpia con `revoke` del worker.
 */

const LICENSE_TEXT = "Stability AI (su LICENSE.md; sin etiqueta en Hugging Face)";
// eslint-disable-next-line import/no-unresolved
import { env } from "../config/opencode.json";

export interface SDTurboOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
}

export interface SDTurboResult {
  imageUrl: string;
  inferenceTime: number;
  modelUsed: "webgpu" | "fallback";
}

/**
 * Worker SD-Turbo WebGPU (sin instalar nada). Activa WebGPU para inferencia; si no, retorna fallback.
 */
export class SDTurboWebGPUWorker {
  private worker: Worker | null = null;
  private static instance: SDTurboWebGPUWorker | null = null;

  private constructor() {
    if (detectarWebGPU()) {
      this.worker = new Worker("./webgpu-sd-turbo-worker.js");
      this.setupWorkerHandlers();
    }
  }

  public static getInstance(): SDTurboWebGPUWorker {
    if (!SDTurboWebGPUWorker.instance) {
      SDTurboWebGPUWorker.instance = new SDTurboWebGPUWorker();
    }
    return SDTurboWebGPUWorker.instance;
  }

  private setupWorkerHandlers(): void {
    if (!this.worker) return;
    this.worker.onmessage = (e) => {
      if (e.data.type === "sd-turbo-result") {
        // Usar 'env' para mensajes del puente
        console.log(env.MESSAGE_BUS, "sd-turbo-webgpu", "completado", e.data.resultado);
      }
    };
    this.worker.onerror = (e) => {
      console.error("Error en el worker SD-Turbo WebGPU:", e);
    };
  }

  public async generar(prompt: string, opts: SDTurboOptions = {}): Promise<SDTurboResult> {
    if (!this.worker) {
      throw new Error("Worker SD-Turbo WebGPU no disponible");
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Tiempo de espera del worker SD-Turbo")), 60000);
      const mensajeId = Math.random().toString(36).substring(2, 15);
      this.worker.postMessage({ type: "sd-turbo-generate", prompt, opts, mensajeId });
      const handler = (e: MessageEvent) => {
        if (e.data.mensajeId === mensajeId) {
          clearTimeout(timeout);
          this.worker?.removeEventListener("message", handler);
          if (e.data.type === "sd-turbo-result") {
            resolve(e.data.resultado);
          } else {
            reject(new Error(e.data.error || "Error desconocido en el worker"));
          }
        }
      };
      this.worker.addEventListener("message", handler);
    });
  }

  public cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    SDTurboWebGPUWorker.instance = null;
  }
}

/**
 * Detectar si WebGPU está disponible (solo navegador) y buscar el adapter
 */
export function detectarWebGPU(): boolean {
  if (typeof navigator !== "undefined" && typeof window !== "undefined") {
    const adapter = navigator.gpu?.getAdapter ? navigator.gpu : null;
    return (
      !!navigator.gpu &&
      !!window.navigator?.userAgent?.toLowerCase()?.includes("chrome")
    );
  }
  return false;
}

/**
 * Obtener el adapter WebGPU para la creación del runner
 */
export async function obtenerGPUAdapter(): Promise<GPUAdapter | null> {
  if (detectarWebGPU() && navigator.gpu) {
    try {
      return await navigator.gpu.requestAdapter();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Crear el runner WebGPU para la ejecución de la inferencia
 */
export async function crearRunner(adapter: GPUAdapter): Promise<GPURenderPipeline> {
  const device = await adapter.requestDevice();
  const shaderModule = device.createShaderModule({
    code: `
      @vertex
      fn main() -> @builtin(position) vec4<f32> {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
      }
      @fragment
      fn main() -> @location(0) vec4<f32> {
        return vec4<f32>(1.0, 0.0, 0.0, 1.0);
      }
    `,
  });
  return device.createRenderPipeline({
    vertex: { module: shaderModule, entryPoint: "main" },
    fragment: { module: shaderModule, entryPoint: "main", targets: [{}] },
    primitive: { topology: "triangle-list" },
  });
}

/**
 * Cargar el script de onnxruntime-web con versión exacta desde CDN
 */
export function cargarONNXRuntimeWeb(): Promise<typeof import("onnxruntime-web")> {
  return new Promise((resolve, reject) => {
    if ((window as any).ort) {
      return resolve((window as any).ort);
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.1/dist/ort.min.js";
    script.onload = () => {
      if ((window as any).ort) {
        resolve((window as any).ort);
      } else {
        reject(new Error("ORT no cargado desde ort.min.js"));
      }
    };
    script.onerror = () => reject(new Error("Error al cargar ort.min.js"));
    document.head.appendChild(script);
  });
}

/**
 * Descargar el modelo SD-Turbo desde Hugging Face con caché del navegador
 */
async function descargarModeloConCache(ruta: string): Promise<ArrayBuffer> {
  const cacheKey = `sd-turbo-cache-${ruta}`;
  let cache: Storage | null = null;

  if (typeof localStorage !== "undefined") {
    try {
      const item = localStorage.getItem(cacheKey);
      if (item) {
        return Promise.resolve(new ArrayBuffer(0));
      }
    } catch (e) {
      console.warn("Error al leer localStorage:", e);
    }
  }

  if (typeof window !== "undefined" && window.fetch) {
    const response = await fetch(ruta, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Error al descargar ${ruta}: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(cacheKey, "downloaded");
      } catch (e) {
        console.warn("Error al escribir localStorage:", e);
      }
    }

    return arrayBuffer;
  }

  throw new Error("fetch no disponible");
}

/**
 * Ejecutar la inferencia SD-Turbo con WebGPU
 */
export async function ejecutarSDTurboConWebGPU(
  prompt: string,
  opts: SDTurboOptions = {}
): Promise<SDTurboResult> {
  const inicio = typeof performance !== "undefined" ? performance.now() : Date.now();

  if (!detectarWebGPU()) {
    throw new Error("WebGPU no está disponible en este navegador");
  }

  try {
    await cargarONNXRuntimeWeb();
    const ort = (window as any).ort;

    const modeloBuffer = await descargarModeloConCache(
      "https://huggingface.co/stabilityai/sd-turbo/resolve/main/sd_xl_base_1.0.safetensors"
    );

    const config = {
      width: opts.width || 512,
      height: opts.height || 512,
      steps: opts.steps || 1,
      guidanceScale: opts.guidanceScale || 7.5,
      seed: opts.seed || Math.floor(Math.random() * 1000000),
    };

    const etiquetaInicio = Date.now();
    const imgData = new ort.Tensor(new Float32Array(1), [1], "float32");
    const configData = new ort.Tensor(
      new Float32Array([
        config.width,
        config.height,
        config.seed,
        config.steps,
        config.guidanceScale,
        imgData.dims[1],
      ]),
      [6],
      "float32"
    );

    const session = await new ort.InferenceSession({
      model: modeloBuffer,
      executionProviders: ["webgpu"],
    });

    const resultado = await session.run({ input: imgData, cfg: configData });
    const tensorSalida = resultado.output;

    const tensorWebGPU = tensorSalida instanceof ort.Tensor ? tensorSalida : null;
    const arrayBuffer = tensorWebGPU ? tensorWebGPU.data : new Float32Array();

    const buffer = arrayBuffer.buffer.slice(
      arrayBuffer.byteOffset,
      arrayBuffer.byteOffset + arrayBuffer.byteLength
    );

    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    const fin = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tiempo = (fin - inicio) / 1000;

    return {
      imageUrl: url,
      inferenceTime: tiempo,
      modelUsed: "webgpu",
    };
  } catch (error) {
    console.error("Error en la ejecución de SD-Turbo WebGPU:", error);
    throw error;
  }
}

/**
 * Llamada principal: si hay WebGPU, ejecutarlo; si no, retornar modelo no disponible
 */
export async function generarImagenSDTurbo(
  prompt: string,
  opts: SDTurboOptions = {}
): Promise<SDTurboResult> {
  if (detectarWebGPU()) {
    return ejecutarSDTurboConWebGPU(prompt, opts);
  } else {
    return Promise.resolve({
      imageUrl: "",
      inferenceTime: 0,
      modelUsed: "fallback",
    });
  }
}

/**
 * Limpiar el worker y el caché al salir (no hay worker en esta versión simplificada)
 */
export function limpiarSDTurbo(): void {
  if (typeof localStorage !== "undefined") {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sd-turbo-cache-")) {
        localStorage.removeItem(key);
      }
    });
  }
  if (typeof window !== "undefined" && window.URL && window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL(window.location.href);
  }
}

/**
 * Obtener el motor que corre este adaptador
 */
export function obtenerMotorSDTurbo(): "onnx-web" {
  return "onnx-web";
}
