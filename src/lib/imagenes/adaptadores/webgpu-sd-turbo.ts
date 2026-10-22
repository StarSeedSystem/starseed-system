/**
 * Imágenes locales de Astraura · SD-TURBO EN LA PESTAÑA CON WEBGPU (IMG1011H · parte 1: el núcleo puro).
 * Contrato: architecture/astraura-imagenes.md §1 (SD-Turbo: ONNX Runtime Web + WebGPU), §3 (capa
 * «navegador») y §8 (nada se descarga sin permiso y con el triple de espacio libre).
 *
 * Basado en el ejemplo oficial de Microsoft (onnxruntime-inference-examples/js/sd-turbo, MIT): los pesos
 * en ONNX de SD-Turbo viven en `schmuell/sd-turbo-ort-web` (Hugging Face) y se guardan en la caché del
 * navegador (Cache API). Aquí NO se ejecuta el modelo: esto es el núcleo PURO —manifiesto de archivos,
 * detección de WebGPU y flujo— para poder probarlo sin red ni GPU. El ONNX Runtime Web corre en un worker
 * (siguiente parte de la cadena) y se habla con él mediante `MotorSdTurbo`.
 *
 * Lo que NO hace: bajar los pesos sin permiso, prometer tamaños sin medir, ni servir el modelo cuando el
 * navegador no tiene WebGPU con fp16 (entonces se dice y se usan las demás capas del plan).
 *
 * CÓMO SE ENCHUFA (esto es el núcleo; el cableado es de otra parte de la cadena, AGENTS.md: «el cableado
 * va en su propia tarea»):
 *   · El plan ya tiene la capa «navegador» con el motor «onnx-web» (src/lib/imagenes/plan.ts) y la ejecuta
 *     `ejecutarOpcionReal` (src/ai/astraura/media/proveedor-neuronas.ts) con el generador que se registra
 *     con `registrarGeneradorTab`. Mientras nadie se registre ahí, la capa «navegador» no se ofrece y se
 *     dice en el descarte («la pestaña no tiene el generador WebGPU registrado»).
 *   · La forma que espera ese enganche es `(prompt, semilla) => { url?: string; ref?: string } | null`: aquí
 *     la imagen sale como `data:` en `ResultadoFlujoSdTurbo.imagen`, y `null` quiere decir «aquí no se
 *     puede», que es lo que hace que el plan siga con la siguiente capa (neuronas, malla o web gratis).
 *   · El permiso de descarga y el espacio libre no se inventan aquí: los decide quien llama (la pestaña) y
 *     se reciben en `OpcionesFlujo.permiso` y `OpcionesFlujo.espacio`.
 */
import { espacioSuficiente } from "./hierro-local";
import { modeloPorId, type ModeloImagen } from "../modelos";

/**
 * Versión exacta de onnxruntime-web que corresponde al ejemplo oficial (fijada, sin rangos): el ejemplo de
 * Microsoft pide «^1.17.1» en su package.json y aquí se fija 1.17.1, que es la que instala el worker.
 */
export const VERSION_ONNXRUNTIME_WEB = "1.17.1";

/** Dónde viven los pesos en ONNX que usa el ejemplo oficial. */
export const BASE_MODELOS_SD_TURBO = "https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main";

/** Nombre de la caché del navegador donde se guardan los pesos (el ejemplo usa «onnx»). */
export const CACHE_MODELOS_SD_TURBO = "onnx";

export type GrupoSdTurbo = "unet" | "text_encoder" | "vae_decoder" | "tokenizer";
export interface ArchivoSdTurbo { grupo: GrupoSdTurbo; ruta: string; bytes: number; pesado: boolean }

export interface AdaptadorWebGPU { features: { has(capacidad: string): boolean } }
export interface NavegadorWebGPU { gpu?: { requestAdapter(): Promise<AdaptadorWebGPU | null> } }
export interface SondaWebGPU { gpu: boolean; adaptador: boolean; fp16: boolean }

export type EstadoSdTurbo = "sin-webgpu" | "sin-permiso" | "sin-espacio" | "descargando" | "listo" | "generando" | "hecho" | "error";
export interface ProgresoDescarga { hechos: number; total: number; bytesHechos: number; bytesTotal: number }
export interface EventoSdTurbo { estado: EstadoSdTurbo; mensaje: string; progreso?: ProgresoDescarga; imagen?: string }

export interface MotorSdTurbo {
  preparar(): Promise<void>;
  cargar(archivos: readonly ArchivoSdTurbo[], alCambiar?: (p: ProgresoDescarga) => void): Promise<{ deCache: boolean }>;
  generar(prompt: string, semilla: number): Promise<string>;
}

/**
 * Espacio que declara el navegador: `navigator.storage.estimate()` devuelve `{ quota, usage }`, que aquí
 * llegan como `cuotaBytes` y `usadoBytes`. Ojo: es una estimación del almacenamiento del navegador entero
 * (no solo de la caché «onnx»), así que la regla del triple se cumple por encima de lo necesario.
 */
export interface EspacioNavegador { cuotaBytes: number; usadoBytes: number }
export interface OpcionesFlujo {
  motor: MotorSdTurbo;
  sonda: SondaWebGPU;
  espacio: EspacioNavegador | null;
  permiso: boolean;
  prompt: string;
  semilla?: number;
  alCambiar?: (e: EventoSdTurbo) => void;
}
export interface ResultadoFlujoSdTurbo {
  ok: boolean;
  estado: EstadoSdTurbo;
  mensaje: string;
  imagen?: string;
  /** Si es true, quien llama debe seguir con las demás capas del plan (web gratis, neuronas…). */
  usarOtrasCapas: boolean;
}

/**
 * Los archivos exactos que hacen falta, con el tamaño REAL medido en Hugging Face (2026-10-22, comprobado
 * uno por uno contra la API del repo `schmuell/sd-turbo-ort-web`): los tres pesos en ONNX que usa el ejemplo
 * oficial más el tokenizador CLIP y las configuraciones. Solo se descargan con permiso y con el triple de
 * espacio libre (§8); nunca solos.
 *
 * Sobre el tokenizador: el ejemplo oficial lo saca con transformers.js (`@xenova/transformers`, MIT) del
 * repo `Xenova/clip-vit-base-patch16`; aquí se listan los archivos del tokenizador CLIP que trae el repo de
 * ONNX (mismos nombres, tamaños medidos y distintos de los de Xenova). Quien implemente el worker tiene que
 * elegir UNA fuente y no descargar las dos. El scheduler NO hace falta: el ejemplo implementa el paso
 * (Euler) en JavaScript.
 */
export const ARCHIVOS_SD_TURBO: readonly ArchivoSdTurbo[] = [
  { grupo: "unet", ruta: "unet/model.onnx", bytes: 1733430199, pesado: true },
  { grupo: "text_encoder", ruta: "text_encoder/model.onnx", bytes: 681393168, pesado: true },
  { grupo: "vae_decoder", ruta: "vae_decoder/model.onnx", bytes: 99094314, pesado: true },
  { grupo: "tokenizer", ruta: "tokenizer/vocab.json", bytes: 1059962, pesado: false },
  { grupo: "tokenizer", ruta: "tokenizer/merges.txt", bytes: 524619, pesado: false },
  { grupo: "tokenizer", ruta: "tokenizer/tokenizer_config.json", bytes: 855, pesado: false },
  { grupo: "tokenizer", ruta: "tokenizer/special_tokens_map.json", bytes: 574, pesado: false },
  { grupo: "text_encoder", ruta: "text_encoder/config.json", bytes: 703, pesado: false },
  { grupo: "unet", ruta: "unet/config.json", bytes: 1952, pesado: false },
  { grupo: "vae_decoder", ruta: "vae_decoder/config.json", bytes: 740, pesado: false },
];

/** Peso total de la descarga (los pesados son los que la persona tiene que ver antes de aceptar). */
export function totalBytesSDTurbo(archivos: readonly ArchivoSdTurbo[] = ARCHIVOS_SD_TURBO): number {
  return archivos.reduce((t, a) => t + a.bytes, 0);
}

/** URL de descarga de un archivo (la misma que usa el ejemplo oficial). */
export function urlDeArchivo(a: ArchivoSdTurbo): string {
  return `${BASE_MODELOS_SD_TURBO}/${a.ruta}`;
}

/** «2,3 GB» o «640 MB», con coma decimal (español). */
export function formateaBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
}

/** La ficha de SD-Turbo en el catálogo (una sola fuente de verdad: src/lib/imagenes/modelos.ts). */
export function fichaSdTurbo(): ModeloImagen | undefined {
  return modeloPorId("sd-turbo");
}
/** El navegador real (en el servidor no hay: la detección se hace en la pestaña). */
function navegadorPorDefecto(): NavegadorWebGPU {
  return (globalThis.navigator as unknown as NavegadorWebGPU | undefined) ?? {};
}

/**
 * Detecta WebGPU en la pestaña: existe (navigator.gpu), se abre un adaptador (hay GPU utilizable) y
 * trae shader-f16 (el ejemplo oficial lo exige: sin f16 no carga los pesos y avisa).
 */
export async function sondeaWebGPU(nav: NavegadorWebGPU = navegadorPorDefecto()): Promise<SondaWebGPU> {
  if (!nav.gpu) return { gpu: false, adaptador: false, fp16: false };
  try {
    const adaptador = await nav.gpu.requestAdapter();
    if (!adaptador) return { gpu: true, adaptador: false, fp16: false };
    let fp16 = false;
    try {
      fp16 = adaptador.features.has("shader-f16");
    } catch {
      fp16 = false;
    }
    return { gpu: true, adaptador: true, fp16 };
  } catch {
    return { gpu: true, adaptador: false, fp16: false };
  }
}

/** ¿Se puede usar SD-Turbo aquí? Y si no, POR QUÉ (para decirlo, no para fallar en silencio). */
export function evaluaWebGPU(s: SondaWebGPU): { disponible: boolean; motivo: string } {
  if (!s.gpu) {
    return { disponible: false, motivo: "Este navegador no tiene WebGPU: SD-Turbo no puede correr aquí y las imágenes se piden a tus neuronas o a la web gratis." };
  }
  if (!s.adaptador) {
    return { disponible: false, motivo: "El navegador tiene WebGPU pero no se ha podido abrir un adaptador de GPU: SD-Turbo no puede correr aquí y las imágenes se piden a tus neuronas o a la web gratis." };
  }
  if (!s.fp16) {
    return { disponible: false, motivo: "Tu GPU no da soporte fp16 (shader-f16), que es lo que pide el ejemplo oficial de SD-Turbo: las imágenes se piden a tus neuronas o a la web gratis." };
  }
  return { disponible: true, motivo: "WebGPU con fp16: SD-Turbo puede correr en esta pestaña, sin instalar nada." };
}

/** Espacio libre según lo que declara el navegador (`navigator.storage.estimate()`). */
export function espacioLibreBytes(e: EspacioNavegador): number {
  return Math.max(0, e.cuotaBytes - e.usadoBytes);
}
/** Mensaje de error sin filtrar secretos ni apilares raros. */
function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "error desconocido";
}

/**
 * El flujo completo de SD-Turbo en la pestaña: detectar › pedir permiso › comprobar el espacio (el triple)
 * › descargar a la caché del navegador › generar. Todo lo que se puede decidir sin red ni GPU se decide
 * aquí; lo que necesita el modelo entra por `MotorSdTurbo` (el worker de la parte siguiente).
 * Si no hay WebGPU o el motor falla, se dice y se sigue con las demás capas del plan (`usarOtrasCapas`).
 */
export async function flujoSdTurbo(o: OpcionesFlujo): Promise<ResultadoFlujoSdTurbo> {
  const avisa = (e: EventoSdTurbo) => o.alCambiar?.(e);
  const webgpu = evaluaWebGPU(o.sonda);
  if (!webgpu.disponible) {
    avisa({ estado: "sin-webgpu", mensaje: webgpu.motivo });
    return { ok: false, estado: "sin-webgpu", mensaje: webgpu.motivo, usarOtrasCapas: true };
  }
  const total = totalBytesSDTurbo();
  if (!o.permiso) {
    const m = `SD-Turbo necesita descargar ${formateaBytes(total)} de pesos (a la caché de este navegador, la primera vez; después se reutilizan). ¿Los descargas?`;
    avisa({ estado: "sin-permiso", mensaje: m });
    return { ok: false, estado: "sin-permiso", mensaje: m, usarOtrasCapas: false };
  }
  if (!o.espacio) {
    const m = "No se ha podido comprobar el espacio libre de este navegador: no se descarga nada (se usa la web gratis o tus neuronas).";
    avisa({ estado: "sin-espacio", mensaje: m });
    return { ok: false, estado: "sin-espacio", mensaje: m, usarOtrasCapas: false };
  }
  const espacio = espacioSuficiente(espacioLibreBytes(o.espacio), total);
  if (!espacio.ok) {
    avisa({ estado: "sin-espacio", mensaje: espacio.mensaje });
    return { ok: false, estado: "sin-espacio", mensaje: espacio.mensaje, usarOtrasCapas: false };
  }
  try {
    await o.motor.preparar();
    avisa({ estado: "descargando", mensaje: `Descargando ${formateaBytes(total)} de pesos…` });
    await o.motor.cargar(ARCHIVOS_SD_TURBO, (p) =>
      avisa({ estado: "descargando", mensaje: `Descargando pesos ${p.hechos} de ${p.total}…`, progreso: p }),
    );
    avisa({ estado: "listo", mensaje: "SD-Turbo listo en esta pestaña." });
    avisa({ estado: "generando", mensaje: "Generando la imagen…" });
    const imagen = await o.motor.generar(o.prompt, o.semilla ?? 1);
    avisa({ estado: "hecho", mensaje: "Imagen lista: se ha generado en tu navegador, sin salir de tu aparato.", imagen });
    return { ok: true, estado: "hecho", mensaje: "Imagen generada en tu navegador.", imagen, usarOtrasCapas: false };
  } catch (e) {
    const m = `SD-Turbo ha fallado en el navegador: ${mensajeDeError(e)}. Las imágenes se piden a la web gratis o a tus neuronas.`;
    avisa({ estado: "error", mensaje: m });
    return { ok: false, estado: "error", mensaje: m, usarOtrasCapas: true };
  }
}

/**
 * Licencia de SD-Turbo: la del catálogo, CONDICIONADA y SIN COMPROBAR DEL TODO (su LICENSE.md de Stability
 * no lleva etiqueta en Hugging Face). Para un uso comercial, quien decide tiene que revisar los términos.
 *
 * Comprobado el 2026-10-22, porque hay dos textos distintos: el repo del modelo (`stabilityai/sd-turbo`) no
 * tiene etiqueta de licencia en Hugging Face y su LICENSE.md es la «Stability AI Community License»
 * (5-7-2024): investigación y no comercial gratis, y comercial con registro mientras los ingresos anuales
 * sean menores de 1 M USD. En cambio el repo de ONNX del que salen los pesos (`schmuell/sd-turbo-ort-web`)
 * declara «stabilityai-non-comercial» y trae la versión antigua (28-11-2023) de esa licencia. Con dos
 * textos distintos, el estado honesto es «sin comprobar del todo» y el uso «condicionado».
 */
export const LICENCIA_SD_TURBO = {
  estado: "sin-comprobar-del-todo",
  uso: "condicionado",
  texto: "SD-Turbo (stabilityai/sd-turbo): licencia de Stability AI (su LICENSE.md, sin etiqueta en Hugging Face). Condicionada y sin comprobar del todo: el uso comercial está limitado (hay que registrarse en https://stability.ai/community-license mientras los ingresos anuales sean menores de 1 millón de USD) y el repo del que se descargan los pesos trae otra versión de la licencia. Si lo usas en comercial, revisa los dos textos antes de publicarlo.",
} as const;

/** Textos para la interfaz, en claro y sin jerga. */
export const TEXTOS_SD_TURBO = {
  titulo: "SD-Turbo en esta pestaña (WebGPU)",
  resumen: "Sin instalar nada: los pesos se descargan una vez a la caché de tu navegador y se reutilizan.",
  licencia: LICENCIA_SD_TURBO.texto,
  otrasCapas: "Aquí no se puede: las imágenes se pedirán a tus neuronas o a la web gratis.",
} as const;
