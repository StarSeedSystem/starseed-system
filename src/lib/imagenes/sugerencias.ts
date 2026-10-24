/**
 * Imágenes locales de Astraura · PAQUETE BASE SUGERIDO POR NEURONA (IMG1011). Contrato: architecture/astraura-imagenes.md §5.
 *
 * Al instalar la app (o cuando cambia el hierro o sale un modelo nuevo), Astraura sugiere qué instalar en
 * ESTA neurona: uno rápido, uno de calidad y, si cabe, uno que escriba texto legible o edite. No sugiere lo
 * que ya ofrece otra neurona tuya en la malla (lo usa desde allí) ni nada no comercial si el uso es
 * comercial. El disco lo comprueba el instalador con los tamaños reales de cada archivo. PURO.
 *
 * Los modelos de uso personal (Qwen Research, CC-BY-NC…) solo entran si la persona los activa con
 * `permitirPersonal`; sin ese permiso no se proponen, y nunca se proponen para un uso comercial.
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

export interface OpcionesPaquete {
  comercial: boolean;
  enLaMalla?: readonly string[];
  /** La persona activó modelos de uso personal (no comercial): solo para su uso propio, nunca comercial. */
  permitirPersonal?: boolean;
}

const TURBO_PERSONAL = "qwen-image-2.1-turbo";
/** GGUF verificados del Turbo, de mayor a menor; se elige el mayor que quepa con margen para el sistema. */
const GGUF_TURBO = [
  { archivo: "Q4_K_M", gb: 4.2 },
  { archivo: "Q3_K_S", gb: 2.72 },
] as const;
/** Margen sobre el peso del GGUF: en una Mac de 8 GB (6 GB dedicables) Q3_K_S cabe y Q4_K_M no. */
const MARGEN_GGUF = 1.6;

const gbConComa = (x: number) => String(x).replace(".", ",");

/** El mayor GGUF del Turbo que cabe en la memoria que esta neurona puede dedicar a imágenes. */
function ggufTurboQueCabe(h: HierroImg): (typeof GGUF_TURBO)[number] | null {
  const memoria = h.gpu === "nvidia" || h.gpu === "amd" ? (h.vramGB ?? 0) : h.ramGB;
  return GGUF_TURBO.find((v) => memoria >= v.gb * MARGEN_GGUF) ?? null;
}

export function paqueteBase(
  h: HierroImg, opciones: OpcionesPaquete, catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN,
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
    // El Turbo es personal: no entra por el reparto normal; solo se propone con permiso y con su motivo.
    .filter((m) => m.id !== TURBO_PERSONAL)
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
    // Z-Image-Turbo es la opción rápida libre: se dice en el porqué para que la licencia no se adivine.
    const libre = x.m.id === "z-image-turbo" ? " Modelo libre (Apache-2.0)." : "";
    instalar.push({ papel, modelo: x.m, motor: x.c.motor!, cuantizacion: x.c.cuantizacion!, porQue: (x.c.motivo + gate + libre).trim() });
  }
  // Modelo personal: solo con permiso explícito, fuera del uso comercial y con el GGUF que de verdad cabe.
  if (permitirPersonal && !opciones.comercial && motoresPosibles(h).includes("sdcpp")) {
    const turbo = catalogo.find((m) => m.id === TURBO_PERSONAL);
    const gguf = ggufTurboQueCabe(h);
    if (turbo && gguf) {
      if (malla.has(TURBO_PERSONAL)) {
        desdeLaMalla.push(`${turbo.nombre}: ya lo ofrece otra neurona tuya; se usa desde allí.`);
      } else {
        const sugerencia: Sugerencia = {
          papel: "calidad", modelo: turbo, motor: "sdcpp", cuantizacion: "q4",
          porQue: `GGUF personal (${gguf.archivo} ${gbConComa(gguf.gb)} GB): ${turbo.nombre} cuantizado para esta neurona; `
            + "su licencia Qwen Research solo permite investigación o uso propio, nunca publicaciones comerciales.",
        };
        // Sustituye a la calidad normal para no repetir el papel (la tarjeta usa el papel como clave).
        const i = instalar.findIndex((s) => s.papel === "calidad");
        if (i >= 0) instalar[i] = sugerencia; else instalar.push(sugerencia);
      }
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
