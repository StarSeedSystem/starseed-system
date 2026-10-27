/**
 * Modelos servidos con PowerInfer (Tiiny-AI/PowerInfer, MIT) y regla de núcleo por procesador.
 *
 * PowerInfer deriva de llama.cpp y solo acelera modelos MoE entrenados para ser dispersos: sus
 * núcleos (NEON+dotprod en ARM, AVX2 y AVX-512 en x86) no aportan nada a BitNet ni a Ternary
 * Bonsai, y en macOS/Metal no existen operadores dispersos. En modo de memoria limitada guarda
 * en RAM una caché LRU de expertos y lee el resto del SSD con libaio/io_uring (solo Linux y
 * Android). Módulo PURO: sin red y sin `node:*`.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** ISA de la CPU que importa a PowerInfer, leída de `/proc/cpuinfo`. */
export interface IsaPowerInfer {
    neon: boolean;
    dotprod: boolean;
    i8mm: boolean;
    avx2: boolean;
    avx512: boolean;
}

/** Núcleo disperso que se compila para esa CPU. */
export type NucleoPowerInfer = "neon-dotprod" | "avx512" | "avx2" | "generico";

/** Campos comunes de los dos SmallThinker publicados por el autor de PowerInfer. */
const BASE: Omit<
    RequisitosModelo,
    "id" | "nombre" | "parametrosB" | "activosB" | "disco" | "ramMinGb" | "almacenamiento" | "upstream" | "tokSRef" | "notas"
> = {
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
};

/** Avisos válidos para los dos modelos: se repiten al final de cada `notas`. */
const NOTAS_COMUNES =
    "Tok/s del README del autor, NO medidos por StarSeed. La ficha del modelo declara solo inglés: " +
    "hay que medir español con el banco de capas antes de promoverlo. No sustituye a Ternary Bonsai " +
    "(regla «1.58 primero»). No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM: al A1 " +
    "le quedan ~1,4 GB libres por plan. ";

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
            { equipo: "Snapdragon 8 Elite · OnePlus 13 (autor)", tokS: 78.99 },
            { equipo: "Intel i9-14900 (autor, sin límite de memoria)", tokS: 108.17 },
        ],
        notas:
            "Archivo `SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf` (2.292.487.712 bytes, " +
            "sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c). " +
            NOTAS_COMUNES +
            "Con 1 GiB de caché caben 768 expertos; el mmap deja el resto en el SSD local.",
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
            "Archivo `SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf` (12.144.740.608 bytes, " +
            "sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb). " +
            NOTAS_COMUNES +
            "En modo limitado pide ≥ 8 GB de RAM libre y un SSD rápido con Linux o Android: la caché " +
            "LRU de expertos vive en RAM y el resto se lee del disco con libaio/io_uring.",
    },
];

/**
 * Expertos que caben en la caché LRU para un límite de RAM en GiB. Regla del README del autor
 * (768 expertos por GiB): 21B con 8 GiB ⇒ 6144; 4B con 1 GiB ⇒ 768. Un límite inválido no cachea.
 */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** Tokens de la línea `clave` de un `/proc/cpuinfo` (ARM usa `Features`, x86 usa `flags`). */
function tokensDe(txt: string, clave: string): Set<string> {
    const linea = txt
        .split(/\r?\n/)
        .find((l) => l.trim().toLowerCase().startsWith(clave.toLowerCase()));
    if (!linea) return new Set();
    const dosPuntos = linea.indexOf(":");
    const resto = dosPuntos >= 0 ? linea.slice(dosPuntos + 1) : "";
    return new Set(resto.trim().split(/\s+/).filter((t) => t.length > 0));
}

/** Detecta las extensiones SIMD que aprovecha PowerInfer a partir del texto de `/proc/cpuinfo`. */
export function isaDeProcCpuinfo(txt: string): IsaPowerInfer {
    const arm = tokensDe(txt, "Features");
    const x86 = tokensDe(txt, "flags");
    return {
        neon: arm.has("asimd"),
        dotprod: arm.has("asimddp"),
        i8mm: arm.has("i8mm"),
        avx2: x86.has("avx2"),
        avx512: x86.has("avx512f"),
    };
}

/**
 * Núcleo disperso que conviene compilar. En ARM hace falta NEON con dotprod; en x86, AVX-512 o
 * AVX2. Sin ninguno de los dos no hay ganancia esperada frente a llama.cpp genérico.
 */
export function elegirNucleoPowerInfer(
    isa: IsaPowerInfer,
    arq: Arquitectura,
): { nucleo: NucleoPowerInfer; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "NEON con dotprod (asimddp): núcleos dispersos de ARM" };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "AVX-512 disponible: el núcleo disperso más rápido en x86" };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "AVX2 disponible: núcleo disperso para x86 sin AVX-512" };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
