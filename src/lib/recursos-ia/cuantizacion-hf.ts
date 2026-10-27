/**
 * Matriz de cuantización de transformers POR TIPO DE PROCESADOR — datos de referencia para
 * Recursos de IA (Ola 1025R). Fuente: docs/source/en/quantization/overview.md (transformers
 * v5.20.2, commit 50e35cc, 2026-10-23). Responde «¿qué método puedo usar en este dispositivo?».
 *
 * ⚠️ Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR
 * y Quark: se añaden si hacen falta.
 *
 * Módulo PURO: solo tipos, constantes y una función de filtro. Nada de `node:*`, nada de red.
 */

export type Soporte = "ok" | "parcial" | "no";

/** Solo el TIPO: nada de lógica del contrato entra en este módulo. */
import type { Procesador } from "./tipos";

export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** Se puede cuantizar sobre un modelo ya entrenado, al cargarlo. */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    bitsMin: number;
    bitsMax: number;
    /** Funciona con PEFT/LoRA: `true`, `false`, o `null` si no está documentado. */
    peft: boolean | null;
    enlace: string;
}

const ORDEN_SOPORTE: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

/** Ensambla un método de la tabla: una línea por método, datos tal como vienen en los docs. */
function metodo(
    id: string,
    nombre: string,
    alaVuelta: boolean,
    soporte: Record<DispositivoHF, Soporte>,
    bitsMin: number,
    bitsMax: number,
    peft: boolean | null,
    enlace: string
): MetodoCuantizacion {
    return { id, nombre, alaVuelta, soporte, bitsMin, bitsMax, peft, enlace };
}

export const METODOS_HF: MetodoCuantizacion[] = [
    metodo("awq", "AWQ", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" }, 4, 4, true, "https://github.com/casper-hansen/AutoAWQ"),
    metodo("bitsandbytes", "bitsandbytes", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" }, 4, 8, true, "https://github.com/bitsandbytes-foundation/bitsandbytes"),
    metodo("gguf", "GGUF (llama.cpp)", false, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 1, 8, false, "https://github.com/ggml-org/llama.cpp"),
    metodo("gptqmodel", "GPT-QModel", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" }, 2, 8, true, "https://github.com/ModelTC/gptqmodel"),
    metodo("hqq", "HQQ", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" }, 1, 8, true, "https://github.com/mobiusml/hqq"),
    metodo("metal", "Metal (kernels de Apple Silicon)", true, { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" }, 2, 8, false, "https://huggingface.co/docs/transformers/main/en/quantization/overview"),
    metodo("optimum-quanto", "optimum-quanto", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 2, 8, false, "https://github.com/huggingface/optimum-quanto"),
    metodo("torchao", "torchao", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" }, 4, 8, null, "https://github.com/pytorch/ao"),
    metodo("sinq", "SINQ", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" }, 2, 8, false, "https://github.com/Ki-Seki/SINQ"),
];

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen ya entrenados en ternario por QAT. No apliques esta tabla a BitNet ni a Ternary Bonsai.";

/** El dispositivo HF de un procesador del inventario: por su acelerador (cuda › rocm › metal), por un x86 con IA de Intel (avx) o CPU. */
export function dispositivoDe(procesador: Procesador): DispositivoHF {
    const a = procesador.aceleradores;
    if (a.includes("cuda")) return "cuda";
    if (a.includes("rocm")) return "rocm";
    if (a.includes("metal") || a.includes("metal4")) return "metal";
    if ((a.includes("avx2") || a.includes("avx512")) && !!procesador.so && /windows|linux/i.test(procesador.so)) return "intel";
    return "cpu";
}

/** Métodos con soporte real en un dispositivo, filtrados y ordenados (ok antes que parcial). */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op?: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number }
): MetodoCuantizacion[] {
    const sinOp = op ?? {};
    return METODOS_HF.filter((m) => m.soporte[dispositivo] !== "no")
        .filter((m) => (sinOp.alaVuelta === true ? m.alaVuelta : true))
        .filter((m) => (sinOp.peft === true ? m.peft === true : true))
        .filter((m) => (sinOp.bitsMax !== undefined ? m.bitsMin <= sinOp.bitsMax : true))
        .sort(
            (a, b) =>
                ORDEN_SOPORTE[a.soporte[dispositivo]] - ORDEN_SOPORTE[b.soporte[dispositivo]] ||
                a.nombre.localeCompare(b.nombre, "es")
        );
}
