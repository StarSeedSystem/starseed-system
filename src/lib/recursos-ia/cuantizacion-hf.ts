/**
 * Matriz de cuantización de transformers por tipo de procesador — referencia para Recursos de IA.
 *
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR y Quark:
 * se añaden si hacen falta.
 *
 * PURO (lo importa el cliente): nada de `node:*`, sin red ni disco. Solo datos y un filtro.
 */

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
  "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen ya entrenados en ternario por QAT. Esta tabla no se aplica a BitNet ni a Ternary Bonsai.";

/** Atajo para escribir el soporte en el orden cpu, cuda, rocm, metal, intel. */
function s(
  cpu: Soporte,
  cuda: Soporte,
  rocm: Soporte,
  metal: Soporte,
  intel: Soporte,
): Record<DispositivoHF, Soporte> {
  return { cpu, cuda, rocm, metal, intel };
}

const PESO: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

export const METODOS_HF: MetodoCuantizacion[] = [
  // AWQ: solo 4 bits y sin cuantización al vuelo; GPU NVIDIA, AMD e Intel.
  { id: "awq", nombre: "AWQ", alaVuelta: false, soporte: s("ok", "ok", "ok", "no", "ok"), bitsMin: 4, bitsMax: 4, peft: true,
    enlace: "https://github.com/casper-hansen/AutoAWQ" },
  // bitsandbytes: 4/8 bits al vuelo; ROCm y Metal en parcial.
  { id: "bitsandbytes", nombre: "bitsandbytes", alaVuelta: true, soporte: s("ok", "ok", "parcial", "parcial", "ok"), bitsMin: 4, bitsMax: 8, peft: true,
    enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes" },
  // GGUF (llama.cpp): de 1 a 8 bits; sin ROCm ni PEFT.
  { id: "gguf", nombre: "GGUF (llama.cpp)", alaVuelta: false, soporte: s("ok", "ok", "no", "ok", "ok"), bitsMin: 1, bitsMax: 8, peft: false,
    enlace: "https://github.com/ggerganov/llama.cpp" },
  // GPT-QModel: 2/3/4/8 bits; funciona en los cinco procesadores.
  { id: "gptqmodel", nombre: "GPT-QModel", alaVuelta: false, soporte: s("ok", "ok", "ok", "ok", "ok"), bitsMin: 2, bitsMax: 8, peft: true,
    enlace: "https://github.com/ModelCloud/GPTQModel" },
  // HQQ: 1/8 bits al vuelo; solo CPU, CUDA e Intel.
  { id: "hqq", nombre: "HQQ", alaVuelta: true, soporte: s("ok", "ok", "no", "no", "ok"), bitsMin: 1, bitsMax: 8, peft: true,
    enlace: "https://github.com/mobiusml/hqq" },
  // Metal: kernels de Apple Silicon; exclusivo de Metal, sin CPU ni GPU ajenas.
  { id: "metal", nombre: "Metal (kernels de Apple Silicon)", alaVuelta: true, soporte: s("no", "no", "no", "ok", "no"), bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://huggingface.co/kernels-community/mlx-quantization-metal-kernels" },
  // optimum-quanto: 2/4/8 bits al vuelo; sin ROCm ni PEFT.
  { id: "optimum-quanto", nombre: "optimum-quanto", alaVuelta: true, soporte: s("ok", "ok", "no", "ok", "ok"), bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://github.com/huggingface/optimum-quanto" },
  // torchao: 4/8 bits; Metal en parcial y PEFT desconocido.
  { id: "torchao", nombre: "torchao", alaVuelta: true, soporte: s("ok", "ok", "no", "parcial", "ok"), bitsMin: 4, bitsMax: 8, peft: null,
    enlace: "https://github.com/pytorch/ao" },
  // SINQ: 2/3/4/6/8 bits; ROCm, Metal e Intel en parcial.
  { id: "sinq", nombre: "SINQ", alaVuelta: true, soporte: s("ok", "ok", "parcial", "parcial", "parcial"), bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://github.com/huawei-csl/SINQ" },
];

/**
 * Métodos que funcionan en un dispositivo, con los filtros opcionales:
 * `alaVuelta` (solo cuantización al vuelo), `peft` (solo con afinado PEFT) y
 * `bitsMax` (el método empieza en `bitsMin` ≤ `bitsMax`). Ordena `ok` antes que
 * `parcial` y, a igualdad, por nombre.
 */
export function cuantizacionesPara(
  dispositivo: DispositivoHF,
  op: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number } = {},
): MetodoCuantizacion[] {
  return METODOS_HF.filter((m) => {
    if (m.soporte[dispositivo] === "no") return false;
    if (op.alaVuelta === true && !m.alaVuelta) return false;
    if (op.peft === true && m.peft !== true) return false;
    if (op.bitsMax !== undefined && m.bitsMin > op.bitsMax) return false;
    return true;
  }).sort((a, b) => {
    const orden = PESO[a.soporte[dispositivo]] - PESO[b.soporte[dispositivo]];
    return orden !== 0 ? orden : a.nombre.localeCompare(b.nombre, "es");
  });
}
