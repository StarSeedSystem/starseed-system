/**
 * PowerInfer en el catálogo de Recursos de IA (Ola 1025R). Módulo PURO: sin red, sin disco, sin `node:*`.
 *
 * PowerInfer (github.com/Tiiny-AI/PowerInfer, MIT) es un motor local derivado de llama.cpp que SOLO acelera
 * modelos entrenados para ser dispersos (carpeta `smallthinker/`: NEON+dotprod, AVX2, AVX-512). No acelera
 * BitNet ni Ternary Bonsai y en Mac (Metal) no tiene operadores dispersos: allí no se propone (CMake y clang-21).
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** Frases comunes a las dos fichas: medidas del autor, idioma, regla 1.58 primero y avisos de RAM. */
const NOTAS_COMUNES =
    "Cifras del autor (su README), NO medidas por StarSeed. Su ficha declara solo inglés: medir español con " +
    "el banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla «1.58 primero»). No corre en " +
    "la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan). ";

/** Campos que comparten las dos fichas: sobre esto va lo de cada modelo. */
type Comun = Pick<
    RequisitosModelo,
    "familia" | "capacidades" | "bits" | "formato" | "runtime" | "servidor" | "medios" | "licencia" |
        "so" | "arquitecturas" | "aceleradoresRequeridos" | "herramientasRequeridas" | "estado" | "origen"
>;

/** Lo común a los dos SmallThinker servidos por PowerInfer (basta con que case un núcleo). */
const BASE: Comun = {
    familia: "PowerInfer/SmallThinker",
    capacidades: ["texto", "razon"],
    bits: 4,
    formato: "gguf",
    runtime: "powerinfer",
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
    medios: ["nativo", "servidor"],
    licencia: "Apache-2.0",
    so: ["Linux", "Android"],
    arquitecturas: ["arm64", "x86_64"],
    aceleradoresRequeridos: ["neon", "avx2", "avx512"],
    herramientasRequeridas: ["clang-21", "cmake"],
    estado: "en-pruebas",
    origen: "biblioteca",
};

/** SmallThinker en el catálogo, servidos por PowerInfer (tamaños y SHA verificados del repo del autor). */
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
            { equipo: "Raspberry Pi 5 (autor: sin límite de memoria)", tokS: 28.77 },
            { equipo: "RK3588 (autor: sin límite de memoria)", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite · OnePlus 13 (autor: sin límite de memoria)", tokS: 78.99 },
            { equipo: "Intel i9-14900 (autor: sin límite de memoria)", tokS: 108.17 },
        ],
        notas:
            NOTAS_COMUNES +
            "Archivo SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf verificado (2.292.487.712 bytes, sha256 " +
            "defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c): se lee todo por mmap, según el núcleo.",
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
            { equipo: "Intel i9-14900 (autor: limitado a 8 GB de RAM)", tokS: 20.3 },
            { equipo: "Snapdragon 8 Elite (autor: limitado a 8 GB de RAM)", tokS: 15.5 },
            { equipo: "RK3588 (autor: limitado a 8 GB de RAM)", tokS: 8.56 },
        ],
        notas:
            NOTAS_COMUNES +
            "En modo limitado guarda en RAM solo una caché LRU de expertos (~768 por GiB, ver maxNCached) y lee " +
            "el resto del SSD con libaio/io_uring (solo Linux y Android): pide ≥ 8 GB de RAM libre y SSD rápido. " +
            "Archivo SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf verificado (12.144.740.608 bytes, sha256 " +
            "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb).",
    },
];

/** ISA visible en un `cpuinfo` (ARM: línea «Features»; x86: línea «flags»). */
export interface IsaProcCpuinfo { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean }

/** Núcleo disperso disponible en la neurona y por qué se eligió. */
export interface NucleoPowerInfer { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string }

/** Expertos que PowerInfer guarda en RAM: ≈768 por GiB libre (README: 21B con 8 GiB ⇒ 6144). */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** Lee el ISA de un `cpuinfo`: solo cuentan las líneas «Features» (ARM) y «flags» (x86). PURA. */
export function isaDeProcCpuinfo(txt: string): IsaProcCpuinfo {
    const junto = txt.split("\n").filter((l) => /^\s*(features|flags)\s*:/i.test(l)).join(" ").toLowerCase();
    const tiene = (t: string): boolean => new RegExp(`\\b${t}\\b`).test(junto);
    return {
        neon: tiene("asimd"), // asimd = NEON en «Features»
        dotprod: tiene("asimddp"),
        i8mm: tiene("i8mm"),
        avx2: tiene("avx2"),
        avx512: tiene("avx512f"),
    };
}

/** Regla del área: arm64 + NEON+dotprod › AVX-512 › AVX2, y fuera de eso núcleo genérico. */
export function elegirNucleoPowerInfer(isa: IsaProcCpuinfo, arq: Arquitectura): NucleoPowerInfer {
    if (arq === "arm64" && isa.neon && isa.dotprod)
        return { nucleo: "neon-dotprod", motivo: "NEON con dotprod: núcleo disperso del paquete smallthinker." };
    if (arq === "x86_64" && isa.avx512) return { nucleo: "avx512", motivo: "AVX-512 disponible en la CPU." };
    if (arq === "x86_64" && isa.avx2) return { nucleo: "avx2", motivo: "AVX2 disponible en la CPU." };
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
