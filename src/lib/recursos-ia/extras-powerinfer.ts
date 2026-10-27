/**
 * PowerInfer: runtime para modelos de IA dispersos (SmallThinker 4B y 21B) en Linux y Android.
 * Módulo PURO: sin red ni dependencias de Node (`node:*`).
 */

import { RequisitosModelo, Arquitectura } from "./tipos";

export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        id: "smallthinker-4b-a06b-powerinfer",
        nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
        familia: "PowerInfer/SmallThinker",
        capacidades: ["texto", "razon"],
        bits: 4,
        formato: "gguf",
        runtime: "powerinfer",
        parametrosB: 4.27,
        activosB: 0.6,
        disco: {
            gb: 2.29,
            verificado: true,
        },
        ramMinGb: 4,
        so: ["Linux", "Android"],
        arquitecturas: ["arm64", "x86_64"],
        aceleradoresRequeridos: ["neon"],
        herramientasRequeridas: ["clang-21", "cmake"],
        almacenamiento: {
            modo: "mmap",
            soloLocal: true,
        },
        servidor: {
            protocolo: "openai",
            url: "http://127.0.0.1:8794/v1",
        },
        medios: ["nativo", "servidor"],
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5", tokS: 28.77 },
            { equipo: "RK3588", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 },
            { equipo: "Intel i9-14900", tokS: 108.17 },
        ],
        notas:
            "Cifras del autor, no medidas por StarSeed. Solo inglés según la ficha: medir español con el " +
            "banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla 1.58 primero). " +
            "No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan).",
        estado: "en-pruebas",
        origen: "biblioteca",
    },
    {
        id: "smallthinker-21b-a3b-powerinfer",
        nombre: "SmallThinker 21B-A3B (PowerInfer)",
        familia: "PowerInfer/SmallThinker",
        capacidades: ["texto", "razon"],
        bits: 4,
        formato: "gguf",
        runtime: "powerinfer",
        parametrosB: 21.5,
        activosB: 3,
        disco: {
            gb: 12.14,
            verificado: true,
        },
        ramMinGb: 8,
        so: ["Linux", "Android"],
        arquitecturas: ["arm64", "x86_64"],
        aceleradoresRequeridos: ["neon"],
        herramientasRequeridas: ["clang-21", "cmake"],
        almacenamiento: {
            modo: "streaming-ssd",
            soloLocal: true,
        },
        servidor: {
            protocolo: "openai",
            url: "http://127.0.0.1:8794/v1",
        },
        medios: ["nativo", "servidor"],
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Intel i9-14900", tokS: 20.3 },
            { equipo: "Snapdragon 8 Elite", tokS: 15.5 },
            { equipo: "RK3588", tokS: 8.56 },
        ],
        notas:
            "Cifras del autor, no medidas por StarSeed. Solo inglés según la ficha: medir español con el " +
            "banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla 1.58 primero). " +
            "El 21B en modo limitado pide mayor o igual a 8 GB de RAM libre y un SSD rápido con Linux o Android.",
        estado: "en-pruebas",
        origen: "biblioteca",
    },
];

export function maxNCached(limiteGiB: number): number {
    if (typeof limiteGiB !== "number" || !Number.isFinite(limiteGiB) || limiteGiB <= 0) {
        return 0;
    }
    return Math.round(768 * limiteGiB);
}

export function isaDeProcCpuinfo(txt: string): {
    neon: boolean;
    dotprod: boolean;
    i8mm: boolean;
    avx2: boolean;
    avx512: boolean;
} {
    const lineas = txt.split("\n");
    let neon = false;
    let dotprod = false;
    let i8mm = false;
    let avx2 = false;
    let avx512 = false;

    for (const linea of lineas) {
        const lower = linea.toLowerCase();
        if (lower.startsWith("features") || lower.startsWith("flags") || lower.startsWith("isa")) {
            if (lower.includes("asimd") || lower.includes("neon")) neon = true;
            if (lower.includes("asimddp") || lower.includes("dotprod")) dotprod = true;
            if (lower.includes("i8mm")) i8mm = true;
            if (lower.includes("avx2")) avx2 = true;
            if (lower.includes("avx512f") || lower.includes("avx512")) avx512 = true;
        }
    }
    return { neon, dotprod, i8mm, avx2, avx512 };
}

export function elegirNucleoPowerInfer(
    isa: { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean },
    arq: Arquitectura
): { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return {
            nucleo: "neon-dotprod",
            motivo: "arquitectura arm64 con soporte neon y dotprod detectado",
        };
    }
    if (arq === "x86_64" && isa.avx512) {
        return {
            nucleo: "avx512",
            motivo: "arquitectura x86_64 con soporte avx512 detectado",
        };
    }
    if (arq === "x86_64" && isa.avx2) {
        return {
            nucleo: "avx2",
            motivo: "arquitectura x86_64 con soporte avx2 detectado",
        };
    }
    return {
        nucleo: "generico",
        motivo: "sin dotprod ni AVX2: sin ganancia esperada",
    };
}
