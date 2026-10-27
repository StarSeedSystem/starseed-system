import type { RequisitosModelo, Arquitectura } from "./tipos";

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
        almacenamiento: { modo: "mmap", soloLocal: true },
        medios: ["nativo", "servidor"],
        servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF",
        so: ["Linux", "Android"],
        arquitecturas: ["arm64", "x86_64"],
        aceleradoresRequeridos: ["neon", "avx2", "avx512"],
        herramientasRequeridas: ["clang-21", "cmake"],
        estado: "en-pruebas",
        origen: "biblioteca",
        notas: "Cifras del autor, NO medidas por StarSeed; solo inglés según la ficha ⇒ medir español con el banco de capas antes de promoverlo; no sustituye a Ternary Bonsai (regla «1.58 primero»); no corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM. Tok/s Ref (sin límite): RPi5 28.77, RK3588 39.76, SD 8 Elite 78.99, i9-14900 108.17.",
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
        almacenamiento: { modo: "streaming-ssd", soloLocal: true },
        medios: ["nativo", "servidor"],
        servidor: { protocolo: "openai", url: "http://127.0.0.1:8794/v1" },
        licencia: "Apache-2.0",
        upstream: "https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF",
        so: ["Linux", "Android"],
        arquitecturas: ["arm64", "x86_64"],
        aceleradoresRequeridos: ["neon", "avx2", "avx512"],
        herramientasRequeridas: ["clang-21", "cmake"],
        estado: "en-pruebas",
        origen: "biblioteca",
        notas: "Cifras del autor, NO medidas por StarSeed; solo inglés según la ficha ⇒ medir español con el banco de capas antes de promoverlo; no sustituye a Ternary Bonsai (regla «1.58 primero»); no corre en la Mac de 8 GB ni en el A1 de Oracle sin liberar RAM; el 21B en modo limitado pide ≥ 8 GB de RAM libre y un SSD rápido con Linux o Android. Tok/s Ref (con 8 GB RAM): i9-14900 20.30, SD 8 Elite 15.50, RK3588 8.56.",
    },
];

export function maxNCached(limiteGiB: number): number {
    if (!Number.isFinite(limiteGiB) || limiteGiB <= 0) return 0;
    return Math.round(768 * limiteGiB);
}

export function isaDeProcCpuinfo(txt: string): { neon: boolean; dotprod: boolean; i8mm: boolean; avx2: boolean; avx512: boolean } {
    const lines = txt.toLowerCase().split("\n");
    let neon = false;
    let dotprod = false;
    let i8mm = false;
    let avx2 = false;
    let avx512 = false;

    for (const line of lines) {
        if (line.includes("features")) {
            if (line.includes("asimd")) neon = true;
            if (line.includes("asimddp")) dotprod = true;
            if (line.includes("i8mm")) i8mm = true;
        }
        if (line.includes("flags")) {
            if (line.includes("avx2")) avx2 = true;
            if (line.includes("avx512f")) avx512 = true;
        }
    }
    return { neon, dotprod, i8mm, avx2, avx512 };
}

export function elegirNucleoPowerInfer(isa: ReturnType<typeof isaDeProcCpuinfo>, arq: Arquitectura): { nucleo: "neon-dotprod" | "avx512" | "avx2" | "generico"; motivo: string } {
    if (arq === "arm64" && isa.neon && isa.dotprod) {
        return { nucleo: "neon-dotprod", motivo: "ARM64 con NEON y dotprod detectados" };
    }
    if (arq === "x86_64" && isa.avx512) {
        return { nucleo: "avx512", motivo: "x86_64 con AVX-512 detectado" };
    }
    if (arq === "x86_64" && isa.avx2) {
        return { nucleo: "avx2", motivo: "x86_64 con AVX2 detectado" };
    }
    return { nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada" };
}
