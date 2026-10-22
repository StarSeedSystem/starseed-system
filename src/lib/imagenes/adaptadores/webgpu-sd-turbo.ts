/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA DEL NAVEGADOR (IMG1011H · parte 1 de 3).
 * Contrato: architecture/astraura-imagenes.md §1 (motores y licencias verificados el 2026-10-11) y §8 (cuidados).
 *
 * Referencia: el ejemplo oficial de Microsoft (onnxruntime-inference-examples/js/sd-turbo, MIT) corre
 * SD-Turbo con ONNX Runtime Web + WebGPU, con los pesos en un repo de Hugging Face guardados en la caché
 * del navegador (Cache API) para no volver a bajarlos. Aquí vive lo PURO de esa capa: qué pesos son y
 * cuánto pesan, si esta pestaña puede con ellos y el ORDEN del flujo (detectar → pedir permiso → descargar
 * a la caché → generar). El motor real (onnxruntime-web dentro de un worker) lo implementa la siguiente
 * parte de la cadena; este módulo fija el contrato que hereda. Reglas: nada se descarga sin que la persona
 * lo permita; antes se comprueba el espacio libre (regla del triple); sin WebGPU con f16 se dice y se usan
 * las demás capas, sin inventar; la licencia de SD-Turbo (Stability AI) queda en el catálogo como
 * «sin comprobar del todo» (modelos.ts).
 */

/** Id del modelo en el catálogo (src/lib/imagenes/modelos.ts). */
export const MODELO_SD_TURBO = "sd-turbo";
/** Repo de Hugging Face con los ONNX del ejemplo de Microsoft (tamaños verificados el 2026-10-22). */
export const REPO_ONNX_SD_TURBO = "https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main";
/** Caché del navegador donde quedan los pesos (Cache API, como en el ejemplo de Microsoft). */
export const CACHE_PESOS_SD_TURBO = "starseed-sd-turbo";
/** Versión EXACTA de onnxruntime-web que debe instalar la parte del worker (aquí no se importa). */
export const VERSION_ONNXRUNTIME_WEB = "1.30.0";
/** Tokenizador CLIP del texto (transformers.js lo carga en el ejemplo de Microsoft). */
export const TOKENIZER_CLIP_SD_TURBO = "Xenova/clip-vit-base-patch16";

export interface PesoSDTurbo { ruta: string; bytes: number }

/** Solo los TRES archivos necesarios (ni el VAE encoder ni el scheduler: no se usan para texto a imagen). */
export const PESOS_SD_TURBO: readonly PesoSDTurbo[] = [
  { ruta: "unet/model.onnx", bytes: 1733430199 },
  { ruta: "text_encoder/model.onnx", bytes: 681393168 },
  { ruta: "vae_decoder/model.onnx", bytes: 99094314 },
];
/** Total de la descarga: 2,51 GB (2,34 GiB); con la regla del triple, ~7 GiB libres. */
export const BYTES_PESOS_SD_TURBO = PESOS_SD_TURBO.reduce((t, p) => t + p.bytes, 0);

const GB = 1024 ** 3;
/** Bytes → texto en claro: «2,3 GB», «640 MB». */
export function textoBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "tamaño desconocido";
  return bytes >= GB ? `${(bytes / GB).toFixed(1).replace(".", ",")} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Lo que se puede leer del navegador sobre WebGPU. Lo que no se sabe, se dice: nunca se inventa. */
export interface SondasWebGPU { hayWebGPU: boolean; hayAdaptador: boolean; f16: boolean }
export interface DeteccionSDTurbo { puede: boolean; motivo: string }

/**
 * El ejemplo de Microsoft solo baja los pesos si el adaptador trae f16 (`shader-f16`): sin eso no
 * arranca. Aquí se decide con las tres sondas y se explica en claro qué va a pasar.
 */
export function detectaSDTurbo(s: SondasWebGPU): DeteccionSDTurbo {
  if (!s.hayWebGPU) return { puede: false, motivo: "Este navegador no tiene WebGPU: SD-Turbo no puede correr en la pestaña. Se usan las demás capas (tu neurona, la malla o la web gratis)." };
  if (!s.hayAdaptador) return { puede: false, motivo: "WebGPU está pero no hay GPU disponible para esta pestaña: SD-Turbo no puede correr aquí. Se usan las demás capas." };
  if (!s.f16) return { puede: false, motivo: "Tu GPU no da WebGPU con f16 (shader-f16), que es lo que necesitan los pesos de SD-Turbo: no se baja nada. Se usan las demás capas." };
  return { puede: true, motivo: `WebGPU con f16: SD-Turbo puede correr en esta pestaña. Los pesos son ${textoBytes(BYTES_PESOS_SD_TURBO)} y se piden antes de descargarlos.` };
}

export type AccionPesos = "usar-cache" | "pedir-permiso" | "descargar" | "sin-espacio";
export interface PlanPesos { accion: AccionPesos; motivo: string; bytes: number }

/**
 * Qué hacer con los pesos: si ya están en la caché, se usan; si no, se PIDE (nada se baja solo); y con
 * permiso, solo si sobra espacio (regla del triple del contrato §8).
 */
export function planPesos(s: { enCache: boolean; permiso: boolean; cuotaLibreBytes: number | null }): PlanPesos {
  const bytes = BYTES_PESOS_SD_TURBO;
  if (s.enCache) return { accion: "usar-cache", bytes, motivo: "Los pesos ya están en la caché del navegador: no se descarga nada." };
  if (!s.permiso) return { accion: "pedir-permiso", bytes, motivo: `Para usar SD-Turbo en la pestaña hay que bajar sus pesos (${textoBytes(bytes)}). Nada se descarga sin que lo permitas.` };
  if (s.cuotaLibreBytes === null) return { accion: "sin-espacio", bytes, motivo: "No se puede comprobar el espacio libre del navegador: no se descarga nada sin comprobarlo." };
  if (s.cuotaLibreBytes < bytes * 3) return { accion: "sin-espacio", bytes, motivo: `Hacen falta ${textoBytes(bytes * 3)} libres en el navegador (tres veces los ${textoBytes(bytes)} de los pesos) y solo hay ${textoBytes(s.cuotaLibreBytes)}.` };
  return { accion: "descargar", bytes, motivo: `Hay espacio (${textoBytes(s.cuotaLibreBytes)} libres): se bajan los pesos (${textoBytes(bytes)}) y quedan en la caché del navegador.` };
}

export interface PeticionSDTurbo {
  prompt: string; semilla: number;
  /** La persona permite bajar los pesos si faltan. */
  permisoDescarga: boolean;
}
export interface ImagenSDTurbo { ancho: number; alto: number; pixeles: Uint8Array; motor: string }

/** Motor que implementa la parte del worker con onnxruntime-web (WebGPU). */
export interface MotorSDTurbo {
  /** Detecta WebGPU y f16 en esta pestaña. */
  sondear(): Promise<SondasWebGPU>;
  hayPesosEnCache(): Promise<boolean>;
  /** Espacio libre del navegador para la caché, o null si no se puede saber. */
  cuotaLibre(): Promise<number | null>;
  /** Baja los pesos a la caché del navegador (solo los tres archivos necesarios). */
  descargarPesos(): Promise<void>;
  /** Genera la imagen (SD-Turbo es de un solo paso; 512×512). */
  generar(peticion: PeticionSDTurbo): Promise<ImagenSDTurbo>;
}

export type AccionSDTurbo = AccionPesos | "sin-webgpu" | "listo" | "error";
export interface ResultadoSDTurbo { ok: boolean; accion: AccionSDTurbo; motivo: string; imagen?: ImagenSDTurbo; ms: number }

/** El error de un motor cualquiera, en claro. */
const textoError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** El flujo entero de la capa «navegador»: detectar → pedir permiso → descargar a la caché → generar.
 *  Con un motor simulado se prueba completo, sin red ni GPU. */
export async function generaEnPestana(motor: MotorSDTurbo, peticion: PeticionSDTurbo): Promise<ResultadoSDTurbo> {
  const t0 = Date.now();
  const deteccion = detectaSDTurbo(await motor.sondear());
  if (!deteccion.puede) return { ok: false, accion: "sin-webgpu", motivo: deteccion.motivo, ms: Date.now() - t0 };
  const plan = planPesos({ enCache: await motor.hayPesosEnCache(), permiso: peticion.permisoDescarga, cuotaLibreBytes: await motor.cuotaLibre() });
  if (plan.accion !== "usar-cache" && plan.accion !== "descargar") return { ok: false, accion: plan.accion, motivo: plan.motivo, ms: Date.now() - t0 };
  if (plan.accion === "descargar") {
    try { await motor.descargarPesos(); }
    catch (e) { return { ok: false, accion: "error", motivo: `No se pudieron descargar los pesos: ${textoError(e)}. Se usan las demás capas.`, ms: Date.now() - t0 }; }
  }
  try {
    const imagen = await motor.generar(peticion);
    return { ok: true, accion: "listo", motivo: "Imagen generada en la pestaña con SD-Turbo (WebGPU, un paso).", imagen, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, accion: "error", motivo: `SD-Turbo no pudo generar: ${textoError(e)}. Se usan las demás capas.`, ms: Date.now() - t0 };
  }
}
