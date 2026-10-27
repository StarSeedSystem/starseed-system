/**
 * Matriz de cuantización de transformers por tipo de procesador («Recursos de IA»).
 * PURO: datos de referencia tipados, sin red, sin disco ni `node:*`.
 *
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS,
 * VPTQ, SpQR y Quark: se añaden si hacen falta.
 * Fuente: transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23), v5.20.2.
 * «1/8» y similares van a `bitsMin`/`bitsMax`.
 *
 * IMPORTANTE (BitNet): los modelos BitNet no se cuantizan al vuelo en transformers,
 * solo existen entrenados ya en ternario por QAT; no apliques esta tabla a BitNet
 * ni a Ternary Bonsai.
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

const W = "https://huggingface.co/docs/transformers";
const REPO = (r: string) => `https://github.com/${r}`;

export const METODOS_HF: MetodoCuantizacion[] = [
    {
        id: "awq",
        nombre: "AWQ",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" },
        bitsMin: 4,
        bitsMax: 4,
        peft: true,
        enlace: `${W}/main/quantization/awq`,
    },
    {
        id: "bitsandbytes",
        nombre: "bitsandbytes",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" },
        bitsMin: 4,
        bitsMax: 8,
        peft: true,
        enlace: REPO("bitsandbytes-foundation/bitsandbytes"),
    },
    {
        id: "gguf",
        nombre: "GGUF (llama.cpp)",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        bitsMin: 1,
        bitsMax: 8,
        peft: false,
        enlace: W,
    },
    {
        id: "gptq",
        nombre: "GPT-QModel",
        alaVuelta: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" },
        bitsMin: 2,
        bitsMax: 8,
        peft: true,
        enlace: `${W}/main/quantization/gptq2`,
    },
    {
        id: "hqq",
        nombre: "HQQ",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" },
        bitsMin: 1,
        bitsMax: 8,
        peft: true,
        enlace: REPO("mobiusml/hqq"),
    },
    {
        id: "metal",
        nombre: "Metal (kernels de Apple Silicon)",
        alaVuelta: true,
        soporte: { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: `${W}/main/quantization/metal`,
    },
    {
        id: "optimum-quanto",
        nombre: "optimum-quanto",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: REPO("huggingface/optimum-quanto"),
    },
    {
        id: "torchao",
        nombre: "torchao",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" },
        bitsMin: 4,
        bitsMax: 8,
        peft: null,
        enlace: REPO("pytorch/ao"),
    },
    {
        id: "sinq",
        nombre: "SINQ",
        alaVuelta: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" },
        bitsMin: 2,
        bitsMax: 8,
        peft: false,
        enlace: REPO("hbX000/SINQ"),
    },
];

const PESO: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya " +
    "en ternario por QAT; no aplicar esta tabla a BitNet ni a Ternary Bonsai.";

export interface OpcionesCuantizacion {
    alaVuelta?: boolean;
    peft?: boolean;
    bitsMax?: number;
}

/** Métodos con soporte distinto de «no» en el dispositivo, filtrados y ordenados (ok antes que parcial, luego nombre). */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op: OpcionesCuantizacion = {},
): MetodoCuantizacion[] {
    const lista = METODOS_HF.filter((m) => {
        if (m.alaVuelta !== true && op.alaVuelta === true) return false;
        if (op.peft === true && m.peft !== true) return false;
        if (op.bitsMax !== undefined && m.bitsMin > op.bitsMax) return false;
        return m.soporte[dispositivo] !== "no";
    });
    const orden = (a: MetodoCuantizacion, b: MetodoCuantizacion) => {
        const d = PESO[a.soporte[dispositivo]] - PESO[b.soporte[dispositivo]];
        return d !== 0 ? d : a.nombre.localeCompare(b.nombre, "es");
    };
    return lista.sort(orden);
}
