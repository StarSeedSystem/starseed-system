/**
 * PowerInfer en «Recursos de IA» (Ola 1025R · capas de conciencia).
 *
 * Motor local derivado de llama.cpp (MIT, sin releases) que SOLO acelera MoE dispersos:
 * SmallThinker 4B-A0.6B y 21B-A3B. Núcleos NEON+dotprod (ARM), AVX2 y AVX-512 (x86); en
 * memoria limitada guarda en RAM una caché LRU de expertos y lee el resto del disco
 * (libaio/io_uring, solo Linux y Android). En Mac/Metal no hay operadores dispersos: no se
 * propone allí. No acelera BitNet ni Ternary Bonsai. Módulo PURO: sin red ni `node:*`.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** Instrucciones del cpuinfo que aprovecha PowerInfer. */
export interface IsaProc {
    neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean;
}

type BasePowerInfer = Omit<RequisitosModelo,
    "id" | "nombre" | "parametrosB" | "activosB" | "disco" | "ramMinGb" | "almacenamiento" | "upstream" | "tokSRef" | "notas">;

const NOTAS_COMUNES =
    "Cifras del autor, NO medidas por StarSeed. Solo inglés según la ficha ⇒ medir español con el " +
    "banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla «1.58 primero»). " +
    "No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan).";

const BASE: BasePowerInfer = {
    familia: "PowerInfer/SmallThinker", capacidades: ["texto", "razon"], bits: 4,
    formato: "gguf", runtime: "powerinfer", so: ["Linux", "Android"],
    arquitecturas: ["arm64", "x86_64"], aceleradoresRequeridos: ["neon", "avx2", "avx512"],
    herramientasRequeridas: ["clang-21", "cmake"], medios: ["nativo", "servidor"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
    licencia: "Apache-2.0", estado: "en-pruebas", origen: "biblioteca",
};

export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        ...BASE, id: "smallthinker-4b-a06b-powerinfer",
        nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
        parametrosB: 4.27, activosB: 0.6, disco: { gb: 2.29, verificado: true },
        ramMinGb: 4, almacenamiento: { modo: "mmap", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5", tokS: 28.77 }, { equipo: "RK3588", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 }, { equipo: "Intel i9-14900", tokS: 108.17 },
        ],
        notas: NOTAS_COMUNES + " Archivo SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf " +
            "(2.292.487.712 bytes, sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c).",
    },
    {
        ...BASE, id: "smallthinker-21b-a3b-powerinfer",
        nombre: "SmallThinker 21B-A3B (PowerInfer)",
        parametrosB: 21.5, activosB: 3, disco: { gb: 12.14, verificado: true },
        ramMinGb: 8, almacenamiento: { modo: "streaming-ssd", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Intel i9-14900", tokS: 20.3 }, { equipo: "Snapdragon 8 Elite", tokS: 15.5 },
            { equipo: "RK3588", tokS: 8.56 },
        ],
        notas: NOTAS_COMUNES + " Archivo SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf " +
            "(12.144.740.608 bytes, sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb). " +
            "En modo limitado pide ≥ 8 GB de RAM libre y un SSD rápido con Linux o Android.",
    },
];

/** Expertos que caben en la caché LRU para un límite de memoria (README: ~768 por GiB). */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** Lee `Features` (ARM) y `flags` (x86) de un cpuinfo de Linux/Android. */
export function isaDeProcCpuinfo(txt: string): IsaProc {
    let features = "";
    let flags = "";
    for (const linea of txt.split("\n")) {
        const corte = linea.indexOf(":");
        if (corte < 0) continue;
        const clave = linea.slice(0, corte).trim().toLowerCase();
        const valor = linea.slice(corte + 1).trim().toLowerCase();
        if (clave === "features") features = valor;
        else if (clave === "flags") flags = valor;
    }
    const tiene = (texto: string, token: string) => texto.split(/\s+/).includes(token);
    return {
        neon: tiene(features, "asimd"), dotprod: tiene(features, "asimddp"),
        i8mm: tiene(features, "i8mm"), avx2: tiene(flags, "avx2"), avx512: tiene(flags, "avx512f"),
    };
}

/** Núcleo disperso de PowerInfer que más rinde en este procesador. */
export function elegirNucleoPowerInfer(
    isa: IsaProc,
    arq: Arquitectura,
): { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "ARM con NEON y dotprod: núcleo disperso de PowerInfer" };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "x86_64 con AVX-512: el núcleo más rápido de PowerInfer" };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "x86_64 con AVX2: núcleo disperso de PowerInfer" };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
