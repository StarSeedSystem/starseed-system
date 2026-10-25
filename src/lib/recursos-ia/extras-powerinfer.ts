/**
 * SmallThinker (PowerInfer) en «Recursos de IA» · fichas del catálogo + reglas del núcleo.
 * PowerInfer (github.com/Tiiny-AI/PowerInfer, MIT, sin releases; últ. commit 8bd56d6, 2026-05-11), runtime derivado
 * de llama.cpp: SOLO acelera modelos entrenados para ser dispersos (no BitNet ni Ternary Bonsai). Núcleos MoE con
 * NEON+dotprod (ARM) y AVX2/AVX-512 (x86_64); en modo limitado guarda en RAM una caché LRU de expertos y lee el
 * resto del disco (solo Linux y Android). En Mac (Metal) no hay núcleos dispersos: no se propone allí. Se compila
 * a mano con CMake. Módulo PURO: sin red, sin disco, sin `node:*`.
 */
import type { Arquitectura, RequisitosModelo } from "./tipos";

/** SIMD de la neurona (`/proc/cpuinfo`): ARM `asimd` (=NEON), `asimddp` (=dotprod) e `i8mm`; x86 `avx2` y `avx512f`. */
export interface IsaCpu {
    neon: boolean;
    dotprod: boolean;
    i8mm: boolean;
    avx2: boolean;
    avx512: boolean;
}

/** Núcleo disperso que se compila para PowerInfer (elegido con «elegirNucleoPowerInfer»). */
export type NucleoPowerInfer = "neon-dotprod" | "avx512" | "avx2" | "generico";

/** Expertos en RAM en el modo limitado: 768 por GiB libre (README: 21B y 8 GiB ⇒ 6144; 4B y 1 GiB ⇒ 768). PURA. */
export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

/** Primer campo `Features` o `flags` del texto, como conjunto de minúsculas. PURA. */
function tokensDeCampo(txt: string, campo: string): Set<string> {
    const linea = new RegExp(`^${campo}\\s*:\\s*(.+)$`, "m").exec(txt)?.[1] ?? "";
    return new Set(linea.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
}

/** `/proc/cpuinfo` → SIMD con más detalle que `cpuDeProcCpuinfo` (dotprod, i8mm): primera `Features` (ARM) y primera
 * `flags` (x86). Enseñarlo de aquí solo: unirlo a `simdCpu` queda como seguimiento. PURA. */
export function isaDeProcCpuinfo(txt: string): IsaCpu {
    const arm = tokensDeCampo(txt, "Features");
    const x86 = tokensDeCampo(txt, "flags");
    return {
        neon: arm.has("asimd") || arm.has("neon"), dotprod: arm.has("asimddp"), i8mm: arm.has("i8mm"),
        avx2: x86.has("avx2"), avx512: x86.has("avx512f"),
    };
}

/** Campos idénticos de los dos modelos (plantilla: TurboFieldfare en `catalogo.ts`). */
const BASE: Omit<RequisitosModelo, "id" | "nombre" | "parametrosB" | "activosB" | "disco" | "ramMinGb" | "almacenamiento" | "upstream" | "tokSRef" | "notas"> = {
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
    aceleradoresRequeridos: ["neon", "avx2", "avx512"], // hace falta AL MENOS uno
    herramientasRequeridas: ["clang-21", "cmake"],
    medios: ["nativo", "servidor"],
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
};

/** Ideas comunes a las notas de los dos modelos: cifras del autor sin medir, 1.58 primero, medios que no caben. */
const NOTAS_COMUNES = "Cifras de tok/s del README del autor, NO medidas por StarSeed. La ficha declara solo inglés: medir " +
    "español con el banco de capas antes de promoverlo. No sustituye a Ternary Bonsai (regla «1.58 primero»). " +
    "No corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM (al A1 le quedan ~1,4 GB libres por plan); " +
    "sin operadores dispersos para Metal, no se propone en macOS. Se compila a mano con CMake (clang-21 y mold " +
    "como enlazador): núcleos NEON+dotprod (ARM), AVX2 y AVX-512 (x86_64). ";

/** SmallThinker MoE disperso, el par de modelos publicados de PowerInfer; pesos del autor Tiiny (HF). */
export const MODELOS_POWERINFER: RequisitosModelo[] = [
    {
        // README sin límite de memoria: el 4B cabe entero en RAM, sin modo limitado.
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
            { equipo: "Raspberry Pi 5 (autor)", tokS: 28.77 }, { equipo: "RK3588 (autor)", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite · OnePlus 13 (autor)", tokS: 78.99 }, { equipo: "Intel i9-14900 (autor)", tokS: 108.17 } ],
        notas: NOTAS_COMUNES + "Con 4 GB de RAM total basta: `almacenamiento` mmap, todo el modelo en RAM. Pesos: " +
            "`SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf` del repo Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF " +
            "(2.292.487.712 bytes, sha256 defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c).",
    },
    {
        // README en modo limitado a 8 GiB de RAM: caché LRU de expertos, resto del disco.
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
            { equipo: "Intel i9-14900 (autor, límite 8 GiB)", tokS: 20.3 }, { equipo: "Snapdragon 8 Elite (autor, límite 8 GiB)", tokS: 15.5 },
            { equipo: "RK3588 (autor, límite 8 GiB)", tokS: 8.56 } ],
        notas:
            NOTAS_COMUNES +
            "En el modo limitado (caché LRU de expertos en RAM, resto del disco con libaio/io_uring) pide ≥ 8 GB de RAM libre y un SSD rápido, con Linux o Android. Pesos: " +
            "`SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf` del repo Tiiny/SmallThinker-21BA3B-Instruct-GGUF (12.144.740.608 bytes, sha256 9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb).",
    },
];

/** Núcleo disperso a compilar: arm64 con NEON+dotprod; x86_64 AVX-512 primero, luego AVX2. PURA. */
export function elegirNucleoPowerInfer(isa: IsaCpu, arq: Arquitectura): { nucleo: NucleoPowerInfer; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod)
        return { nucleo: "neon-dotprod", motivo: "NEON con dotprod (asimd y asimddp): núcleo disperso ARM más ancho" };
    if (arq === "x86_64" && isa.avx512) return { nucleo: "avx512", motivo: "AVX-512 (avx512f): núcleo disperso x86 de 512 bits" };
    if (arq === "x86_64" && isa.avx2) return { nucleo: "avx2", motivo: "AVX2 sin AVX-512: núcleo disperso x86 de 256 bits" };
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
