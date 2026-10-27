/**
 * Recursos de IA · matriz de cuantización de Transformers por tipo de procesador (Ola 1025R).
 *
 * PURO: datos de referencia tipados, sin red, sin disco, sin `node:*`. Nunca lanza.
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR y Quark:
 * se añaden si hacen falta.
 */

export type Soporte = "ok" | "parcial" | "no";

export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** Carga el modelo y lo cuantiza al vuelo (verde en la tabla) frente a hacerlo antes de guardarlo. */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    /** Extremos de la columna «Bits» («1/8» ⇒ bitsMin 1, bitsMax 8; «4» ⇒ 4 y 4). */
    bitsMin: number;
    bitsMax: number;
    /** Afinación con PEFT: sí, no; null = desconocido (la tabla lo deja en blanco). */
    peft: boolean | null;
    /** El repositorio o kernel que figura en la columna «Link to library» de la tabla. */
    enlace: string;
}

function metodo(
    id: string,
    nombre: string,
    alaVuelta: boolean,
    soporte: Record<DispositivoHF, Soporte>,
    bitsMin: number,
    bitsMax: number,
    peft: boolean | null,
    enlace: string,
): MetodoCuantizacion {
    return { id, nombre, alaVuelta, soporte, bitsMin, bitsMax, peft, enlace };
}

/** Los nueve métodos de la tabla (AWQ · bitsandbytes · GGUF · GPT-QModel · HQQ · Metal · optimum-quanto · torchao · SINQ). */
export const METODOS_HF: MetodoCuantizacion[] = [
    metodo("awq", "AWQ", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" }, 4, 4, true, "https://github.com/casper-hansen/AutoAWQ"),
    metodo("bitsandbytes", "bitsandbytes", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" }, 4, 8, true, "https://github.com/bitsandbytes-foundation/bitsandbytes"),
    metodo("gguf", "GGUF (llama.cpp)", false, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 1, 8, false, "https://github.com/ggerganov/llama.cpp"),
    metodo("gptqmodel", "GPT-QModel", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" }, 2, 8, true, "https://github.com/ModelCloud/GPTQModel"),
    metodo("hqq", "HQQ", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" }, 1, 8, true, "https://github.com/mobiusml/hqq"),
    metodo("metal", "Metal (kernels de Apple Silicon)", true, { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" }, 2, 8, false, "https://huggingface.co/kernels-community/mlx-quantization-metal-kernels"),
    metodo("optimum-quanto", "optimum-quanto", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 2, 8, false, "https://github.com/huggingface/optimum-quanto"),
    metodo("torchao", "torchao", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" }, 4, 8, null, "https://github.com/pytorch/ao"),
    metodo("sinq", "SINQ", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" }, 2, 8, false, "https://github.com/huawei-csl/SINQ"),
];

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

/** Aviso que viaja con la tabla: BitNet (y Ternary Bonsai) no se cuantizan al vuelo en Transformers. */
export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en Transformers (solo existen entrenados ya en ternario por QAT): no apliques esta tabla a BitNet ni a Ternary Bonsai.";

export interface OpcionesCuantizacion {
    /** true ⇒ solo los métodos que cuantizan al vuelo. */
    alaVuelta?: boolean;
    /** true ⇒ solo los de afinación con PEFT (el desconocido, null, queda fuera). */
    peft?: boolean;
    /** El método debe admitir esa precisión o menos (bitsMin ≤ bitsMax). */
    bitsMax?: number;
}

/** Métodos que corren en `dispositivo`, filtrados por las opciones y con `ok` antes que `parcial`. */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op: OpcionesCuantizacion = {},
): MetodoCuantizacion[] {
    const posibles = METODOS_HF.filter((m) => {
        if (m.soporte[dispositivo] === "no") return false;
        if (op.alaVuelta === true && !m.alaVuelta) return false;
        if (op.peft === true && m.peft !== true) return false;
        if (typeof op.bitsMax === "number" && m.bitsMin > op.bitsMax) return false;
        return true;
    });
    return posibles.sort((a, b) => {
        const ra = a.soporte[dispositivo] === "ok" ? 0 : 1;
        const rb = b.soporte[dispositivo] === "ok" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.nombre.localeCompare(b.nombre, "es");
    });
}
