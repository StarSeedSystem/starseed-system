/**
 * Imágenes locales de Astraura · PAQUETE BASE SUGERIDO POR NEURONA (IMG1011). Contrato: architecture/astraura-imagenes.md §5.
 *
 * Al instalar la app (o cuando cambia el hierro o sale un modelo nuevo), Astraura sugiere qué instalar en
 * ESTA neurona: uno rápido, uno de calidad y, si cabe, uno que escriba texto legible o edite. No sugiere lo
 * que ya ofrece otra neurona tuya en la malla (lo usa desde allí) ni nada no comercial si el uso es
 * comercial. El disco lo comprueba el instalador con los tamaños reales de cada archivo. PURO.
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

export interface Sugerencia { papel: "rapido" | "calidad" | "texto"; modelo: ModeloImagen; motor: MotorImg; cuantizacion: Cuantizacion; porQue: string }
export interface PaqueteBase { instalar: Sugerencia[]; desdeLaMalla: string[]; nada?: string }

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

export function paqueteBase(
  h: HierroImg, opciones: { comercial: boolean; enLaMalla?: readonly string[]; permitirPersonal?: boolean }, catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN,
): PaqueteBase {
  const yo: NeuronaImg = {
    id: "esta neurona", capa: "dispositivo", gpu: h.gpu, vramGB: h.vramGB, ramLibreGB: h.ramGB,
    motores: motoresPosibles(h).filter((m) => m !== "onnx-web"), instalados: [], ocupada: false,
  };
  const permitirPersonal = opciones.permitirPersonal ?? false;
  const malla = new Set(opciones.enLaMalla ?? []);
  const soloCpu = h.gpu === "ninguna";
  const validos = catalogo
    .filter((m) => !(opciones.comercial && m.uso === "no-comercial"))
    .filter((m) => !(m.id === "qwen-image-2.1-turbo" && !permitirPersonal))
    // En CPU un modelo de gama alta tarda demasiados minutos por imagen: no se sugiere (sigue disponible a mano).
    .filter((m) => !(soloCpu && m.gama === "alta"))
    .map((m) => ({ m, c: cabe(m, yo) }))
    .filter((x) => x.c.ok)
    // Licencia más libre primero, luego más gama, sin cuantizar antes que cuantizado y, en CPU, menos pasos.
    .sort((a, b) => USO[a.m.uso] - USO[b.m.uso] || GAMA[a.m.gama] - GAMA[b.m.gama]
      || (a.c.cuantizacion === "q4" ? 1 : 0) - (b.c.cuantizacion === "q4" ? 1 : 0) || (soloCpu ? a.m.pasos - b.m.pasos : 0));
  const instalar: Sugerencia[] = [];
  const desdeLaMalla: string[] = [];
  for (const papel of ["rapido", "calidad", "texto"] as const) {
    const lista = validos.filter((x) => PAPEL[papel](x.m) && !instalar.some((s) => s.modelo.id === x.m.id));
    const x = lista[0];
    if (!x) continue;
    if (malla.has(x.m.id)) { desdeLaMalla.push(`${x.m.nombre}: ya lo ofrece otra neurona tuya; se usa desde allí.`); continue; }
    const gate = x.m.gated ? " Pide aceptar sus términos con una cuenta de Hugging Face." : "";
    const licenciaNota = x.m.id === "z-image-turbo" ? " Modelo libre (Apache-2.0)." : "";
    instalar.push({ papel, modelo: x.m, motor: x.c.motor!, cuantizacion: x.c.cuantizacion!, porQue: (x.c.motivo + gate + licenciaNota).trim() });
  }
  if (permitirPersonal) {
    const turbo = catalogo.find((m) => m.id === "qwen-image-2.1-turbo");
    if (turbo && !instalar.some((s) => s.modelo.id === turbo.id)) {
      const cuantizacionTurbo: Cuantizacion = h.ramGB >= 20 ? "q4" : "q4";
      const ggufNota = h.ramGB >= 20 ? "Q4_K_M 4,2 GB" : "Q3_K_S 2,72 GB";
      const porQueTurbo = `GGUF personal (${ggufNota}): Qwen-Image-2.1-Turbo solo con permitirPersonal.`;
      instalar.push({ papel: "calidad", modelo: turbo, motor: "sdcpp", cuantizacion: cuantizacionTurbo, porQue: porQueTurbo });
    }
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
