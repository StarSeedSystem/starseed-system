/**
 * PowerInfer extras (runtime powerinfer) — módulo PURO.
 * Sin red, sin node:*. Solo tipos y funciones puras.
 */
import type { Acelerador, Arquitectura, RequisitosModelo } from "./tipos";

const BASE_NOTAS =
    "Cifras del autor, NO medidas por StarSeed; solo inglés según la ficha ⇒ medir español con el banco de capas antes de promoverlo; " +
    "no sustituye a Ternary Bonsai (regla «1.58 primero»); no corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM " +
    "(al A1 le quedan ~1,4 GB libres por plan); " +
    "el 21B en modo limitado pide ≥ 8 GB de RAM libre y un SSD rápido con Linux o Android.";

const ACCELERADORES_REQUERIDOS: Acelerador[] = ["neon", "avx2", "avx512"];
const ARQUITECTURAS: Arquitectura[] = ["arm64", "x86_64"];
const HERRAMIENTAS_REQUERIDAS = ["clang-21", "cmake"];
const MEDIOS = ["nativo", "servidor"] as const;

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
        disco: { gb: 2.29, verificado: true },
        ramMinGb: 4,
        so: ["Linux", "Android"],
        arquitecturas: ARQUITECTURAS,
        aceleradoresRequeridos: ACCELERADORES_REQUERIDOS,
        herramientasRequeridas: HERRAMIENTAS_REQUERIDAS,
        almacenamiento: { modo: "mmap", soloLocal: true },
        servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
        medios: [...MEDIOS],
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5", tokS: 28.77 },
            { equipo: "RK3588", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 },
            { equipo: "Intel i9-14900", tokS: 108.17 },
        ],
        notas:
            BASE_NOTAS +
            " SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf (2.292.487.712 bytes, sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c).",
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
        disco: { gb: 12.14, verificado: true },
        ramMinGb: 8,
        so: ["Linux", "Android"],
        arquitecturas: ARQUITECTURAS,
        aceleradoresRequeridos: ACCELERADORES_REQUERIDOS,
        herramientasRequeridas: HERRAMIENTAS_REQUERIDAS,
        almacenamiento: { modo: "streaming-ssd", soloLocal: true },
        servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
        medios: [...MEDIOS],
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Intel i9-14900 (8 GB RAM límite)", tokS: 20.3 },
            { equipo: "Snapdragon 8 Elite (8 GB RAM límite)", tokS: 15.5 },
            { equipo: "RK3588 (8 GB RAM límite)", tokS: 8.56 },
        ],
        notas:
            BASE_NOTAS +
            " SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf (12.144.740.608 bytes, sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb); " +
            "tokSRef con límite de 8 GB de RAM.",
        estado: "en-pruebas",
        origen: "biblioteca",
    },
];

export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

export function isaDeProcCpuinfo(txt: string): { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean } {
    const t = txt.toLowerCase();
    const neon = /asimd/.test(t);
    const dotprod = /asimddp/.test(t);
    const i8mm = /i8mm/.test(t);
    const avx2 = /\bavx2\b/.test(t);
    const avx512 = /\bavx512f\b/.test(t);
    return { neon, dotprod, i8mm, avx2, avx512 };
}

export function elegirNucleoPowerInfer(
    isa: { neon: boolean; dotprod: boolean; avx2: boolean; avx512: boolean },
    arq: Arquitectura,
): { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "ARM64 con NEON+dotprod" };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "x86_64 con AVX-512" };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "x86_64 con AVX2" };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
