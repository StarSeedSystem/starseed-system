/**
 * PowerInfer: modelos MoE dispersos de SmallThinker (Tiiny-AI/PowerInfer, MIT).
 * PURO (lo importa el cliente): sin red, sin `node:*`, sin disco.
 *
 * Solo acelera modelos entrenados para ser dispersos (no BitNet ni Ternary Bonsai) y en
 * macOS/Metal no tiene operadores dispersos: por eso solo se ofrece en Linux y Android.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** Señales SIMD que el README de PowerInfer usa para elegir el núcleo. */
export interface IsaCpu {
    neon: boolean;
    dotprod: boolean;
    i8mm: boolean;
    avx2: boolean;
    avx512: boolean;
}

/** Campos comunes de los dos SmallThinker; cada modelo cambia tamaño, RAM y almacenamiento. */
const BASE = {
    origen: "biblioteca",
    estado: "en-pruebas",
    runtime: "powerinfer",
    formato: "gguf",
    bits: 4,
    capacidades: ["texto", "razon"],
    familia: "PowerInfer/SmallThinker",
    licencia: "Apache-2.0",
    so: ["Linux", "Android"],
    arquitecturas: ["arm64", "x86_64"],
    aceleradoresRequeridos: ["neon", "avx2", "avx512"],
    herramientasRequeridas: ["clang-21", "cmake"],
    medios: ["nativo", "servidor"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
} satisfies Omit<
    RequisitosModelo,
    "id" | "nombre" | "parametrosB" | "activosB" | "disco" | "ramMinGb" | "almacenamiento" | "upstream" | "tokSRef" | "notas"
>;

export const MODELOS_POWERINFER: RequisitosModelo[] = [];

/** Expertos en caché para un límite de RAM (README: 768 por GiB; 21B con 8 GiB ⇒ 6144). */
export function maxNCached(limiteGiB: number): number {
    return Number.isFinite(limiteGiB) && limiteGiB > 0 ? Math.round(768 * limiteGiB) : 0;
}

/** Lee `Features` (ARM) o `flags` (x86) de /proc/cpuinfo y detecta las extensiones de PowerInfer. */
export function isaDeProcCpuinfo(txt: string): IsaCpu {
    const tiene = new Set<string>();
    for (const linea of txt.split(/\r?\n/)) {
        const m = linea.match(/^\s*(?:features|flags)\s*:\s*(.+)$/i);
        if (!m) continue;
        for (const token of m[1].trim().split(/\s+/)) tiene.add(token.toLowerCase());
    }
    return {
        neon: tiene.has("asimd") || tiene.has("neon"),
        dotprod: tiene.has("asimddp"),
        i8mm: tiene.has("i8mm"),
        avx2: tiene.has("avx2"),
        avx512: tiene.has("avx512f") || tiene.has("avx512"),
    };
}

/** Núcleo de PowerInfer que conviene compilar según la ISA y la arquitectura. */
export function elegirNucleoPowerInfer(
    isa: IsaCpu,
    arq: Arquitectura,
): { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "ARM con NEON y dotprod: núcleo disperso del README" };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "x86 con AVX-512: el núcleo disperso más rápido" };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "x86 con AVX2: núcleo disperso compatible" };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
