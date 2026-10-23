/**
 * ComfyUI · PLANTILLAS PURAS DE FLUJO (IMG1020A). Contrato: architecture/repos-libreria-1020d.md §2.
 *
 * Un ComfyUI real no acepta `{prompt: texto}`: pide el GRAFO en formato API, un objeto
 * `{ "<id>": { class_type, inputs } }` donde cada enlace es `["<id>", <salida>]`. Estos flujos son DATOS
 * puros (sin red ni disco) y solo usan nodos del núcleo: un nodo de terceros ejecuta código.
 */

export type GrafoComfy = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type EnlaceComfy = [string, number];

export const NODOS_NUCLEO = [
  "CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler",
  "VAEDecode", "SaveImage", "LoadImage", "VAEEncode", "ImageScaleBy",
] as const;
export const MUESTREADORES = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde"] as const;
export const PLANIFICADORES = ["normal", "karras", "simple"] as const;
export const FORMATOS = ["1:1", "4:5", "9:16", "16:9"] as const;
export const METODOS_ESCALADO = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"] as const;
export type Muestreador = (typeof MUESTREADORES)[number];
export type Planificador = (typeof PLANIFICADORES)[number];
export type FormatoPublicacion = (typeof FORMATOS)[number];
export type MetodoEscalado = (typeof METODOS_ESCALADO)[number];
export type Familia = "1mp" | "sd15";

const TAMANOS: Record<Familia, Record<FormatoPublicacion, readonly [number, number]>> = {
  "1mp": { "1:1": [1024, 1024], "4:5": [896, 1120], "9:16": [768, 1360], "16:9": [1360, 768] },
  sd15: { "1:1": [512, 512], "4:5": [448, 560], "9:16": [384, 680], "16:9": [680, 384] },
};

export interface Dimensiones {
  formato: FormatoPublicacion; familia: Familia; ancho: number; alto: number; megapixeles: number;
}
export interface ParametrosFlujo {
  modelo: string; positivo: string; negativo?: string; semilla: number;
  pasos?: number; cfg?: number; muestreador?: Muestreador; planificador?: Planificador; prefijo?: string;
}
export interface PeticionTextoAImagen extends ParametrosFlujo {
  formato?: FormatoPublicacion; familia?: Familia; ancho?: number; alto?: number;
}
export interface PeticionImagenAImagen extends ParametrosFlujo { imagen: string; denoise?: number }
export interface PeticionEscalar { imagen: string; escala?: number; metodo?: MetodoEscalado; prefijo?: string }
export interface PeticionVariaciones extends Omit<PeticionTextoAImagen, "semilla"> { semillas: readonly number[] }
export interface Incidencia { nodo?: string; mensaje: string }

const error = (mensaje: string): never => {
  throw new Error(`Flujo ComfyUI: ${mensaje}.`);
};
const acotar = (nombre: string, valor: number, min: number, max: number): number =>
  Number.isFinite(valor) && valor >= min && valor <= max
    ? valor
    : error(`${nombre} debe estar entre ${min} y ${max} (recibido ${String(valor)})`);
const texto = (nombre: string, valor: string): string =>
  valor.trim() ? valor : error(`${nombre} no puede estar vacío`);
const semilla = (valor: number): number =>
  Number.isSafeInteger(valor) && valor >= 0
    ? valor
    : error(`la semilla debe ser un entero mayor o igual que 0 (recibida ${String(valor)})`);
const elegir = <T extends string>(nombre: string, valor: string, lista: readonly T[]): T =>
  (lista as readonly string[]).includes(valor)
    ? (valor as T)
    : error(`${nombre} «${valor}» no está permitido: usa ${lista.join(", ")}`);

type Normalizado = {
  modelo: string; positivo: string; negativo: string; semilla: number;
  pasos: number; cfg: number; muestreador: Muestreador; planificador: Planificador; prefijo: string;
};

function normalizar(p: ParametrosFlujo): Normalizado {
  return {
    modelo: texto("el modelo (checkpoint)", p.modelo),
    positivo: texto("el texto positivo", p.positivo),
    negativo: p.negativo ?? "",
    semilla: semilla(p.semilla),
    pasos: Math.round(acotar("los pasos", p.pasos ?? 25, 1, 60)),
    cfg: acotar("el cfg", p.cfg ?? 7, 1, 15),
    muestreador: elegir("el muestreador", p.muestreador ?? "euler", MUESTREADORES),
    planificador: elegir("el planificador", p.planificador ?? "normal", PLANIFICADORES),
    prefijo: p.prefijo ?? "starseed",
  };
}

function base(x: Normalizado): GrafoComfy {
  return {
    modelo: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: x.modelo } },
    positivo: { class_type: "CLIPTextEncode", inputs: { text: x.positivo, clip: ["modelo", 1] } },
    negativo: { class_type: "CLIPTextEncode", inputs: { text: x.negativo, clip: ["modelo", 1] } },
  };
}

function muestreo(x: Normalizado, latente: EnlaceComfy, denoise: number): GrafoComfy[string] {
  return {
    class_type: "KSampler",
    inputs: {
      seed: x.semilla, steps: x.pasos, cfg: x.cfg, sampler_name: x.muestreador, scheduler: x.planificador,
      denoise, model: ["modelo", 0], positive: ["positivo", 0], negative: ["negativo", 0], latent_image: latente,
    },
  };
}

function salida(x: Normalizado, samples: EnlaceComfy): GrafoComfy {
  return {
    decodificar: { class_type: "VAEDecode", inputs: { samples, vae: ["modelo", 2] } },
    guardar: { class_type: "SaveImage", inputs: { filename_prefix: x.prefijo, images: ["decodificar", 0] } },
  };
}

function lados(p: PeticionTextoAImagen): { ancho: number; alto: number } {
  const d = dimensiones(p.formato ?? "1:1", p.familia);
  const ancho = p.ancho ?? d.ancho, alto = p.alto ?? d.alto;
  for (const [nombre, lado] of [["el ancho", ancho], ["el alto", alto]] as const) {
    acotar(nombre, lado, 8, 2048);
    if (!Number.isInteger(lado)) error(`${nombre} debe ser un entero (recibido ${String(lado)})`);
    if (lado % 8 !== 0) error(`${nombre} debe ser múltiplo de 8 (recibido ${String(lado)})`);
  }
  return { ancho, alto };
}

export function dimensiones(formato: FormatoPublicacion, familia: Familia = "1mp"): Dimensiones {
  const [ancho, alto] = TAMANOS[familia][formato];
  return { formato, familia, ancho, alto, megapixeles: Math.round((ancho * alto) / 10000) / 100 };
}

export function textoAImagen(p: PeticionTextoAImagen): GrafoComfy {
  return {};
}
export function imagenAImagen(p: PeticionImagenAImagen): GrafoComfy {
  return {};
}
export function escalar(p: PeticionEscalar): GrafoComfy {
  return {};
}
export function variaciones(p: PeticionVariaciones): GrafoComfy[] {
  return [];
}
export function validarGrafo(g: GrafoComfy): Incidencia[] {
  return [];
}
