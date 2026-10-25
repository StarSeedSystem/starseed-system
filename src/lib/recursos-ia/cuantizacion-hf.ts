/**
 * Matriz de cuantización de transformers por tipo de procesador (Ola 1025R, tarea CPZ1025G).
 *
 * Datos de la tabla de la documentación de transformers para que Recursos de IA sugiera un
 * método de cuantización según el dispositivo. Módulo PURO: tipos, constantes, una función de
 * filtrado y el puente del procesador del inventario a su dispositivo; nada de `node:*`,
 * nada de red ni disco.
 *
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR
 * y Quark: se añaden si hacen falta.
 */

import type { Procesador } from "./tipos";

/** Grado de soporte de un método en un procesador. */
export type Soporte = "ok" | "parcial" | "no";

/** Procesador según la tabla de transformers. */
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** Se aplica al cargar, sin necesidad de un modelo ya cuantizado. */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    bitsMin: number;
    bitsMax: number;
    /** Compatible con PEFT/adaptadores; null sin confirmar (p. ej. torchao). */
    peft: boolean | null;
    enlace: string;
}

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

/** Los modelos BitNet quedan fuera de esta tabla: véase la nota. */
export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en " +
    "ternario por QAT. Esta tabla no se aplica a BitNet ni a Ternary Bonsai.";

export const METODOS_HF: MetodoCuantizacion[] = [
    { id: "awq", nombre: "AWQ", alaVuelta: false, bitsMin: 4, bitsMax: 4, peft: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" },
        enlace: "https://github.com/casper-hansen/AutoAWQ" },
    { id: "bitsandbytes", nombre: "bitsandbytes", alaVuelta: true, bitsMin: 4, bitsMax: 8, peft: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" },
        enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes" },
    { id: "gguf-llamacpp", nombre: "GGUF (llama.cpp)", alaVuelta: false, bitsMin: 1, bitsMax: 8, peft: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        enlace: "https://github.com/ggerganov/llama.cpp" },
    { id: "gptqmodel", nombre: "GPT-QModel", alaVuelta: false, bitsMin: 2, bitsMax: 8, peft: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" },
        enlace: "https://github.com/ModelCloud/GPTQModel" },
    { id: "hqq", nombre: "HQQ", alaVuelta: true, bitsMin: 1, bitsMax: 8, peft: true,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" },
        enlace: "https://github.com/mobiusml/hqq" },
    { id: "metal-apple-silicon", nombre: "Metal (kernels de Apple Silicon)", alaVuelta: true,
        bitsMin: 2, bitsMax: 8, peft: false,
        soporte: { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" },
        enlace: "https://huggingface.co/docs/transformers/main/en/quantization/metal" },
    { id: "optimum-quanto", nombre: "optimum-quanto", alaVuelta: true, bitsMin: 2, bitsMax: 8, peft: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" },
        enlace: "https://github.com/huggingface/optimum-quanto" },
    { id: "torchao", nombre: "torchao", alaVuelta: true, bitsMin: 4, bitsMax: 8, peft: null,
        soporte: { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" },
        enlace: "https://github.com/pytorch/ao" },
    { id: "sinq", nombre: "SINQ", alaVuelta: true, bitsMin: 2, bitsMax: 8, peft: false,
        soporte: { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" },
        enlace: "https://github.com/KORB-scs/SINQ" },
];

/**
 * Filtra los métodos aptos para un dispositivo y los ordena: soporte `ok` antes que
 * `parcial`, y a igualdad por nombre. Jamás devuelve un método con soporte `no`.
 */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op: { alaVuelta?: boolean; peft?: boolean; bitsMax?: number } = {},
): MetodoCuantizacion[] {
    const piezas = METODOS_HF.filter((m) => {
        if (m.soporte[dispositivo] === "no") return false;
        if (op.alaVuelta === true && !m.alaVuelta) return false;
        if (op.peft === true && m.peft !== true) return false;
        if (op.bitsMax !== undefined && m.bitsMin > op.bitsMax) return false;
        return true;
    });
    return piezas.sort((a, b) => {
        const r = RANGO_SOPORTE[a.soporte[dispositivo]] - RANGO_SOPORTE[b.soporte[dispositivo]];
        return r !== 0 ? r : a.nombre.localeCompare(b.nombre, "es");
    });
}

const RANGO_SOPORTE: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

/* ───────────────────────────── puente con el inventario ───────────────────────────── */

/**
 * El dispositivo de la tabla que corresponde a un procesador del inventario: CUDA o ROCm según
 * el acelerador de su GPU, Metal en los Apple Silicon (kernels de Metal) y CPU en lo demás.
 * Para «intel» no hay pistas (el inventario no distingue vendedor) y webgpu/npu/antena no
 * cuadran con ninguna columna: en esos casos no se sugiere método (de ahí el `null`).
 */
export function dispositivoDe(p: Procesador): DispositivoHF | null {
    if (p.via === "antena" || p.tipo === "webgpu" || p.tipo === "npu") return null;
    if (p.aceleradores.includes("cuda")) return "cuda";
    if (p.aceleradores.includes("rocm")) return "rocm";
    if (p.aceleradores.includes("metal") || p.aceleradores.includes("metal4")) return "metal";
    if (p.tipo === "cpu" || p.tipo === "servidor") return "cpu";
    return null;
}
