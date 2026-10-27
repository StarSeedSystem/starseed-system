// Cuantización de transformers (Hugging Face) por tipo de procesador.
// Datos de referencia para Recursos de IA: qué método funciona en qué dispositivo, aparte del OS.
// Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR y Quark: se añaden si hacen falta.

export type Soporte = "ok" | "parcial" | "no";
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
  id: string;
  nombre: string;
  alaVuelta: boolean;
  soporte: Record<DispositivoHF, Soporte>;
  bitsMin: number;
  bitsMax: number;
  peft: boolean | null;
  enlace: string;
}

export const FUENTE_METODOS_HF =
  "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
  "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en ternario por QAT. No aplicar esta tabla a BitNet ni a Ternary Bonsai.";

// Fila: [id, nombre, alaVuelta, soporte "cpu cuda rocm metal intel", bits "min-max", peft, enlace]
type S = Soporte;
type Fila = [string, string, boolean, string, string, boolean | null, string];

const FILAS: Fila[] = [
  ["awq", "AWQ", false, "ok ok ok no ok", "4-4", true, "https://github.com/casper-hansen/AutoAWQ"],
  [
    "bitsandbytes",
    "bitsandbytes",
    true,
    "ok ok parcial parcial ok",
    "4-8",
    true,
    "https://github.com/bitsandbytes-foundation/bitsandbytes",
  ],
  ["gguf", "GGUF (llama.cpp)", false, "ok ok no ok ok", "1-8", false, "https://github.com/ggerganov/llama.cpp"],
  ["gptqmodel", "GPT-QModel", false, "ok ok ok ok ok", "2-8", true, "https://github.com/ModelCloud/GPTQModel"],
  ["hqq", "HQQ", true, "ok ok no no ok", "1-8", true, "https://github.com/mobiusml/hqq/"],
  [
    "metal",
    "Metal (kernels de Apple Silicon)",
    true,
    "no no no ok no",
    "2-8",
    false,
    "https://huggingface.co/kernels-community/mlx-quantization-metal-kernels",
  ],
  [
    "optimum-quanto",
    "optimum-quanto",
    true,
    "ok ok no ok ok",
    "2-8",
    false,
    "https://github.com/huggingface/optimum-quanto",
  ],
  ["torchao", "torchao", true, "ok ok no parcial ok", "4-8", null, "https://github.com/pytorch/ao"],
  ["sinq", "SINQ", true, "ok ok parcial parcial parcial", "2-8", false, "https://github.com/huawei-csl/SINQ"],
];

function metodoDeFila([
  id,
  nombre,
  alaVuelta,
  crudo,
  bits,
  peft,
  enlace,
]: Fila): MetodoCuantizacion {
  const [cpu, cuda, rocm, metal, intel] = crudo.split(" ") as [S, S, S, S, S];
  const [min, max] = bits.split("-").map(Number) as [number, number];
  return {
    id,
    nombre,
    alaVuelta,
    soporte: { cpu, cuda, rocm, metal, intel },
    bitsMin: min,
    bitsMax: max,
    peft,
    enlace,
  };
}

export const METODOS_HF: MetodoCuantizacion[] = FILAS.map(metodoDeFila);

export interface OpcionesCuantizacion {
  alaVuelta?: boolean;
  peft?: boolean;
  bitsMax?: number;
}

/** Método apto antes (ok=0) que con soporte parcial (=1); «no» ya se filtró fuera. */
function rangoSoporte(m: MetodoCuantizacion, dispositivo: DispositivoHF): number {
  return m.soporte[dispositivo] === "ok" ? 0 : 1;
}

/** Métodos aptos en un dispositivo, filtrados y ordenados: ok antes que parcial, a igualdad por nombre. */
export function cuantizacionesPara(
  dispositivo: DispositivoHF,
  op?: OpcionesCuantizacion,
): MetodoCuantizacion[] {
  const alVuelo = op?.alaVuelta === true;
  const peftSi = op?.peft === true;
  const bitsLimite = op?.bitsMax;
  const aptos = METODOS_HF.filter((m) => {
    if (m.soporte[dispositivo] === "no") return false;
    if (alVuelo && !m.alaVuelta) return false;
    if (peftSi && m.peft !== true) return false;
    if (bitsLimite !== undefined && m.bitsMin > bitsLimite) return false;
    return true;
  });
  return aptos.sort((a, b) => {
    const rango = rangoSoporte(a, dispositivo) - rangoSoporte(b, dispositivo);
    if (rango !== 0) return rango;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
