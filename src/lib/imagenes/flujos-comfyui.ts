/**
 * Imágenes locales de Astraura · PLANTILLAS PURAS DE FLUJO COMFYUI (IMG1020A). Contrato: architecture/repos-libreria-1020d.md §2.
 *
 * Un ComfyUI real exige el GRAFO del flujo en formato API: objeto `{"<id>": {class_type, inputs}}` con enlaces
 * `["<id>", <salida>]`. Aquí se construyen de verdad, con nodos del NÚCLEO (ningún nodo personalizado de
 * terceros: ejecuta código y no entra sin revisar), para los formatos de publicación 1:1, 4:5, 9:16 y 16:9,
 * con lados múltiplos de 8 cerca de 1 megapíxel (y una variante de ~0,26 MP para la gama SD 1.5). El cliente
 * que los envía llega en IMG1020B; las SEMILLAS las da quien llama. PURO: sin red, disco ni procesos. Los
 * flujos son DATOS: se guardan, se comparten y se publican en la Biblioteca como cualquier entidad.
 */
/** Nodos del núcleo de ComfyUI (lista blanca). Fuera de ella no se construye nada. */
export const NODOS_NUCLEO = ["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "LoadImage", "VAEEncode", "VAEDecode", "ImageScaleBy", "SaveImage"] as const;
export type NodoNucleo = (typeof NODOS_NUCLEO)[number];

export const MUESTREADORES_COMFYUI = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde"] as const;
export type MuestreadorComfyUI = (typeof MUESTREADORES_COMFYUI)[number];
export const PLANIFICADORES_COMFYUI = ["normal", "karras", "simple"] as const;
export type PlanificadorComfyUI = (typeof PLANIFICADORES_COMFYUI)[number];
export type FormatoPublicacion = "1:1" | "4:5" | "9:16" | "16:9";
export const FORMATOS_PUBLICACION: readonly FormatoPublicacion[] = ["1:1", "4:5", "9:16", "16:9"];

/** Proporción del formato (ancho ÷ alto), dato verificable en los propios nombres (p. ej. 16 ÷ 9). */
const PROPORCION: Record<FormatoPublicacion, number> = { "1:1": 1, "4:5": 0.8, "9:16": 9 / 16, "16:9": 16 / 9 };

/** Área destino: ≈1 MP general; ≈0,26 MP (512²) para la gama SD 1.5, donde más se degrada. */
export type EscalaImagen = "estandar" | "sd15";
export const MEGAPIXELES: Record<EscalaImagen, number> = { estandar: 1, sd15: 0.26 };
/** Nodo: cada entrada del grafo en formato API. `class_type` siempre de la lista blanca. */
export interface NodoComfyUI { class_type: NodoNucleo; inputs: Record<string, unknown> }
/** Grafo en formato API de ComfyUI: objeto `{"<id>": nodo}` con enlaces `["<id>", <salida>]`. */
export type GrafoComfyUI = Record<string, NodoComfyUI>;
export interface Lados { ancho: number; alto: number }
export interface PeticionFlujo {
  checkpoint: string; positivo: string; negativo: string;
  formato: FormatoPublicacion; escala?: EscalaImagen; semilla: number;
  pasos: number; cfg: number;
  muestreador: MuestreadorComfyUI; planificador: PlanificadorComfyUI;
}

/** `imagen`: nombre del archivo que LoadImage lee de /input. `denoise`: cuánto reescribe (1 = casi desde cero). */
export interface PeticionImagenAImagen extends PeticionFlujo { imagen: string; denoise: number }

/** `metodo` es el del ImageScaleBy del núcleo. `factor`: >1 agranda, <1 achica. */
export interface PeticionEscalar { imagen: string; metodo: "nearest-exact" | "bilinear" | "area" | "bicubic" | "lanczos"; factor: number }

const aMultiplo8 = (v: number): number => Math.round(v / 8) * 8;

function validarAcotado(nombre: string, valor: number, min: number, max: number): void {
  if (!Number.isFinite(valor) || valor < min || valor > max) throw new Error(`${nombre} (${valor}) fuera de rango: se admite de ${min} a ${max}.`);
}

function validarDeLista(nombre: string, valor: string, lista: readonly string[]): void {
  if (!lista.includes(valor)) throw new Error(`${nombre} «${valor}» no está en la lista admitida: usa ${lista.join(", ")}.`);
}

function validarPeticion(p: PeticionFlujo): void {
  validarAcotado("El número de pasos", p.pasos, 1, 60);
  validarAcotado("El valor de CFG", p.cfg, 1, 15);
  if (!Number.isInteger(p.semilla) || p.semilla < 0) throw new Error(`La semilla (${p.semilla}) tiene que ser un número entero sin signo.`);
  validarDeLista("El formato", p.formato, FORMATOS_PUBLICACION);
  validarDeLista("El muestreador", p.muestreador, MUESTREADORES_COMFYUI);
  validarDeLista("El planificador", p.planificador, PLANIFICADORES_COMFYUI);
  if (!p.checkpoint.trim()) throw new Error("Falta el nombre del archivo del checkpoint para CheckpointLoaderSimple.");
}

/** Lados de un formato de publicación: múltiplos de 8, proporción fiel y área cerca del objetivo. */
export function ladosFormato(formato: FormatoPublicacion, escala: EscalaImagen = "estandar"): Lados {
  if (!(formato in PROPORCION)) throw new Error(`El formato «${formato}» no es de publicación: usa ${FORMATOS_PUBLICACION.join(", ")}.`);
  if (!(escala in MEGAPIXELES)) throw new Error(`La escala «${escala}» no existe: usa "estandar" (≈1 MP) o "sd15" (≈0,26 MP).`);
  const prop = PROPORCION[formato], alto = aMultiplo8(Math.sqrt((MEGAPIXELES[escala] * 1_000_000) / prop)), ancho = aMultiplo8(alto * prop);
  if (ancho > 2048 || alto > 2048) throw new Error(`Los lados ${ancho}×${alto} pasan de 2048, el tope del núcleo.`);
  return { ancho, alto };
}

/** Texto a imagen: CheckpointLoaderSimple → CLIPTextEncode (positivo y negativo) → EmptyLatentImage → KSampler → VAEDecode → SaveImage. */
export function textoAImagen(p: PeticionFlujo): GrafoComfyUI {
  validarPeticion(p);
  const { ancho, alto } = ladosFormato(p.formato, p.escala ?? "estandar");
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: p.positivo, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: p.negativo, clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: ancho, height: alto, batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { seed: p.semilla, steps: p.pasos, cfg: p.cfg, sampler_name: p.muestreador, scheduler: p.planificador, denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "starseed" } },
  };
}

/** Imagen a imagen: LoadImage → VAEEncode → KSampler con `denoise` → VAEDecode → SaveImage. */
export function imagenAImagen(p: PeticionImagenAImagen): GrafoComfyUI {
  validarPeticion(p);
  validarAcotado("El denoise", p.denoise, 0, 1);
  if (!p.imagen.trim()) throw new Error("Falta el nombre de la imagen de entrada que LoadImage lee de /input.");
  return {
    "1": { class_type: "LoadImage", inputs: { image: p.imagen } },
    "2": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: p.positivo, clip: ["2", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: p.negativo, clip: ["2", 1] } },
    "5": { class_type: "VAEEncode", inputs: { pixels: ["1", 0], vae: ["2", 2] } },
    "6": { class_type: "KSampler", inputs: { seed: p.semilla, steps: p.pasos, cfg: p.cfg, sampler_name: p.muestreador, scheduler: p.planificador, denoise: p.denoise, model: ["2", 0], positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0] } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["2", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "starseed" } },
  };
}

/** Escalado: LoadImage → ImageScaleBy. El tope del factor (8) lo pone el OS, no ComfyUI. */
export function escalar(p: PeticionEscalar): GrafoComfyUI {
  validarAcotado("El factor de escalado", p.factor, 0.01, 8);
  if (!p.imagen.trim()) throw new Error("Falta el nombre de la imagen de entrada que LoadImage lee de /input.");
  return {
    "1": { class_type: "LoadImage", inputs: { image: p.imagen } },
    "2": { class_type: "ImageScaleBy", inputs: { image: ["1", 0], upscale_method: p.metodo, scale_by: p.factor } },
  };
}

/** Variaciones: el MISMO flujo de texto a imagen, una vez por semilla, que da quien llama. */
export function variaciones(p: PeticionFlujo, semillas: readonly number[]): GrafoComfyUI[] {
  if (!semillas.length) throw new Error("Da al menos una semilla para variar el flujo.");
  return semillas.map((semilla) => textoAImagen({ ...p, semilla }));
}
