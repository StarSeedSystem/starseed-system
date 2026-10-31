/**
 * PowerInfer (github.com/Tiiny-AI/PowerInfer, MIT) en «Recursos de IA»: motor derivado de llama.cpp
 * que acelera SOLO modelos MoE entrenados para ser dispersos (SmallThinker). No acelera BitNet ni
 * Ternary Bonsai (regla «1.58 primero») y no corre en Mac (Metal): núcleos dispersos NEON+dotprod
 * (ARM) y AVX2/AVX-512 (x86). Se compila a mano. PURO: sin red, sin disco, sin `node:*`.
 */
import type { Acelerador, Arquitectura, Bits, Capacidad, MedioApp, RequisitosModelo } from "./tipos";

/** Campos comunes de los dos SmallThinker servidos por PowerInfer. */
const BASE = {
    familia: "PowerInfer/SmallThinker",
    capacidades: ["texto", "razon"] as Capacidad[],
    bits: 4 as Bits,
    formato: "gguf",
    runtime: "powerinfer",
    licencia: "Apache-2.0",
    so: ["Linux", "Android"] as string[],
    arquitecturas: ["arm64", "x86_64"] as Arquitectura[],
    // Basta UNO: el núcleo exacto lo elige `elegirNucleoPowerInfer` leyendo proc/cpuinfo.
    aceleradoresRequeridos: ["neon", "avx2", "avx512"] as Acelerador[],
    herramientasRequeridas: ["clang-21", "cmake"],
    servidor: { protocolo: "openai" as const, url: "http://127.0.0.1:8794/v1" },
    medios: ["nativo", "servidor"] as MedioApp[],
    estado: "en-pruebas" as const,
    origen: "biblioteca" as const,
};

/** Instrucciones SIMD que declara un `/proc/cpuinfo` («Features» en ARM, «flags» en x86). */
export type IsaProcesador = { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean };

/** Núcleo de PowerInfer a compilar para una neurona. */
export type NucleoPowerInfer = { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string };

/**
 * Expertos de SmallThinker en la caché LRU de RAM (README del autor: 768 por GiB: 21B con
 * 8 GiB ⇒ 6144; 4B con 1 GiB ⇒ 768), redondeados; 0 si el límite no es válido.
 */
export function maxNCached(limiteGiB: number): number {
    return Number.isFinite(limiteGiB) && limiteGiB > 0 ? Math.round(768 * limiteGiB) : 0;
}

/** ¿Está la palabra suelta en la línea (no un prefijo de otra: «asimd» no es «asimddp»)? */
function tienePalabra(linea: string, palabra: string): boolean {
    return new RegExp(`(^|[\\s,])${palabra}([\\s,]|$)`).test(linea);
}

/** Lee las instrucciones de un `/proc/cpuinfo` (ARM: «Features»; x86: «flags»). */
export function isaDeProcCpuinfo(txt: string): IsaProcesador {
    const lineas = txt.split(/\r?\n/);
    const features = lineas.find((l) => /^features\s*:/i.test(l)) ?? "";
    const flags = lineas.find((l) => /^flags\s*:/i.test(l)) ?? "";
    return {
        neon: tienePalabra(features, "asimd"), dotprod: tienePalabra(features, "asimddp"), i8mm: tienePalabra(features, "i8mm"),
        avx2: tienePalabra(flags, "avx2"), avx512: tienePalabra(flags, "avx512f"),
    };
}

/** Núcleo de PowerInfer que compila en esta neurona según sus instrucciones y su arquitectura. */
export function elegirNucleoPowerInfer(isa: IsaProcesador, arq: Arquitectura): NucleoPowerInfer {
    if (arq === "arm64" && isa.neon && isa.dotprod) return { nucleo: "neon-dotprod", motivo: "NEON con dotprod: núcleo disperso ARM completo" };
    if (arq === "x86_64" && isa.avx512) return { nucleo: "avx512", motivo: "AVX-512 disponible: mejor ancho de banda para los expertos dispersos" };
    if (arq === "x86_64" && isa.avx2) return { nucleo: "avx2", motivo: "AVX2 disponible: sin AVX-512, se usa el núcleo de 256 bits" };
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}

const NOTAS_COMUNES =
    "Cifras de tok/s del README del autor, no medidas por StarSeed. " +
    "Su ficha declara solo inglés: medir español con el banco de capas antes de promoverlo. " +
    "No sustituye a Ternary Bonsai (regla «1.58 primero»). " +
    "No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan). ";

const notasArchivo = (nombre: string, bytes: number, sha: string): string =>
    `Archivo ${nombre}: ${bytes} bytes, sha256 ${sha} (verificado).`;

/** SmallThinker 4B-A0.6B: ~0,6 B de expertos activos por token, cabe por mmap en un equipo de 4 GB. */
const MODELO_4B: RequisitosModelo = {
    ...BASE,
    id: "smallthinker-4b-a06b-powerinfer",
    nombre: "SmallThinker 4B-A0.6B (PowerInfer)",
    parametrosB: 4.27,
    activosB: 0.6,
    disco: { gb: 2.29, verificado: true },
    ramMinGb: 4,
    almacenamiento: { modo: "mmap", soloLocal: true },
    upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
    // README del autor, sin límite de memoria (todo el modelo mapeado).
    tokSRef: [
        { equipo: "Raspberry Pi 5", tokS: 28.77 }, { equipo: "RK3588", tokS: 39.76 },
        { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 }, { equipo: "Intel i9-14900", tokS: 108.17 },
    ],
    notas: NOTAS_COMUNES + notasArchivo("SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf", 2292487712,
        "defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c"),
};

/** SmallThinker 21B-A3B: 3 B de expertos activos; en RAM limitada streama expertos del SSD. */
const MODELO_21B: RequisitosModelo = {
    ...BASE,
    id: "smallthinker-21b-a3b-powerinfer",
    nombre: "SmallThinker 21B-A3B (PowerInfer)",
    parametrosB: 21.5,
    activosB: 3,
    disco: { gb: 12.14, verificado: true },
    ramMinGb: 8,
    almacenamiento: { modo: "streaming-ssd", soloLocal: true },
    upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
    // README del autor, en modo de memoria limitada (caché LRU de expertos en RAM).
    tokSRef: [
        { equipo: "Intel i9-14900", tokS: 20.3 }, { equipo: "Snapdragon 8 Elite", tokS: 15.5 },
        { equipo: "RK3588", tokS: 8.56 },
    ],
    notas:
        NOTAS_COMUNES +
        "En modo limitado guarda en RAM solo una caché LRU de expertos y lee el resto del disco con " +
        "libaio/io_uring (solo Linux y Android): pide ≥ 8 GB de RAM libre y un SSD rápido. " +
        `Caché: \`maxNCached(8)\` ⇒ ${maxNCached(8)} expertos. ` +
        notasArchivo("SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf", 12144740608,
            "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb"),
};

export const MODELOS_POWERINFER: RequisitosModelo[] = [MODELO_4B, MODELO_21B];
