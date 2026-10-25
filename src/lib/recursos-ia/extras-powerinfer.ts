/**
 * PowerInfer y sus modelos SmallThinker (Biblioteca) — 2026-10-25. Módulo PURO: sin red, sin
 * disco y sin `node:*`. Solo acelera modelos dispersos (MoE); no acelera BitNet ni Ternary
 * Bonsai, y en macOS/Metal no tiene operadores dispersos.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** Núcleo disperso que PowerInfer elige para un procesador. */
export type NucleoPowerInfer = "neon-dotprod" | "avx512" | "avx2" | "generico";

/** Rasgos SIMD leídos de `/proc/cpuinfo`. */
export interface IsaCpu {
    neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean;
}

export interface EleccionNucleo { nucleo: NucleoPowerInfer; motivo: string }
/** Campos comunes a los dos SmallThinker publicados. */
const BASE = {
    familia: "PowerInfer/SmallThinker",
    capacidades: ["texto", "razon"],
    bits: 4,
    formato: "gguf",
    runtime: "powerinfer",
    so: ["Linux", "Android"],
    arquitecturas: ["arm64", "x86_64"],
    aceleradoresRequeridos: ["neon", "avx2", "avx512"],
    herramientasRequeridas: ["clang-21", "cmake"],
    medios: ["nativo", "servidor"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
    licencia: "Apache-2.0",
    estado: "en-pruebas",
    origen: "biblioteca",
} satisfies Partial<RequisitosModelo>;

const NOTAS_BASE =
    "Cifras del README del autor, NO medidas por StarSeed. La ficha declara solo inglés: " +
    "medir español con el banco de capas antes de promoverlo. No sustituye a Ternary Bonsai " +
    "(regla «1.58 primero»). No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM " +
    "(al A1 le quedan ~1,4 GB libres por plan). Se compila a mano con CMake, clang-21 y mold.";

export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        ...BASE,
        id: "smallthinker-4b-a06b-powerinfer",
        nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
        parametrosB: 4.27,
        activosB: 0.6,
        disco: { gb: 2.29, verificado: true },
        ramMinGb: 4,
        almacenamiento: { modo: "mmap", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5 (autor, sin límite de memoria)", tokS: 28.77 },
            { equipo: "RK3588 (autor, sin límite de memoria)", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite · OnePlus 13 (autor, sin límite)", tokS: 78.99 },
            { equipo: "Intel i9-14900 (autor, sin límite de memoria)", tokS: 108.17 },
        ],
        notas:
            NOTAS_BASE +
            " Archivo SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf: 2292487712 bytes, " +
            "sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c. " +
            "Modo mmap: el archivo cabe entero en RAM y se lee del disco local.",
    },
    {
        ...BASE,
        id: "smallthinker-21b-a3b-powerinfer",
        nombre: "SmallThinker 21B-A3B (PowerInfer)",
        parametrosB: 21.5,
        activosB: 3,
        disco: { gb: 12.14, verificado: true },
        ramMinGb: 8,
        almacenamiento: { modo: "streaming-ssd", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Intel i9-14900 (autor, límite de 8 GB de RAM)", tokS: 20.3 },
            { equipo: "Snapdragon 8 Elite (autor, límite de 8 GB de RAM)", tokS: 15.5 },
            { equipo: "RK3588 (autor, límite de 8 GB de RAM)", tokS: 8.56 },
        ],
        notas:
            NOTAS_BASE +
            " Archivo SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf: 12144740608 bytes, " +
            "sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb. " +
            "El 21B en modo limitado pide ≥ 8 GB de RAM libre y un SSD rápido con Linux o Android: " +
            "guarda en RAM solo una caché LRU de expertos y lee el resto del disco con libaio/io_uring.",
    },
];

export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

export function isaDeProcCpuinfo(txt: string): IsaCpu {
    const tokens = new Set<string>();
    for (const linea of txt.split(/\r?\n/)) {
        const coincidencia = /^\s*(features|flags)\s*:\s*(.+)$/i.exec(linea);
        if (!coincidencia) continue;
        for (const token of coincidencia[2].trim().split(/\s+/)) tokens.add(token.toLowerCase());
    }
    return {
        neon: tokens.has("asimd") || tokens.has("neon"),
        dotprod: tokens.has("asimddp"),
        i8mm: tokens.has("i8mm"),
        avx2: tokens.has("avx2"),
        avx512: tokens.has("avx512f"),
    };
}

export function elegirNucleoPowerInfer(isa: IsaCpu, arq: Arquitectura): EleccionNucleo {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "NEON con dotprod: el núcleo disperso de PowerInfer." };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "AVX-512 disponible: núcleo disperso AVX-512." };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "AVX2 disponible: núcleo disperso AVX2." };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
