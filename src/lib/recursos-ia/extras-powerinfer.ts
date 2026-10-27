/**
 * SmallThinker (MoE disperso) servido por PowerInfer — Recursos de IA (Ola 1025R).
 *
 * PowerInfer (github.com/Tiiny-AI/PowerInfer, MIT) SOLO acelera modelos entrenados para ser dispersos: núcleos
 * NEON+dotprod (ARM) y AVX2/AVX-512 (x86); no acelera BitNet ni Ternary Bonsai y en Mac (Metal) no hay núcleos
 * dispersos, así que no se propone allí. Modo limitado: caché LRU de expertos en RAM y el resto leído del disco
 * con libaio/io_uring (solo Linux y Android). Se compila a mano: CMake, clang-21 y mold. Módulo PURO: sin red,
 * sin disco, sin `node:*`; lo importa el cliente.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

export type IsaCpuinfo = { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean };

export type NucleoPowerInfer = "neon-dotprod" | "avx512" | "avx2" | "generico";

/** Lo común de los dos SmallThinker servidos por PowerInfer. */
const BASE: Pick<
    RequisitosModelo,
    "familia" | "capacidades" | "bits" | "formato" | "runtime" | "licencia" | "so" | "arquitecturas" | "aceleradoresRequeridos" | "herramientasRequeridas" | "servidor" | "medios" | "estado" | "origen"
> = {
    familia: "PowerInfer/SmallThinker",
    capacidades: ["texto", "razon"],
    bits: 4,
    formato: "gguf",
    runtime: "powerinfer",
    licencia: "Apache-2.0",
    so: ["Linux", "Android"],
    arquitecturas: ["arm64", "x86_64"],
    aceleradoresRequeridos: ["neon", "avx2", "avx512"], // basta uno
    herramientasRequeridas: ["clang-21", "cmake"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
    medios: ["nativo", "servidor"],
    estado: "en-pruebas", origen: "biblioteca",
};

/** Ideas comunes de las fichas: cifras del README del autor, no medidas por StarSeed. */
const NOTAS_COMUNES =
    "Cifras de tok/s del README del autor: NO medidas por StarSeed. Su ficha declara solo inglés: medir el español con el " +
    "banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla «1.58 primero») y no corre en la Mac de 8 GB " +
    "ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan).";

/** Los dos SmallThinker publicados (Q4_0, Apache-2.0), con el GGUF verificado byte a byte. */
export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        ...BASE,
        id: "smallthinker-4b-a06b-powerinfer",
        nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
        parametrosB: 4.27,
        activosB: 0.6,
        disco: { gb: 2.29, verificado: true }, // Q4_0 completo cabe en RAM: mmap
        ramMinGb: 4,
        almacenamiento: { modo: "mmap", soloLocal: true },
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        tokSRef: [
            { equipo: "Raspberry Pi 5", tokS: 28.77 }, { equipo: "Rockchip RK3588", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 }, { equipo: "Intel Core i9-14900", tokS: 108.17 },
        ],
        notas:
            NOTAS_COMUNES +
            " Archivo `SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf` (repo Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF): " +
            "2.292.487.712 bytes (2,29 GB), sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c. " +
            "La tabla de tok/s es sin límite de memoria.",
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
            { equipo: "Intel Core i9-14900 (limitado a 8 GB de RAM)", tokS: 20.3 }, { equipo: "Snapdragon 8 Elite (limitado a 8 GB de RAM)", tokS: 15.5 },
            { equipo: "Rockchip RK3588 (limitado a 8 GB de RAM)", tokS: 8.56 },
        ],
        notas:
            NOTAS_COMUNES +
            " Archivo `SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf` del repo Tiiny/SmallThinker-21BA3B-" +
            "Instruct-GGUF: 12.144.740.608 bytes (12,14 GB), sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65" +
            "f073224c9a3afe4ccb. En modo limitado pide ≥ 8 GB de RAM libres y un SSD rápido, con Linux o Android " +
            "(la tabla de tok/s es en esa modalidad).",
    },
];

/** Expertos que caben en la caché LRU del modo limitado: el README trae 768 por cada GiB. */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** ISA útil de `/proc/cpuinfo`: ARM lo dice en la línea «Features», x86 en «flags». */
export function isaDeProcCpuinfo(txt: string): IsaCpuinfo {
    const linea = (re: RegExp): string => (txt.split("\n").find((l) => re.test(l)) ?? "").toLowerCase();
    const arm = linea(/^\s*features\s*:/i);
    const x86 = linea(/^\s*flags\s*:/i);
    return {
        neon: /\basimd\b/.test(arm),
        dotprod: /\basimddp\b/.test(arm),
        i8mm: /\bi8mm\b/.test(arm),
        avx2: /\bavx2\b/.test(x86),
        avx512: /\bavx512f\b/.test(x86),
    };
}

/** Núcleo disperso a compilar para ESTA neurona: ARM con dotprod gana; en x86, AVX-512 antes que AVX2. */
export function elegirNucleoPowerInfer(isa: IsaCpuinfo, arq: Arquitectura): { nucleo: NucleoPowerInfer; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "ARM con NEON y dotprod (asimddp): el núcleo disperso más rápido." };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "x86_64 con AVX-512: el núcleo más ancho que trae PowerInfer." };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "x86_64 con AVX2 y sin AVX-512: núcleo disperso base." };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
