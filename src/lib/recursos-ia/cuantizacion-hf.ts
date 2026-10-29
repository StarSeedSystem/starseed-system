/**
 * Tabla de cuantización de transformers según procesador (iéndose de la documentación oficial).
 *
 * Datos de referencia puros para Recursos de IA: sugieren un método según el dispositivo del
 * inventario. No se conecta a nada todavía; nada del laboratorio escribe en el OS sin confirmación.
 *
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR y Quark:
 * se añaden si hacen falta.
 */

/** Grado de soporte de un método en un procesador. */
export type Soporte = "ok" | "parcial" | "no";

/** Procesadores que distingue la tabla de transformers. */
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** Cuantiza al vuelo al cargar el modelo (frente a pesos ya cuantizados, como GGUF). */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    /** Bits mínimos y máximos que admite el método («4/8» en la tabla). */
    bitsMin: number;
    bitsMax: number;
    /** Compatible con PEFT según la tabla; desconocido (torchao) es null. */
    peft: boolean | null;
    enlace: string;
}

export const METODOS_HF: MetodoCuantizacion[] = [
    {
        id: "awq",
        nombre: "AWQ",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" },
        bitsMin: 4,
        bitsMax: 4,
        peft: true,
        enlace: "https://github.com/mit-han-lab/llm-awq",
    },
    {
        id: "bitsandbytes",
        nombre: "bitsandbytes",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" },
        bitsMin: 4,
        bitsMax: 8,
        peft: true,
        enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes",
    },
    {
        id: "gguf",
        nombre: "GGUF (llama.cpp)",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        bitsMin: 1,
        bitsMax: 8,
        peft: false,
        enlace: "https://github.com/ggml-org/llama.cpp",
    },
    {
        id: "gptqmodel",
        nombre: "GPT-QModel",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" },
        bitsMin: 2,
        bitsMax: 8,
        peft: true,
        enlace: "https://github.com/ModelCloud/GPTQModel",
    },
    {
        id: "hqq",
        nombre: "HQQ",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" },
        bitsMin: 1,
        bitsMax: 8,
        peft: true,
        enlace: "https://github.com/mobiusml/hqq",
    },
    {
        id: "metal",
        nombre: "Metal (kernels de Apple Silicon)",
        alaVuelta: true,
        soporte: { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: "https://huggingface.co/docs/transformers/en/perf_infer_cpu#metal",
    },
    {
        id: "optimum-quanto",
        nombre: "optimum-quanto",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: "https://github.com/huggingface/optimum-quanto",
    },
    {
        id: "torchao",
        nombre: "torchao",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" },
        bitsMin: 4,
        bitsMax: 8,
        peft: null,
        enlace: "https://github.com/pytorch/ao",
    },
    {
        id: "sinq",
        nombre: "SINQ",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: "https://github.com/KORAExcavators/SINQ",
    },
];

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en " +
    "ternario (1,58 bits) por QAT. No apliques esta tabla a BitNet ni a Ternary Bonsai.";

const RANGO_SOPORTE: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

/**
 * Métodos con soporte (≠ «no») en el dispositivo, filtrados por vuelo / PEFT / bits y ordenados:
 * antes «ok» que «parcial», a igualdad por nombre (comparación simple, sin depender del ICU).
 */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op?: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number },
): MetodoCuantizacion[] {
    return METODOS_HF.filter((m) => {
        if (m.soporte[dispositivo] === "no") return false;
        if (op?.alaVuelta && !m.alaVuelta) return false;
        // Con PEFT solo cuentan los compatibles seguros; null o false se descartan.
        if (op?.peft && m.peft !== true) return false;
        if (op?.bitsMax !== undefined && m.bitsMin > op.bitsMax) return false;
        return true;
    }).sort((a, b) => {
        const rango = RANGO_SOPORTE[a.soporte[dispositivo]] - RANGO_SOPORTE[b.soporte[dispositivo]];
        if (rango !== 0) return rango;
        if (a.nombre < b.nombre) return -1;
        if (a.nombre > b.nombre) return 1;
        return 0;
    });
}
