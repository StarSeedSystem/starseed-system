/**
 * Matriz de cuantización de transformers por tipo de procesador (datos de referencia para
 * «Recursos de IA»). Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8,
 * HIGGS, VPTQ, SpQR y Quark: se añaden si hacen falta.
 *
 * Módulo PURO (lo importa el cliente): nada de `node:*`, sin red ni disco. Aún no se conecta
 * a nada. Los avisos de BitNet van aparte: los modelos BitNet no se cuantizan al vuelo en
 * transformers (solo existen entrenados ya en ternario por QAT): esta tabla NO se aplica a
 * BitNet ni a Ternary Bonsai (ver `NOTA_BITNET`).
 */

export type Soporte = "ok" | "parcial" | "no";
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** true = se puede cuantizar el modelo al cargarlo (sin cuantización previa). */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    bitsMin: number;
    bitsMax: number;
    /** Compatible con PEFT/LoRA. null = desconocido. */
    peft: boolean | null;
    enlace: string;
}

/** Fábrica de una fila de la tabla: mantiene el listado a una línea por método. */
const metodo = (
    id: string,
    nombre: string,
    alaVuelta: boolean,
    soporte: Record<DispositivoHF, Soporte>,
    bitsMin: number,
    bitsMax: number,
    peft: boolean | null,
    enlace: string,
): MetodoCuantizacion => ({ id, nombre, alaVuelta, soporte, bitsMin, bitsMax, peft, enlace });

export const METODOS_HF: MetodoCuantizacion[] = [
    metodo("awq", "AWQ", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "no", intel: "ok" }, 4, 4, true, "https://github.com/casper-hansen/AutoAWQ"),
    metodo("bitsandbytes", "bitsandbytes", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "ok" }, 4, 8, true, "https://github.com/bitsandbytes-foundation/bitsandbytes"),
    metodo("gguf", "GGUF (llama.cpp)", false, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 1, 8, false, "https://github.com/ggml-org/llama.cpp"),
    metodo("gptqmodel", "GPT-QModel", false, { cpu: "ok", cuda: "ok", rocm: "ok", metal: "ok", intel: "ok" }, 2, 8, true, "https://github.com/ModelCloud/GPTQModel"),
    metodo("hqq", "HQQ", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "no", intel: "ok" }, 1, 8, true, "https://github.com/mobiusml/hqq"),
    metodo("metal", "Metal (kernels de Apple Silicon)", true, { cpu: "no", cuda: "no", rocm: "no", metal: "ok", intel: "no" }, 2, 8, false, "https://github.com/angeloskath/hnorcim-torchmint"),
    metodo("optimum-quanto", "optimum-quanto", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "ok", intel: "ok" }, 2, 8, false, "https://github.com/huggingface/optimum-quanto"),
    metodo("torchao", "torchao", true, { cpu: "ok", cuda: "ok", rocm: "no", metal: "parcial", intel: "ok" }, 4, 8, null, "https://github.com/pytorch/ao"),
    metodo("sinq", "SINQ", true, { cpu: "ok", cuda: "ok", rocm: "parcial", metal: "parcial", intel: "parcial" }, 2, 8, false, "https://github.com/KONAKONAM2024/SINQ"),
];

export const FUENTE_METODOS_HF = "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en " +
    "ternario por QAT (quantization-aware training). No apliques esta tabla a BitNet ni a Ternary Bonsai.";

export interface OpcionesCuantizacion {
    alaVuelta?: boolean;
    peft?: boolean;
    bitsMax?: number;
}

/** Orden interno del soporte: `ok` antes que `parcial`. */
const RANGO_SOPORTE: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

export function cuantizacionesPara(dispositivo: DispositivoHF, op?: OpcionesCuantizacion): MetodoCuantizacion[] {
    const opciones = op ?? {};
    const filtrados = METODOS_HF.filter((m) => {
        const soporte = m.soporte[dispositivo];
        if (soporte === "no") return false;
        if (opciones.alaVuelta === true && !m.alaVuelta) return false;
        if (opciones.peft === true && m.peft !== true) return false;
        if (opciones.bitsMax !== undefined && m.bitsMin > opciones.bitsMax) return false;
        return true;
    });
    return filtrados.sort((a, b) => {
        const rango = RANGO_SOPORTE[a.soporte[dispositivo]] - RANGO_SOPORTE[b.soporte[dispositivo]];
        return rango !== 0 ? rango : a.nombre.localeCompare(b.nombre);
    });
}
