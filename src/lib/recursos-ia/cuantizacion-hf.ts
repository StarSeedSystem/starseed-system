/**
 * Tabla de cuantización de transformers por tipo de procesador.
 * Fuente: docs/source/en/quantization/overview.md (transformers v5.20.2).
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR
 * y Quark: se añaden si hacen falta.
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
  "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en " +
  "ternario por QAT. No apliques esta tabla a BitNet ni a Ternary Bonsai.";

export const METODOS_HF: MetodoCuantizacion[] = [
  {
    id: "awq", nombre: "AWQ", alaVuelta: false,
    soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" },
    bitsMin: 4, bitsMax: 4, peft: true,
    enlace: "https://github.com/casper-hansen/AutoAWQ",
  },
  {
    id: "bitsandbytes", nombre: "bitsandbytes", alaVuelta: true,
    soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" },
    bitsMin: 4, bitsMax: 8, peft: true,
    enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes",
  },
  {
    id: "gguf", nombre: "GGUF (llama.cpp)", alaVuelta: false,
    soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
    bitsMin: 1, bitsMax: 8, peft: false,
    enlace: "https://github.com/ggml-org/llama.cpp",
  },
  {
    id: "gptqmodel", nombre: "GPT-QModel", alaVuelta: false,
    soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" },
    bitsMin: 2, bitsMax: 8, peft: true,
    enlace: "https://github.com/ModelCloud/GPTQModel",
  },
  {
    id: "hqq", nombre: "HQQ", alaVuelta: true,
    soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" },
    bitsMin: 1, bitsMax: 8, peft: true,
    enlace: "https://github.com/mobiusml/hqq",
  },
  {
    id: "metal", nombre: "Metal (kernels de Apple Silicon)", alaVuelta: true,
    soporte: { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" },
    bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://github.com/huggingface/transformers",
  },
  {
    id: "optimum-quanto", nombre: "optimum-quanto", alaVuelta: true,
    soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
    bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://github.com/huggingface/optimum-quanto",
  },
  {
    id: "torchao", nombre: "torchao", alaVuelta: true,
    soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" },
    bitsMin: 4, bitsMax: 8, peft: null,
    enlace: "https://github.com/pytorch/ao",
  },
  {
    id: "sinq", nombre: "SINQ", alaVuelta: true,
    soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" },
    bitsMin: 2, bitsMax: 8, peft: false,
    enlace: "https://github.com/KONAKONA666/SINQ",
  },
];

export function cuantizacionesPara(
  dispositivo: DispositivoHF,
  op?: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number },
): MetodoCuantizacion[] {
  const filtrados = METODOS_HF.filter((m) => {
    if (m.soporte[dispositivo] === "no") return false;
    if (op?.alaVuelta === true && !m.alaVuelta) return false;
    if (op?.peft === true && m.peft !== true) return false;
    if (op?.bitsMax !== undefined && m.bitsMin > op.bitsMax) return false;
    return true;
  });
  const rango: Record<Soporte, number> = { no: 2, parcial: 1, ok: 0 };
  return filtrados.sort((a, b) => {
    const d = rango[a.soporte[dispositivo]] - rango[b.soporte[dispositivo]];
    return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
  });
}
