/**
 * Imágenes locales de Astraura · PAQUETE BASE SUGERIDO POR NEURONA (IMG1011). Contrato: architecture/astraura-imagenes.md §5.
 *
 * Al instalar la app (o cuando cambia el hierro o sale un modelo nuevo), Astraura sugiere qué instalar en
 * ESTA neurona: uno rápido (Z-Image-Turbo si cabe), uno de calidad y, si cabe, uno que escriba texto legible
 * o edite. No sugiere lo que ya ofrece otra neurona tuya en la malla (lo usa desde allí) ni nada no comercial
 * si el uso es comercial. Los modelos personales (Qwen-Image-2.1-Turbo en GGUF) solo entran si la persona los
 * activó con `permitirPersonal`, nunca por defecto y nunca en uso comercial. El disco lo comprueba el
 * instalador con los tamaños reales de cada archivo. PURO.
 */
import { MODELOS_IMAGEN, type ModeloImagen, type MotorImg } from "./modelos";
import { cabe, type Cuantizacion, type NeuronaImg } from "./plan";

export type SistemaNeurona = "macos" | "windows" | "linux" | "android" | "ios";

export interface HierroImg {
  so: SistemaNeurona;
  gpu: NeuronaImg["gpu"];
  vramGB: number | null;
  /** RAM que puede dedicar a imágenes cuando la neurona está tranquila (no la libre de este instante). */
  ramGB: number;
  webgpu: boolean;
}

/** Variantes GGUF verificadas del Turbo personal (unsloth), con el tamaño de sus pesos. */
export const GGUF_TURBO = [
  { archivo: "Q3_K_S", gb: 2.72, texto: "2,72 GB" },
  { archivo: "Q4_K_M", gb: 4.2, texto: "4,2 GB" },
] as const;
export type GgufTurbo = (typeof GGUF_TURBO)[number]["archivo"];

export interface Sugerencia {
  papel: "rapido" | "calidad" | "texto";
  modelo: ModeloImagen;
  motor: MotorImg;
  cuantizacion: Cuantizacion;
  /** Variante GGUF concreta (afina la cuantización «q4»); solo en modelos personales. */
  gguf?: GgufTurbo;
  porQue: string;
}
export interface PaqueteBase { instalar: Sugerencia[]; desdeLaMalla: string[]; nada?: string }

export interface OpcionesPaquete {
  comercial: boolean;
  enLaMalla?: readonly string[];
  /** La persona activó modelos de uso personal (no comercial) para su propio uso. Falso por defecto. */
  permitirPersonal?: boolean;
}

/** Motores que la app puede poner en cada sistema (stable-diffusion.cpp en todos menos iOS). */
export function motoresPosibles(h: HierroImg): MotorImg[] {
  const out: MotorImg[] = [];
  if (h.so !== "ios") out.push("sdcpp");
  if ((h.so === "linux" || h.so === "windows") && (h.gpu === "nvidia" || h.gpu === "amd")) out.push("comfyui", "diffusers");
  if (h.so === "macos" && h.gpu === "apple") out.push("comfyui");
  if (h.webgpu) out.push("onnx-web");
  return out;
}

const PAPEL: Record<Sugerencia["papel"], (m: ModeloImagen) => boolean> = {
  rapido: (m) => m.capacidades.includes("rapido") || m.pasos <= 8,
  calidad: () => true,
  texto: (m) => m.capacidades.includes("texto-legible") || m.capacidades.includes("edicion"),
};
const GAMA = { alta: 0, media: 1, entrada: 2, navegador: 3 } as const;
const USO = { libre: 0, atribucion: 1, condicionado: 2, "restringido-region": 3, "no-comercial": 4 } as const;

/**
 * Qwen-Image-2.1-Turbo en GGUF para uso personal. Solo se propone con `permitirPersonal` y nunca en uso
 * comercial. En la Mac de 8 GB se elige el Q3_K_S (deja sitio al codificador de texto); con más memoria
 * para imágenes, el Q4_K_M. La variante va en `gguf` y en el motivo para que el instalador sepa el archivo.
 */
function sugerenciaPersonal(h: HierroImg, catalogo: readonly ModeloImagen[]): Sugerencia | null {
  const m = catalogo.find((x) => x.id === "qwen-image-2.1-turbo");
  if (!m || m.uso !== "no-comercial" || !motoresPosibles(h).includes("sdcpp")) return null;
  const v = h.ramGB <= 8 ? GGUF_TURBO[0] : GGUF_TURBO[1];
  if (h.ramGB < v.gb) return null;
  return {
    papel: "calidad", modelo: m, motor: "sdcpp", cuantizacion: "q4", gguf: v.archivo,
    porQue: `Turbo personal en GGUF ${v.archivo} (${v.texto}): cabe en esta neurona. `
      + `Licencia ${m.licencia}: solo para tu uso personal, nunca para uso comercial ni para la malla.`,
  };
}

export function paqueteBase(
  h: HierroImg, opciones: OpcionesPaquete, catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN,
): PaqueteBase {
  const yo: NeuronaImg = {
    id: "esta neurona", capa: "dispositivo", gpu: h.gpu, vramGB: h.vramGB, ramLibreGB: h.ramGB,
    motores: motoresPosibles(h).filter((m) => m !== "onnx-web"), instalados: [], ocupada: false,
  };
  const malla = new Set(opciones.enLaMalla ?? []);
  const soloCpu = h.gpu === "ninguna";
  const validos = catalogo
    .filter((m) => !(opciones.comercial && m.uso === "no-comercial"))
    // En CPU un modelo de gama alta tarda demasiados minutos por imagen: no se sugiere (sigue disponible a mano).
    .filter((m) => !(soloCpu && m.gama === "alta"))
    .map((m) => ({ m, c: cabe(m, yo) }))
    .filter((x) => x.c.ok)
    // Licencia más libre primero, luego más gama, sin cuantizar antes que cuantizado y, en CPU, menos pasos.
    .sort((a, b) => USO[a.m.uso] - USO[b.m.uso] || GAMA[a.m.gama] - GAMA[b.m.gama]
      || (a.c.cuantizacion === "q4" ? 1 : 0) - (b.c.cuantizacion === "q4" ? 1 : 0) || (soloCpu ? a.m.pasos - b.m.pasos : 0));
  const instalar: Sugerencia[] = [];
  const desdeLaMalla: string[] = [];
  // El Turbo GGUF solo entra si la persona activó modelos personales y el uso no es comercial.
  const personal = opciones.permitirPersonal && !opciones.comercial ? sugerenciaPersonal(h, catalogo) : null;
  for (const papel of ["rapido", "calidad", "texto"] as const) {
    if (papel === "calidad" && personal) {
      if (malla.has(personal.modelo.id)) desdeLaMalla.push(`${personal.modelo.nombre}: ya lo ofrece otra neurona tuya; se usa desde allí.`);
      else instalar.push(personal);
      continue;
    }
    const lista = validos.filter((x) => PAPEL[papel](x.m) && !instalar.some((s) => s.modelo.id === x.m.id));
    // Z-Image-Turbo (libre) es la opción rápida de calidad: si cabe, va antes que cualquier otra.
    const x = (papel === "rapido" ? lista.find((y) => y.m.id === "z-image-turbo") : undefined) ?? lista[0];
    if (!x) continue;
    if (malla.has(x.m.id)) { desdeLaMalla.push(`${x.m.nombre}: ya lo ofrece otra neurona tuya; se usa desde allí.`); continue; }
    const gate = x.m.gated ? " Pide aceptar sus términos con una cuenta de Hugging Face." : "";
    instalar.push({ papel, modelo: x.m, motor: x.c.motor!, cuantizacion: x.c.cuantizacion!, porQue: x.c.motivo + gate });
  }
  if (h.webgpu && !instalar.length) {
    const web = catalogo.find((m) => m.motores.includes("onnx-web"));
    if (web && !(opciones.comercial && web.uso === "no-comercial")) {
      instalar.push({ papel: "rapido", modelo: web, motor: "onnx-web", cuantizacion: "nativa", porQue: "Sin instalar nada: en la pestaña con WebGPU." });
    }
  }
  return instalar.length || desdeLaMalla.length
    ? { instalar, desdeLaMalla }
    : { instalar, desdeLaMalla, nada: "Aquí no cabe ningún modelo local: las imágenes se piden a tus otras neuronas, a la malla o a la web gratis." };
}
