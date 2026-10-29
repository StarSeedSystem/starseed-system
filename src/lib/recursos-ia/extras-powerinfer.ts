/**
 * PowerInfer (github.com/Tiiny-AI/PowerInfer, MIT) — runtime «powerinfer» del catálogo de
 * Recursos de IA (Ola 1025R). Módulo PURO: sin `node:*`, ni red, ni disco. Contrato: `./tipos`.
 *
 * Motor derivado de llama.cpp que acelera MoE dispersos (SmallThinker): se compila a mano
 * (CMake, clang-21) y no se propone para Mac (sin operadores dispersos en Metal).
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

export type NucleoPowerInfer = "neon-dotprod" | "avx512" | "avx2" | "generico";

/** Extensiones ISA que importan al elegir el núcleo disperso de PowerInfer. */
export type IsaProcesador = { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean };

export interface EleccionNucleoPowerInfer { nucleo: NucleoPowerInfer; motivo: string }

/** Campos comunes de los dos modelos SmallThinker servidos por PowerInfer. */
const BASE: Pick<RequisitosModelo, "origen" | "estado" | "runtime" | "formato" | "bits" | "capacidades" | "familia" |
    "licencia" | "so" | "arquitecturas" | "aceleradoresRequeridos" | "herramientasRequeridas" | "medios" | "servidor"> = {
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
    aceleradoresRequeridos: ["neon", "avx2", "avx512"], // basta uno
    herramientasRequeridas: ["clang-21", "cmake"],
    medios: ["nativo", "servidor"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
};

/** Notas que los dos modelos comparten. */
const NOTAS_COMUNES: string[] = [
    "ramMinGb es la RAM total del equipo que procesa (convenio del catálogo), no lo que ocupa el modelo.",
    "Las cifras de tok/s son del README del autor, no medidas por StarSeed.",
    "La ficha del modelo declara solo inglés: medir el español con el banco de capas antes de promoverlo.",
    "No sustituye a Ternary Bonsai: rige «1.58 primero», y solo acelera modelos entrenados dispersos.",
    "No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (allí quedan ~1,4 GB libre por plan).",
];

/** Expertos que caben en la caché LRU de RAM: 768 por cada GiB libre (regla del README). */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** Palabra en /proc/cpuinfo → campo de IsaProcesador ("asimd" es NEON de ARM; "flags" es x86). */
const ISA_POR_PALABRA: [keyof IsaProcesador, string][] = [
    ["neon", "asimd"], ["dotprod", "asimddp"], ["i8mm", "i8mm"], ["avx2", "avx2"], ["avx512", "avx512f"],
];

/** Lee las líneas `Features` (ARM) y `flags` (x86) de un texto de /proc/cpuinfo. */
export function isaDeProcCpuinfo(txt: string): IsaProcesador {
    const isa: IsaProcesador = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };
    for (const linea of txt.split("\n")) {
        const d = linea.indexOf(":"); if (d < 0) continue;
        const clave = linea.slice(0, d).trim().toLowerCase();
        if (clave !== "features" && clave !== "flags") continue;
        const lista = linea.slice(d + 1).toLowerCase().split(/\s+/);
        for (const [r, palabra] of ISA_POR_PALABRA) isa[r] = isa[r] || lista.includes(palabra);
    }
    return isa;
}

/** Núcleo disperso que compilar según la ISA disponible y la arquitectura del procesador. */
export function elegirNucleoPowerInfer(isa: IsaProcesador, arq: Arquitectura): EleccionNucleoPowerInfer {
    if (arq === "arm64" && isa.neon && isa.dotprod) return { nucleo: "neon-dotprod", motivo: "NEON con dotprod: núcleo disperso NEON+dotprod de PowerInfer." };
    if (arq === "x86_64" && isa.avx512) return { nucleo: "avx512", motivo: "AVX-512 disponible: núcleo disperso AVX-512 de PowerInfer." };
    if (arq === "x86_64" && isa.avx2) return { nucleo: "avx2", motivo: "AVX2 disponible: núcleo disperso AVX2 de PowerInfer." };
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}

/**
 * SmallThinker 4B-A0.6B en Q4_0 (2,29 GB en disco): cabe mapeado entero, sin caché por expertos;
 * el 21B-A3B en Q4_0 (12,14 GB) va en modo limitado: caché LRU en RAM y resto del disco.
 */
export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        ...BASE,
        id: "smallthinker-4b-a06b-powerinfer",
        nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
        activosB: 0.6, parametrosB: 4.27,
        disco: { gb: 2.29, verificado: true }, ramMinGb: 4,
        almacenamiento: { modo: "mmap", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5 (autor)", tokS: 28.77 }, { equipo: "RK3588 (autor)", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite · OnePlus 13 (autor)", tokS: 78.99 }, { equipo: "Intel i9-14900 (autor)", tokS: 108.17 },
        ],
        notas: [
            ...NOTAS_COMUNES,
            "Peso verificado: SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf, 2.292.487.712 bytes, " +
                "sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c.",
        ].join(" "),
    },
    {
        ...BASE,
        id: "smallthinker-21b-a3b-powerinfer",
        nombre: "SmallThinker 21B-A3B (PowerInfer)",
        activosB: 3, parametrosB: 21.5,
        disco: { gb: 12.14, verificado: true }, ramMinGb: 8,
        almacenamiento: { modo: "streaming-ssd", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Intel i9-14900, límite de 8 GiB (autor)", tokS: 20.3 }, { equipo: "Snapdragon 8 Elite, límite de 8 GiB (autor)", tokS: 15.5 },
            { equipo: "RK3588, límite de 8 GiB (autor)", tokS: 8.56 },
        ],
        notas: [
            ...NOTAS_COMUNES,
            "En modo de memoria limitada guarda en RAM solo una caché LRU de expertos (768 por GiB, " +
                "ver maxNCached) y lee el resto del disco: pide ≥ 8 GiB de RAM libres y un SSD rápido.",
            "Peso verificado: SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf, 12.144.740.608 bytes, sha256 " +
                "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb.",
        ].join(" "),
    },
];
