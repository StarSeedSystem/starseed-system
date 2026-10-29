/**
 * Tabla de cuantización de transformers por tipo de procesador (datos de referencia para
 * Recursos de IA). PURO: solo tipos, datos y filtros; nada de red, disco ni `node:*`.
 * Tabla parcial; faltan AQLM, AutoRound, compressed-tensors, EETQ, FP8, HIGGS, VPTQ, SpQR y
 * Quark: se añaden si hacen falta.
 */

export type Soporte = "ok" | "parcial" | "no";
export type DispositivoHF = "cpu" | "cuda" | "rocm" | "metal" | "intel";

export interface MetodoCuantizacion {
    id: string;
    nombre: string;
    /** true = cuantiza al vuelo un modelo cargado en precisión normal (sin pesos precuantizados). */
    alaVuelta: boolean;
    soporte: Record<DispositivoHF, Soporte>;
    bitsMin: number;
    bitsMax: number;
    /** Compatible con ajuste fino PEFT; `null` = no se sabe. */
    peft: boolean | null;
    enlace: string;
}

export const FUENTE_METODOS_HF =
    "transformers docs/source/en/quantization/overview.md @ 50e35cc (2026-10-23)";

export const NOTA_BITNET =
    "Los modelos BitNet no se cuantizan al vuelo en transformers: solo existen entrenados ya en ternario (1,58 bits) por QAT. No apliques esta tabla a BitNet ni a Ternary Bonsai.";

/* ───────────── filas compactas: o = ok, = = parcial, n = no (cpu · cuda · rocm · metal · intel) ───────────── */

const ORDEN_DISPOSITIVO: DispositivoHF[] = ["cpu", "cuda", "rocm", "metal", "intel"];
const SOPORTE_CODE: Record<string, Soporte> = { o: "ok", "=": "parcial", n: "no" };

interface Fila {
    id: string;
    nombre: string;
    alaVuelta: boolean;
    codigos: string;
    bitsMin: number;
    bitsMax: number;
    peft: boolean | null;
    enlace: string;
}

function fila(f: Fila): MetodoCuantizacion {
    const soporte = {} as Record<DispositivoHF, Soporte>;
    ORDEN_DISPOSITIVO.forEach((d, i) => (soporte[d] = SOPORTE_CODE[f.codigos[i]]));
    return { id: f.id, nombre: f.nombre, alaVuelta: f.alaVuelta, soporte, bitsMin: f.bitsMin, bitsMax: f.bitsMax, peft: f.peft, enlace: f.enlace };
}

/* ───────────── datos ───────────── */

export const METODOS_HF: MetodoCuantizacion[] = [
    fila({ id: "awq", nombre: "AWQ", alaVuelta: false, codigos: "ooooo", bitsMin: 4, bitsMax: 4, peft: true, enlace: "https://github.com/casper-hansen/AutoAWQ" }),
    fila({ id: "bitsandbytes", nombre: "bitsandbytes", alaVuelta: true, codigos: "oo==o", bitsMin: 4, bitsMax: 8, peft: true, enlace: "https://github.com/bitsandbytes-foundation/bitsandbytes" }),
    fila({ id: "gguf", nombre: "GGUF (llama.cpp)", alaVuelta: false, codigos: "oonoo", bitsMin: 1, bitsMax: 8, peft: false, enlace: "https://github.com/ggerganov/llama.cpp" }),
    fila({ id: "gptqmodel", nombre: "GPT-QModel", alaVuelta: false, codigos: "ooooo", bitsMin: 2, bitsMax: 8, peft: true, enlace: "https://github.com/ModelCloud/GPTQModel" }),
    fila({ id: "hqq", nombre: "HQQ", alaVuelta: true, codigos: "oonno", bitsMin: 1, bitsMax: 8, peft: true, enlace: "https://github.com/mobiusml/hqq" }),
    fila({ id: "metal-kernels", nombre: "Metal (kernels de Apple Silicon)", alaVuelta: true, codigos: "nnnon", bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://huggingface.co/kernels-community/mlx-quantization-metal-kernels" }),
    fila({ id: "optimum-quanto", nombre: "optimum-quanto", alaVuelta: true, codigos: "oonoo", bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://github.com/huggingface/optimum-quanto" }),
    fila({ id: "torchao", nombre: "torchao", alaVuelta: true, codigos: "oon=o", bitsMin: 4, bitsMax: 8, peft: null, enlace: "https://github.com/pytorch/ao" }),
    fila({ id: "sinq", nombre: "SINQ", alaVuelta: true, codigos: "oo===", bitsMin: 2, bitsMax: 8, peft: false, enlace: "https://github.com/huawei-csl/SINQ" }),
];

/* ───────────── filtro por dispositivo y opciones ───────────── */

export interface OpcionesCuantizacion {
    /** true ⇒ devuelve solo los métodos que cuantizan al vuelo. */
    alaVuelta?: boolean;
    /** true ⇒ devuelve solo los métodos compatibles con PEFT (los `null` quedan fuera). */
    peft?: boolean;
    /** El método debe poder dar una precisión de este mínimo de bits o menos (`bitsMin ≤ bitsMax` pedido). */
    bitsMax?: number;
}

/** Orden de preferencia por soporte: `ok` antes que `parcial`; `no` ya se filtró. */
const RANGO_SOPORTE: Record<Soporte, number> = { ok: 0, parcial: 1, no: 2 };

/**
 * Métodos de cuantización de transformers que sirven para un dispositivo dado, con la
 * opción de exigir cuantización al vuelo, PEFT o un mínimo de bits. Ordenados por soporte
 * (`ok` antes que `parcial`) y, a igualdad, por nombre.
 */
export function cuantizacionesPara(
    dispositivo: DispositivoHF,
    op: OpcionesCuantizacion = {},
): MetodoCuantizacion[] {
    return METODOS_HF.filter((m) => m.soporte[dispositivo] !== "no")
        .filter((m) => !op.alaVuelta || m.alaVuelta)
        .filter((m) => !op.peft || m.peft === true)
        .filter((m) => op.bitsMax === undefined || m.bitsMin <= op.bitsMax)
        .sort(
            (a, b) =>
                RANGO_SOPORTE[a.soporte[dispositivo]] - RANGO_SOPORTE[b.soporte[dispositivo]] ||
                a.nombre.localeCompare(b.nombre),
        );
}
