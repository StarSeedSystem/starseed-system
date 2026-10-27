/**
 * Matriz de cuantización de transformers por tipo de procesador.
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS,
 * VPTQ, SpQR y Quark: se añaden si hacen falta.
 * Fuente: docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23).
 */
export type Soporte = "ok" | "parcial" | "no";
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
  id: string;
  nombre: string;
  /** true: se puede cuantizar el modelo al cargarlo, sin versión pre-cuantizada */
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

export const METODOS_HF: MetodoCuantizacion[] = [
  { id: "awq", nombre: "AWQ", alaVuelta: false, soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" }, bitsMin: 4, bitsMax: 4, peft: true, enlace: "https://github.com/mit-han-lab/awq" },
  { id: "bitsandbytes", nombre: "bitsandbytes", alaVuelta: true, soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" }, bitsMin: 4, bitsMax: 8, peft: true, enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes" },
  { id: "gguf", nombre: "GGUF (llama.cpp)", alaVuelta: false, soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, bitsMin: 1, bitsMax: 8, peft: false, enlace: "https://github.com/ggerganov/llama.cpp" },
  { id: "gptqmodel", nombre: "GPT-QModel", alaVuelta: false, soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" }, bitsMin: 2, bitsMax: 8, peft: true, enlace: "https://github.com/ModelCloud/GPTQModel" },
  { id: "hqq", nombre: "HQQ", alaVuelta: true, soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" }, bitsMin: 1, bitsMax: 8, peft: true, enlace: "https://github.com/mobiusml/hqq" },
  { id: "metal", nombre: "Metal (kernels de Apple Silicon)", alaVuelta: true, soporte: { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" }, bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://huggingface.co/docs/transformers/main/en/main_classes/quantization#metal" },
  { id: "optimum-quanto", nombre: "optimum-quanto", alaVuelta: true, soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://github.com/huggingface/optimum-quanto" },
  { id: "torchao", nombre: "torchao", alaVuelta: true, soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" }, bitsMin: 4, bitsMax: 8, peft: null, enlace: "https://github.com/pytorch/ao" },
  { id: "sinq", nombre: "SINQ", alaVuelta: true, soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" }, bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://github.com/KORALLLL/MINQ" },
];

export function cuantizacionesPara(
  dispositivo: DispositivoHF,
  op?: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number }
): MetodoCuantizacion[] {
  const limiteBits = op?.bitsMax;
  const filtroRango: (m: MetodoCuantizacion) => boolean =
    limiteBits === undefined ? () => true : (m) => m.bitsMin <= limiteBits;
  return METODOS_HF.filter(
    (m) =>
      m.soporte[dispositivo] !== "no" &&
      (op?.alaVuelta === undefined || m.alaVuelta === op.alaVuelta) &&
      (op?.peft === undefined || m.peft === op.peft) &&
      filtroRango(m)
  ).sort(
    (a, b) =>
      Number(a.soporte[dispositivo] === "ok") > Number(b.soporte[dispositivo] === "ok")
        ? -1
        : Number(a.soporte[dispositivo] === "ok") < Number(b.soporte[dispositivo] === "ok")
        ? 1
        : a.nombre.localeCompare(b.nombre)
  );
}
